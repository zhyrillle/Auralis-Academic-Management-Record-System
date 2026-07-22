import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Save,
  X,
} from "lucide-react";
import "../styles/profile.css";

const initialProfile = {
  firstName: "Harvey",
  lastName: "Babia",
  email: "harveybabia@gmail.com",
  phone: "+63 902 772 1097",
  dateOfBirth: "1990-12-10",
  city: "Cagayan de Oro City",
  role: "Adviser",
  avatar: null,
};

const editableFields = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "email",
  "phone",
  "city",
];

const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxAvatarSize = 5 * 1024 * 1024;

const roleLabels = {
  admin: "System Administrator",
  "system-admin": "System Administrator",
  adviser: "Adviser",
  teacher: "Subject Teacher",
  subjectteacher: "Subject Teacher",
  "subject-teacher": "Subject Teacher",
  principal: "Principal",
  "department-head": "Department Head",
  departmenthead: "Department Head",
};

const getRoleLabel = (role) =>
  roleLabels[role?.toLowerCase()] || initialProfile.role;

const validateProfile = (profile) => {
  const errors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^\+?[0-9][0-9\s()-]{7,19}$/;

  if (!profile.firstName.trim()) {
    errors.firstName = "First name is required.";
  }

  if (!profile.lastName.trim()) {
    errors.lastName = "Last name is required.";
  }

  if (!emailPattern.test(profile.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!phonePattern.test(profile.phone.trim())) {
    errors.phone = "Enter a valid phone number.";
  }

  if (!profile.dateOfBirth) {
    errors.dateOfBirth = "Date of birth is required.";
  } else {
    const selectedDate = new Date(`${profile.dateOfBirth}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(selectedDate.getTime()) || selectedDate > today) {
      errors.dateOfBirth = "Enter a valid date of birth.";
    }
  }

  if (!profile.city.trim()) {
    errors.city = "City is required.";
  }

  return errors;
};

const formatDate = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

export default function Profile({ user }) {
  const [savedProfile, setSavedProfile] = useState(() => ({
    ...initialProfile,
    role: getRoleLabel(user?.role),
  }));
  const [draftProfile, setDraftProfile] = useState(() => ({
    ...initialProfile,
    role: getRoleLabel(user?.role),
  }));
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState(null);
  const [avatarError, setAvatarError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const fileInputRef = useRef(null);
  const pendingAvatarUrlRef = useRef(null);
  const savedAvatarUrlRef = useRef(null);

  const errors = useMemo(() => validateProfile(draftProfile), [draftProfile]);
  const hasProfileChanges = useMemo(
    () =>
      editableFields.some(
        (field) => draftProfile[field] !== savedProfile[field],
      ),
    [draftProfile, savedProfile],
  );
  const canSave = hasProfileChanges && Object.keys(errors).length === 0;
  const fullName = `${savedProfile.firstName} ${savedProfile.lastName}`;
  const initials = `${savedProfile.firstName[0] || ""}${savedProfile.lastName[0] || ""}`.toUpperCase();
  const displayedAvatar = pendingAvatar?.previewUrl || savedProfile.avatar;

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(
    () => () => {
      if (pendingAvatarUrlRef.current) {
        URL.revokeObjectURL(pendingAvatarUrlRef.current);
      }
      if (savedAvatarUrlRef.current) {
        URL.revokeObjectURL(savedAvatarUrlRef.current);
      }
    },
    [],
  );

  const showToast = (message) => {
    setToastMessage("");
    window.setTimeout(() => setToastMessage(message), 0);
  };

  const handleEdit = () => {
    setDraftProfile({ ...savedProfile });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftProfile({ ...savedProfile });
    setIsEditing(false);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setDraftProfile((currentProfile) => ({
      ...currentProfile,
      [name]: value,
    }));
  };

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    const normalizedProfile = {
      ...draftProfile,
      firstName: draftProfile.firstName.trim(),
      lastName: draftProfile.lastName.trim(),
      email: draftProfile.email.trim(),
      phone: draftProfile.phone.trim(),
      city: draftProfile.city.trim(),
    };

    setSavedProfile(normalizedProfile);
    setDraftProfile({ ...normalizedProfile });
    setIsEditing(false);
    showToast("Profile updated successfully.");
  };

  const openAvatarPicker = () => {
    setAvatarError("");
    fileInputRef.current?.click();
  };

  const discardPendingAvatar = () => {
    if (pendingAvatarUrlRef.current) {
      URL.revokeObjectURL(pendingAvatarUrlRef.current);
      pendingAvatarUrlRef.current = null;
    }
    setPendingAvatar(null);
    setAvatarError("");
  };

  const handleAvatarSelection = (event) => {
    const [file] = event.target.files;
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!acceptedImageTypes.includes(file.type)) {
      setAvatarError("Choose a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > maxAvatarSize) {
      setAvatarError("The image must be 5 MB or smaller.");
      return;
    }

    if (pendingAvatarUrlRef.current) {
      URL.revokeObjectURL(pendingAvatarUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    pendingAvatarUrlRef.current = previewUrl;
    setPendingAvatar({ file, previewUrl });
    setAvatarError("");
  };

  const confirmAvatar = () => {
    if (!pendingAvatar) {
      return;
    }

    if (savedAvatarUrlRef.current) {
      URL.revokeObjectURL(savedAvatarUrlRef.current);
    }

    savedAvatarUrlRef.current = pendingAvatar.previewUrl;
    pendingAvatarUrlRef.current = null;
    setSavedProfile((currentProfile) => ({
      ...currentProfile,
      avatar: pendingAvatar.previewUrl,
    }));
    setDraftProfile((currentProfile) => ({
      ...currentProfile,
      avatar: pendingAvatar.previewUrl,
    }));
    setPendingAvatar(null);
    showToast("Profile picture updated successfully.");
  };

  const readOnlyDetails = [
    { label: "First Name", value: savedProfile.firstName },
    { label: "Last Name", value: savedProfile.lastName },
    { label: "Date of Birth", value: formatDate(savedProfile.dateOfBirth) },
    { label: "Email Address", value: savedProfile.email },
    { label: "Phone Number", value: savedProfile.phone },
    { label: "City", value: savedProfile.city },
    { label: "User Role", value: savedProfile.role },
  ];

  return (
    <div className="profile-page">
      <header className="profile-page__heading">
        <h1>My Profile</h1>
        <p>Manage your personal and account information.</p>
      </header>

      <section className="profile-identity-card" aria-labelledby="profile-name">
        <div className="profile-avatar-area">
          <div className="profile-avatar-large">
            {displayedAvatar ? (
              <img src={displayedAvatar} alt={`${fullName} profile`} />
            ) : (
              <span aria-hidden="true">{initials}</span>
            )}
          </div>
          <button
            type="button"
            className="profile-camera-button"
            onClick={openAvatarPicker}
            aria-label="Choose a new profile picture"
            title="Change profile picture"
          >
            <Camera size={18} aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="profile-file-input"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={handleAvatarSelection}
          />
        </div>

        <div className="profile-identity-card__details">
          <div className="profile-identity-card__title-row">
            <h2 id="profile-name">{fullName}</h2>
            <span className="profile-role-badge">{savedProfile.role}</span>
            {isEditing && (
              <span className="profile-editing-indicator">Editing profile</span>
            )}
          </div>
          <div className="profile-identity-card__meta">
            <span>
              <Mail size={16} aria-hidden="true" />
              {savedProfile.email}
            </span>
            <span>
              <MapPin size={16} aria-hidden="true" />
              {savedProfile.city}
            </span>
          </div>

          {pendingAvatar && (
            <div className="profile-avatar-confirmation">
              <ImageIcon size={17} aria-hidden="true" />
              <span>New picture ready to use</span>
              <button type="button" onClick={discardPendingAvatar}>
                <X size={15} aria-hidden="true" />
                Cancel
              </button>
              <button type="button" onClick={confirmAvatar}>
                <Check size={15} aria-hidden="true" />
                Use photo
              </button>
            </div>
          )}
          {avatarError && (
            <p className="profile-avatar-error" role="alert">
              {avatarError}
            </p>
          )}
        </div>
      </section>

      <section className="profile-information-card" aria-labelledby="personal-info-title">
        <div className="profile-information-card__header">
          <div>
            <h2 id="personal-info-title">Personal Information</h2>
            <p>Your contact details and account information.</p>
          </div>

          <div className="profile-form-actions">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="profile-button profile-button--secondary"
                  onClick={handleCancel}
                >
                  <X size={17} aria-hidden="true" />
                  Cancel
                </button>
                <button
                  type="button"
                  className="profile-button profile-button--primary"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  <Save size={17} aria-hidden="true" />
                  Save Changes
                </button>
              </>
            ) : (
              <button
                type="button"
                className="profile-button profile-button--primary"
                onClick={handleEdit}
              >
                <Pencil size={17} aria-hidden="true" />
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <form className="profile-form" onSubmit={(event) => event.preventDefault()} noValidate>
            <label className="profile-field">
              <span>First Name</span>
              <input
                type="text"
                name="firstName"
                value={draftProfile.firstName}
                onChange={handleFieldChange}
                aria-invalid={Boolean(errors.firstName)}
                aria-describedby={errors.firstName ? "first-name-error" : undefined}
              />
              {errors.firstName && (
                <small id="first-name-error" role="alert">{errors.firstName}</small>
              )}
            </label>

            <label className="profile-field">
              <span>Last Name</span>
              <input
                type="text"
                name="lastName"
                value={draftProfile.lastName}
                onChange={handleFieldChange}
                aria-invalid={Boolean(errors.lastName)}
                aria-describedby={errors.lastName ? "last-name-error" : undefined}
              />
              {errors.lastName && (
                <small id="last-name-error" role="alert">{errors.lastName}</small>
              )}
            </label>

            <label className="profile-field">
              <span>Date of Birth</span>
              <input
                type="date"
                name="dateOfBirth"
                value={draftProfile.dateOfBirth}
                onChange={handleFieldChange}
                aria-invalid={Boolean(errors.dateOfBirth)}
                aria-describedby={errors.dateOfBirth ? "date-of-birth-error" : undefined}
              />
              {errors.dateOfBirth && (
                <small id="date-of-birth-error" role="alert">{errors.dateOfBirth}</small>
              )}
            </label>

            <label className="profile-field">
              <span>Email Address</span>
              <input
                type="email"
                name="email"
                value={draftProfile.email}
                onChange={handleFieldChange}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <small id="email-error" role="alert">{errors.email}</small>
              )}
            </label>

            <label className="profile-field">
              <span>Phone Number</span>
              <input
                type="tel"
                name="phone"
                value={draftProfile.phone}
                onChange={handleFieldChange}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "phone-error" : undefined}
              />
              {errors.phone && (
                <small id="phone-error" role="alert">{errors.phone}</small>
              )}
            </label>

            <label className="profile-field">
              <span>City</span>
              <input
                type="text"
                name="city"
                value={draftProfile.city}
                onChange={handleFieldChange}
                aria-invalid={Boolean(errors.city)}
                aria-describedby={errors.city ? "city-error" : undefined}
              />
              {errors.city && (
                <small id="city-error" role="alert">{errors.city}</small>
              )}
            </label>

            <div className="profile-field profile-field--locked">
              <span>User Role</span>
              <div className="profile-locked-value">
                <LockKeyhole size={17} aria-hidden="true" />
                {draftProfile.role}
              </div>
              <small>Managed by the System Administrator</small>
            </div>
          </form>
        ) : (
          <dl className="profile-details-grid">
            {readOnlyDetails.map((detail) => (
              <div key={detail.label} className="profile-detail">
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {toastMessage && (
        <div className="profile-toast" role="status" aria-live="polite">
          <CheckCircle2 size={19} aria-hidden="true" />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
