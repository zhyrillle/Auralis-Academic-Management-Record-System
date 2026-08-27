const User = require('../models/User');

const ROLE_ALIASES = {
  admin: 'system_admin',
  'system administrator': 'system_admin',
  system_admin: 'system_admin',
};

function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[normalized] || normalized.replace(/\s+/g, '_');
}

/**
 * Temporary authentication boundary for modules that are being integrated
 * before the team's real session/JWT middleware is available.
 *
 * The frontend sends only the current user id. The backend still resolves the
 * user and role from the database; privileged identity is never accepted from
 * the request body. Replace this middleware later without changing services.
 */
async function resolveCurrentUser(req, res, next) {
  try {
    const rawUserId = req.get('X-Auralis-User-Id');
    const userId = Number(rawUserId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'A signed-in user is required.',
      });
    }

    const user = await User.findById(userId);
    if (!user || String(user.account_status).toLowerCase() !== 'active') {
      return res.status(401).json({
        code: 'INVALID_USER',
        message: 'The signed-in user is unavailable or inactive.',
      });
    }

    req.currentUser = {
      ...user,
      normalized_role: normalizeRole(user.role),
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireSystemAdmin(req, res, next) {
  if (req.currentUser?.normalized_role !== 'system_admin') {
    return res.status(403).json({
      code: 'SYSTEM_ADMIN_REQUIRED',
      message: 'Only a System Administrator can perform this action.',
    });
  }

  return next();
}

module.exports = { resolveCurrentUser, requireSystemAdmin };
