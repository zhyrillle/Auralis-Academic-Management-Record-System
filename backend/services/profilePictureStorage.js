const cloudinary = require("../config/cloudinary");

function uploadProfilePicture(buffer, userId) {
  const hasConfiguration =
    Boolean(process.env.CLOUDINARY_URL) ||
    Boolean(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
    );

  if (!hasConfiguration) {
    const error = new Error(
      "Shared profile-picture storage is not configured.",
    );
    error.code = "PROFILE_STORAGE_NOT_CONFIGURED";
    throw error;
  }

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: "auralis/profile-pictures",
        public_id: `user-${userId}`,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url) {
          reject(new Error("The image provider did not return a secure URL."));
          return;
        }

        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
        });
      },
    );

    upload.end(buffer);
  });
}

module.exports = {
  uploadProfilePicture,
};
