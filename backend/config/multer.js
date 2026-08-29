const multer = require("multer");

// Store uploaded files temporarily in memory.
// This allows us to send the buffer directly to Cloudinary.
const storage = multer.memoryStorage();

// Maximum file size: 10 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const allowedMimeTypes = [
    "application/pdf",

    // Microsoft Word
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    // Images
    "image/jpeg",
    "image/png",
    "image/jpg",
];

const fileFilter = (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(
            new Error(
                "Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG files are allowed."
            ),
            false
        );
    }

    cb(null, true);
};

const uploadRequestFile = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
});

module.exports = {
    uploadRequestFile,
};