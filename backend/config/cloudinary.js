const { v2: cloudinary } = require("cloudinary");

const hasSeparateCredentials =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (hasSeparateCredentials) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  // Cloudinary parses the official cloudinary://key:secret@cloud URL itself.
  cloudinary.config(true);
}

module.exports = cloudinary;
