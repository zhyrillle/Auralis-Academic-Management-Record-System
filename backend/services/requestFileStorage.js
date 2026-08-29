const cloudinary = require("../config/cloudinary");

function uploadRequestFile(buffer, originalName) {
    const hasConfiguration =
        Boolean(process.env.CLOUDINARY_URL) ||
        Boolean(
            process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        );

    if (!hasConfiguration) {
        const error = new Error(
            "Cloudinary file storage is not configured."
        );
        error.code = "REQUEST_FILE_STORAGE_NOT_CONFIGURED";
        throw error;
    }

    return new Promise((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
            {
                folder: "auralis/request-files",
                resource_type: "auto",
                use_filename: true,
                unique_filename: true,
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!result?.secure_url) {
                    reject(
                        new Error(
                            "Cloudinary did not return a secure URL for the uploaded file."
                        )
                    );
                    return;
                }

                resolve({
                    publicId: result.public_id,
                    secureUrl: result.secure_url,
                    resourceType: result.resource_type,
                    format: result.format,
                    bytes: result.bytes,
                });
            }
        );

        upload.end(buffer);
    });
}

module.exports = {
    uploadRequestFile,
};