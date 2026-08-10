import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Minus,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  getUserProfile,
  resolveProfilePictureUrl,
  updateUserProfile,
  updateUserProfilePicture,
} from "../services/userService";
import "../styles/profile.css";

const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxAvatarSize = 5 * 1024 * 1024;
const avatarOutputSize = 512;

const roleLabels = {
  admin: "System Administrator",
  "system-admin": "System Administrator",
  system_admin: "System Administrator",
  principal: "Principal",
  "department head": "Department Head",
  "department-head": "Department Head",
  department_head: "Department Head",
  "subject teacher": "Subject Teacher",
  "subject-teacher": "Subject Teacher",
  subject_teacher: "Subject Teacher",
  teacher: "Subject Teacher",
  adviser: "Adviser",
};

const emptyProfile = {
  userId: null,
  firstName: "",
  middleName: "",
  lastName: "",
  extensionName: "",
  email: "",
  role: "",
  accountStatus: "",
  lastLoginAt: null,
  avatar: null,
};

const getRoleLabel = (role) =>
  roleLabels[String(role || "").toLowerCase()] || role || "User";

const formatAccountStatus = (status) =>
  String(status || "Unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getAccountStatusTone = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "active") return "active";
  if (normalizedStatus === "inactive") return "inactive";
  return "neutral";
};

const mapApiUserToProfile = (user) => ({
  userId: user.user_id,
  firstName: user.first_name || "",
  middleName: user.middle_name || "",
  lastName: user.last_name || "",
  extensionName: user.extension_name || "",
  email: user.email || "",
  role: getRoleLabel(user.role),
  accountStatus: user.account_status || "active",
  lastLoginAt: user.last_login_at || null,
  avatar: resolveProfilePictureUrl(user.pfp_url),
});

const validateProfile = (profile) => {
  const errors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!profile.firstName.trim()) errors.firstName = "First name is required.";
  if (!profile.lastName.trim()) errors.lastName = "Last name is required.";
  if (!emailPattern.test(profile.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (profile.extensionName.trim().length > 20) {
    errors.extensionName = "Extension name must be 20 characters or fewer.";
  }

  return errors;
};

const formatDateTime = (dateValue) => {
  if (!dateValue) return "No login recorded";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "No login recorded";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
};

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export default function ProfilePage({ user, onUserUpdated }) {
  const [savedProfile, setSavedProfile] = useState(emptyProfile);
  const [draftProfile, setDraftProfile] = useState(emptyProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState(null);
  const [avatarError, setAvatarError] = useState("");
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState({ width: 1, height: 1 });
  const [cropViewportSize, setCropViewportSize] = useState(280);
  const [toastMessage, setToastMessage] = useState("");
  const fileInputRef = useRef(null);
  const pendingAvatarUrlRef = useRef(null);
  const cropStageRef = useRef(null);
  const cropGuideRef = useRef(null);
  const cropImageRef = useRef(null);
  const cropDragRef = useRef(null);

  const storedUser = useMemo(() => readStoredUser(), []);
  const userId = user?.user_id || storedUser?.user_id;
  const errors = useMemo(() => validateProfile(draftProfile), [draftProfile]);
  const hasProfileChanges = useMemo(
    () =>
      ["firstName", "middleName", "lastName", "extensionName", "email"].some(
        (field) => draftProfile[field] !== savedProfile[field],
      ),
    [draftProfile, savedProfile],
  );
  const canSave = hasProfileChanges && Object.keys(errors).length === 0 && !isSaving;
  const fullName = [
    savedProfile.firstName,
    savedProfile.middleName,
    savedProfile.lastName,
    savedProfile.extensionName,
  ]
    .filter(Boolean)
    .join(" ");
  const initials = `${savedProfile.firstName[0] || ""}${savedProfile.lastName[0] || ""}`.toUpperCase();
  const displayedAvatar = savedProfile.avatar;

  useEffect(() => {
    let isCurrent = true;

    const loadProfile = async () => {
      if (!userId) {
        setPageError("Please sign in again to view your profile.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setPageError("");
        const apiUser = await getUserProfile(userId);
        if (!isCurrent) return;
        const profile = mapApiUserToProfile(apiUser);
        setSavedProfile(profile);
        setDraftProfile(profile);
      } catch (error) {
        if (isCurrent) setPageError(error.message);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadProfile();
    return () => {
      isCurrent = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(
    () => () => {
      if (pendingAvatarUrlRef.current) {
        URL.revokeObjectURL(pendingAvatarUrlRef.current);
      }
    },
    [],
  );

  const showToast = (message) => {
    setToastMessage("");
    window.setTimeout(() => setToastMessage(message), 0);
  };

  const syncAuthenticatedUser = (apiUser) => {
    const nextUser = { ...(readStoredUser() || {}), ...apiUser };
    localStorage.setItem("user", JSON.stringify(nextUser));
    onUserUpdated?.(nextUser);
  };

  const handleEdit = () => {
    setDraftProfile({ ...savedProfile });
    setPageError("");
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftProfile({ ...savedProfile });
    setPageError("");
    setIsEditing(false);
  };

  const handleFieldChange = ({ target: { name, value } }) => {
    setDraftProfile((current) => ({ ...current, [name]: value }));
  };

  const handleSave = async () => {
    if (!canSave) return;

    try {
      setIsSaving(true);
      setPageError("");
      const updatedUser = await updateUserProfile(userId, {
        first_name: draftProfile.firstName.trim(),
        middle_name: draftProfile.middleName.trim() || null,
        last_name: draftProfile.lastName.trim(),
        extension_name: draftProfile.extensionName.trim() || null,
        email: draftProfile.email.trim(),
      });
      const updatedProfile = mapApiUserToProfile(updatedUser);
      setSavedProfile(updatedProfile);
      setDraftProfile(updatedProfile);
      setIsEditing(false);
      syncAuthenticatedUser(updatedUser);
      showToast("Profile updated successfully.");
    } catch (error) {
      setPageError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openAvatarPicker = () => {
    if (isAvatarUploading) return;
    setAvatarError("");
    fileInputRef.current?.click();
  };

  const clearPendingAvatar = () => {
    if (pendingAvatarUrlRef.current) {
      URL.revokeObjectURL(pendingAvatarUrlRef.current);
      pendingAvatarUrlRef.current = null;
    }
    setPendingAvatar(null);
    setCropZoom(1);
    setCropPosition({ x: 0, y: 0 });
    setCropImageSize({ width: 1, height: 1 });
    setCropViewportSize(280);
    setAvatarError("");
  };

  const discardPendingAvatar = () => {
    if (isAvatarUploading) return;
    clearPendingAvatar();
  };

  const handleAvatarSelection = ({ target }) => {
    const [file] = target.files;
    target.value = "";
    if (!file) return;

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
    setCropZoom(1);
    setCropPosition({ x: 0, y: 0 });
    setAvatarError("");
  };

  const getCropBounds = (zoom = cropZoom) => {
    const cropSize = cropGuideRef.current?.clientWidth || 0;
    const image = cropImageRef.current;
    if (!cropSize || !image?.naturalWidth || !image?.naturalHeight) {
      return { maxX: 0, maxY: 0 };
    }

    const baseScale = Math.max(
      cropSize / image.naturalWidth,
      cropSize / image.naturalHeight,
    );
    const renderedWidth = image.naturalWidth * baseScale * zoom;
    const renderedHeight = image.naturalHeight * baseScale * zoom;

    return {
      maxX: Math.max(0, (renderedWidth - cropSize) / 2),
      maxY: Math.max(0, (renderedHeight - cropSize) / 2),
    };
  };

  const clampCropPosition = (position, zoom = cropZoom) => {
    const { maxX, maxY } = getCropBounds(zoom);
    return {
      x: Math.min(maxX, Math.max(-maxX, position.x)),
      y: Math.min(maxY, Math.max(-maxY, position.y)),
    };
  };

  const handleCropPointerDown = (event) => {
    if (isAvatarUploading) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: cropPosition.x,
      originY: cropPosition.y,
    };
  };

  const handleCropPointerMove = (event) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setCropPosition(
      clampCropPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }),
    );
  };

  const stopCropDrag = (event) => {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCropZoomChange = ({ target }) => {
    const nextZoom = Number(target.value);
    setCropZoom(nextZoom);
    setCropPosition((current) => clampCropPosition(current, nextZoom));
  };

  const createCroppedAvatar = () => {
    const image = cropImageRef.current;
    const cropSize = cropGuideRef.current?.clientWidth || 0;
    if (!image?.naturalWidth || !image?.naturalHeight || !cropSize) {
      throw new Error("The selected image is not ready yet.");
    }

    const scale = Math.max(
      cropSize / image.naturalWidth,
      cropSize / image.naturalHeight,
    ) * cropZoom;
    const sourceSize = cropSize / scale;
    const sourceX = (image.naturalWidth - sourceSize) / 2 - cropPosition.x / scale;
    const sourceY = (image.naturalHeight - sourceSize) / 2 - cropPosition.y / scale;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = avatarOutputSize;
    canvas.height = avatarOutputSize;
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      avatarOutputSize,
      avatarOutputSize,
    );

    return canvas.toDataURL("image/webp", 0.9);
  };

  const cropPreviewScale = Math.max(
    cropViewportSize / cropImageSize.width,
    cropViewportSize / cropImageSize.height,
  );
  const cropPreviewWidth = cropImageSize.width * cropPreviewScale;
  const cropPreviewHeight = cropImageSize.height * cropPreviewScale;

  const confirmAvatar = async () => {
    if (!pendingAvatar || !userId) return;

    try {
      setIsAvatarUploading(true);
      setAvatarError("");
      const imageData = createCroppedAvatar();
      const updatedUser = await updateUserProfilePicture(userId, imageData);
      const updatedProfile = mapApiUserToProfile(updatedUser);
      setSavedProfile(updatedProfile);
      setDraftProfile(updatedProfile);
      syncAuthenticatedUser(updatedUser);
      clearPendingAvatar();
      showToast("Profile picture updated successfully.");
    } catch (error) {
      setAvatarError(error.message);
    } finally {
      setIsAvatarUploading(false);
    }
  };

  useEffect(() => {
    if (!pendingAvatar) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || isAvatarUploading) return;
      if (pendingAvatarUrlRef.current) {
        URL.revokeObjectURL(pendingAvatarUrlRef.current);
        pendingAvatarUrlRef.current = null;
      }
      setPendingAvatar(null);
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
      setCropImageSize({ width: 1, height: 1 });
      setCropViewportSize(280);
      setAvatarError("");
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingAvatar, isAvatarUploading]);

  if (isLoading) {
    return (
      <div className="profile-page">
        <div className="profile-state-card" role="status">
          <UserRound size={30} aria-hidden="true" />
          <h1>Loading profile</h1>
          <p>Retrieving your account information…</p>
        </div>
      </div>
    );
  }

  if (!savedProfile.userId && pageError) {
    return (
      <div className="profile-page">
        <div className="profile-state-card profile-state-card--error" role="alert">
          <ShieldCheck size={30} aria-hidden="true" />
          <h1>Profile unavailable</h1>
          <p>{pageError}</p>
        </div>
      </div>
    );
  }

  const readOnlyDetails = [
    { label: "First Name", value: savedProfile.firstName || "—" },
    { label: "Middle Name", value: savedProfile.middleName || "—" },
    { label: "Last Name", value: savedProfile.lastName || "—" },
    { label: "Extension Name", value: savedProfile.extensionName || "—" },
    { label: "Email Address", value: savedProfile.email || "—" },
    { label: "User Role", value: savedProfile.role },
    { label: "Account Status", value: savedProfile.accountStatus, isStatus: true },
    { label: "Last Login", value: formatDateTime(savedProfile.lastLoginAt) },
  ];

  return (
    <div className="profile-page">
      <header className="profile-page__heading">
        <h1>My Profile</h1>
        <p>Manage your personal and account information.</p>
      </header>

      {pageError && <div className="profile-page-error" role="alert">{pageError}</div>}

      <section className="profile-identity-card" aria-labelledby="profile-name">
        <div className="profile-avatar-area">
          <div className="profile-avatar-large" aria-busy={isAvatarUploading}>
            {displayedAvatar ? (
              <img src={displayedAvatar} alt={`${fullName} profile`} />
            ) : (
              <span aria-hidden="true">{initials || "AU"}</span>
            )}
            {isAvatarUploading && (
              <span className="profile-avatar-upload-overlay" role="status">
                <LoaderCircle size={28} aria-hidden="true" />
                <span>Uploading</span>
              </span>
            )}
          </div>
          <button type="button" className="profile-camera-button" onClick={openAvatarPicker} aria-label="Choose a new profile picture" title="Change profile picture" disabled={isAvatarUploading}>
            <Camera size={18} aria-hidden="true" />
          </button>
          <input ref={fileInputRef} type="file" className="profile-file-input" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleAvatarSelection} />
        </div>

        <div className="profile-identity-card__details">
          <div className="profile-identity-card__title-row">
            <h2 id="profile-name">{fullName}</h2>
            <span className="profile-role-badge">{savedProfile.role}</span>
            {isEditing && <span className="profile-editing-indicator">Editing profile</span>}
          </div>
          <div className="profile-identity-card__meta">
            <span><Mail size={16} aria-hidden="true" />{savedProfile.email}</span>
          </div>

          {avatarError && <p className="profile-avatar-error" role="alert">{avatarError}</p>}
        </div>
      </section>

      <section className="profile-information-card" aria-labelledby="personal-info-title">
        <div className="profile-information-card__header">
          <div>
            <h2 id="personal-info-title">Personal Information</h2>
            <p>Your personal details and account information.</p>
          </div>

          <div className="profile-form-actions">
            {isEditing ? (
              <>
                <button type="button" className="profile-button profile-button--secondary" onClick={handleCancel} disabled={isSaving}>
                  <X size={17} aria-hidden="true" />Cancel
                </button>
                <button type="button" className="profile-button profile-button--primary" onClick={handleSave} disabled={!canSave}>
                  <Save size={17} aria-hidden="true" />{isSaving ? "Saving…" : "Save Changes"}
                </button>
              </>
            ) : (
              <button type="button" className="profile-button profile-button--primary" onClick={handleEdit}>
                <Pencil size={17} aria-hidden="true" />Edit Profile
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <form className="profile-form" onSubmit={(event) => { event.preventDefault(); handleSave(); }} noValidate>
            <label className="profile-field">
              <span>First Name</span>
              <input type="text" name="firstName" value={draftProfile.firstName} onChange={handleFieldChange} aria-invalid={Boolean(errors.firstName)} />
              {errors.firstName && <small role="alert">{errors.firstName}</small>}
            </label>
            <label className="profile-field">
              <span>Middle Name</span>
              <input type="text" name="middleName" value={draftProfile.middleName} onChange={handleFieldChange} />
            </label>
            <label className="profile-field">
              <span>Last Name</span>
              <input type="text" name="lastName" value={draftProfile.lastName} onChange={handleFieldChange} aria-invalid={Boolean(errors.lastName)} />
              {errors.lastName && <small role="alert">{errors.lastName}</small>}
            </label>
            <label className="profile-field">
              <span>Extension Name</span>
              <input type="text" name="extensionName" value={draftProfile.extensionName} onChange={handleFieldChange} placeholder="e.g. Jr., Sr., III" aria-invalid={Boolean(errors.extensionName)} />
              {errors.extensionName && <small role="alert">{errors.extensionName}</small>}
            </label>
            <label className="profile-field">
              <span>Email Address</span>
              <input type="email" name="email" value={draftProfile.email} onChange={handleFieldChange} aria-invalid={Boolean(errors.email)} />
              {errors.email && <small role="alert">{errors.email}</small>}
            </label>
            <div className="profile-field profile-field--locked">
              <span>User Role</span>
              <div className="profile-locked-value"><LockKeyhole size={17} aria-hidden="true" />{draftProfile.role}</div>
              <small>Managed by the System Administrator</small>
            </div>
            <div className="profile-field profile-field--locked">
              <span>Account Status</span>
              <div className="profile-locked-value">
                <LockKeyhole size={17} aria-hidden="true" />
                <span className={`profile-account-status-badge profile-account-status-badge--${getAccountStatusTone(draftProfile.accountStatus)}`}>
                  {formatAccountStatus(draftProfile.accountStatus)}
                </span>
              </div>
              <small>Managed by the System Administrator</small>
            </div>
            <button className="profile-form-submit" type="submit">Save profile</button>
          </form>
        ) : (
          <dl className="profile-details-grid">
            {readOnlyDetails.map((detail) => (
              <div key={detail.label} className="profile-detail">
                <dt>{detail.label}</dt>
                <dd>
                  {detail.isStatus ? (
                    <span className={`profile-account-status-badge profile-account-status-badge--${getAccountStatusTone(detail.value)}`}>
                      {formatAccountStatus(detail.value)}
                    </span>
                  ) : detail.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {pendingAvatar && (
        <div
          className="profile-crop-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) discardPendingAvatar();
          }}
        >
          <section
            className="profile-crop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-crop-title"
          >
            <header className="profile-crop-modal__header">
              <div>
                <h2 id="profile-crop-title">Adjust profile picture</h2>
                <p>Drag and zoom the image to choose what will be visible.</p>
              </div>
              <button
                type="button"
                onClick={discardPendingAvatar}
                disabled={isAvatarUploading}
                aria-label="Close picture editor"
                autoFocus
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="profile-crop-modal__body">
              <div
                ref={cropStageRef}
                className="profile-crop-stage"
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={stopCropDrag}
                onPointerCancel={stopCropDrag}
              >
                <img
                  ref={cropImageRef}
                  src={pendingAvatar.previewUrl}
                  alt="Profile crop preview"
                  draggable="false"
                  onLoad={({ currentTarget }) => {
                    setCropImageSize({
                      width: currentTarget.naturalWidth,
                      height: currentTarget.naturalHeight,
                    });
                    setCropViewportSize(cropGuideRef.current?.clientWidth || 280);
                    setCropPosition({ x: 0, y: 0 });
                  }}
                  style={{
                    width: `${cropPreviewWidth}px`,
                    height: `${cropPreviewHeight}px`,
                    transform: `translate(calc(-50% + ${cropPosition.x}px), calc(-50% + ${cropPosition.y}px)) scale(${cropZoom})`,
                  }}
                />
                <span ref={cropGuideRef} className="profile-crop-guide" aria-hidden="true" />
                {isAvatarUploading && (
                  <div className="profile-crop-uploading" role="status">
                    <LoaderCircle className="profile-spinner" size={30} aria-hidden="true" />
                    <span>Saving photo…</span>
                  </div>
                )}
              </div>

              <label className="profile-crop-zoom">
                <Minus size={18} aria-hidden="true" />
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={cropZoom}
                  onChange={handleCropZoomChange}
                  disabled={isAvatarUploading}
                  aria-label="Zoom profile picture"
                />
                <Plus size={18} aria-hidden="true" />
              </label>

              {avatarError && <p className="profile-crop-error" role="alert">{avatarError}</p>}
            </div>

            <footer className="profile-crop-modal__footer">
              <button
                type="button"
                className="profile-button profile-button--secondary"
                onClick={discardPendingAvatar}
                disabled={isAvatarUploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="profile-button profile-button--primary"
                onClick={confirmAvatar}
                disabled={isAvatarUploading}
              >
                {isAvatarUploading && <LoaderCircle className="profile-spinner" size={16} aria-hidden="true" />}
                {isAvatarUploading ? "Saving…" : "Save photo"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {toastMessage && (
        <div className="profile-toast" role="status" aria-live="polite">
          <CheckCircle2 size={19} aria-hidden="true" />{toastMessage}
        </div>
      )}
    </div>
  );
}
