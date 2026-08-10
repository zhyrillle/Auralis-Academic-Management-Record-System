const API_BASE_URL = "http://localhost:5000/api";

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || "The request could not be completed.");
  }

  return data;
};

export const getUserProfile = async (userId) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/profile`);
  return parseResponse(response);
};

export const updateUserProfile = async (userId, profile) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });

  return parseResponse(response);
};

export const updateUserProfilePicture = async (userId, imageData) => {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/profile-picture`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageData }),
  });

  return parseResponse(response);
};

export const resolveProfilePictureUrl = (profilePictureUrl) => {
  if (!profilePictureUrl) return null;
  if (/^(https?:|data:)/.test(profilePictureUrl)) return profilePictureUrl;

  return `http://localhost:5000${profilePictureUrl.startsWith("/") ? "" : "/"}${profilePictureUrl}`;
};
