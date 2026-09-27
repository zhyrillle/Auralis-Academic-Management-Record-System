const multer = require("multer");

const storage = multer.memoryStorage();

const uploadRequestFile = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png",
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(
                new Error("Only PDF, JPG, and PNG files are allowed.")
            );
        }

        cb(null, true);
    },
});

module.exports = uploadRequestFile;