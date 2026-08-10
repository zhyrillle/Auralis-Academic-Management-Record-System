const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SectionAdviserAssignment = require('../models/SectionAdviserAssignment');
const { uploadProfilePicture } = require('../services/profilePictureStorage');

const imageExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const isValidUserId = (id) => /^\d+$/.test(String(id));

const sendDatabaseError = (res, err) => {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That email address is already in use.' });
  }
  return res.status(500).json({ error: err.message });
};

const sendProfilePictureError = (res, err) => {
  if (err.code === 'PROFILE_STORAGE_NOT_CONFIGURED') {
    return res.status(503).json({
      error: 'Shared profile-picture storage is not configured on the backend.',
    });
  }

  const providerMessage = String(err.message || '').toLowerCase();
  const credentialsRejected =
    err.http_code === 401 ||
    providerMessage.includes('api key') ||
    providerMessage.includes('signature') ||
    providerMessage.includes('cloud name');

  if (credentialsRejected) {
    console.error('Profile picture storage credentials were rejected:', err.message);
    return res.status(502).json({
      error: 'Shared image storage rejected the backend credentials. Check the Cloudinary configuration and restart the backend.',
    });
  }

  console.error('Profile picture upload failed:', err.message);
  return res.status(502).json({
    error: `The profile picture could not be uploaded: ${err.message || 'unknown storage error'}`,
  });
};

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const safeUser = await User.updateLastLogin(user.user_id);

    // Check if the user is assigned as an adviser in SECTION_ADVISER_ASSIGNMENT or SECTION table
    const adviserAssignments = await SectionAdviserAssignment.findByUserId(safeUser.user_id);
    if (adviserAssignments && adviserAssignments.length > 0) {
      safeUser.is_adviser = true;
      safeUser.adviser_assignment = adviserAssignments[0];
      safeUser.role = 'adviser';
    }

    res.json({ message: 'Login successful', user: safeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return only profile-safe account fields. Passwords are never returned.
router.get('/:id/profile', async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

// Profile users may update personal information, but never role, status, or password.
router.put('/:id/profile', async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  const {
    first_name,
    middle_name,
    last_name,
    extension_name,
    email,
  } = req.body;

  if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
    return res.status(400).json({
      error: 'First name, last name, and email are required.',
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  if (extension_name && extension_name.trim().length > 20) {
    return res.status(400).json({
      error: 'Extension name must be 20 characters or fewer.',
    });
  }

  try {
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) return res.status(404).json({ error: 'User not found' });

    const updatedUser = await User.updateProfile(req.params.id, {
      first_name: first_name.trim(),
      middle_name: middle_name?.trim() || null,
      last_name: last_name.trim(),
      extension_name: extension_name?.trim() || null,
      email: email.trim().toLowerCase(),
    });
    res.json(updatedUser);
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

// Upload a validated profile image to shared storage and save its HTTPS URL.
router.put('/:id/profile-picture', async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  const { imageData } = req.body;
  const match = typeof imageData === 'string'
    ? imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
    : null;

  if (!match || !imageExtensions[match[1]]) {
    return res.status(400).json({ error: 'Choose a valid JPG, PNG, or WebP image.' });
  }

  const imageBuffer = Buffer.from(match[2], 'base64');
  if (!imageBuffer.length || imageBuffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'The image must be 5 MB or smaller.' });
  }

  try {
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) return res.status(404).json({ error: 'User not found' });

    const uploadedPicture = await uploadProfilePicture(
      imageBuffer,
      req.params.id
    );
    const updatedUser = await User.updateProfilePicture(
      req.params.id,
      uploadedPicture.secureUrl
    );
    res.json(updatedUser);
  } catch (err) {
    sendProfilePictureError(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await User.create(req.body);
    res.status(201).json({ message: 'User created successfully', user_id: id });
  } catch (err) {
    if (err.message.includes('Invalid role')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const adviserAssignments = await SectionAdviserAssignment.findByUserId(user.user_id);
    if (adviserAssignments && adviserAssignments.length > 0) {
      user.is_adviser = true;
      user.adviser_assignment = adviserAssignments[0];
      user.role = 'adviser';
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await User.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('Invalid role')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await User.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
