const express = require("express");
const router = express.Router();

const db = require("../config/db");
const GradeReopenRequest = require("../models/GradeReopenRequest");

const uploadRequestFile = require("../middleware/uploadRequestFile");
const {
  uploadRequestFile: uploadToCloudinary,
} = require("../services/requestFileStorage");


// ============================================================
// GET ALL REQUESTS
// ============================================================

router.get("/", async (req, res) => {
  try {
    const requests = await GradeReopenRequest.findAll();
    res.json(requests);
  } catch (err) {
    console.error(
      "[ERROR ROUTE] GET /api/reopen-requests:",
      err.message,
      err.stack
    );

    res.status(500).json({
      error: err.message,
    });
  }
});


// ============================================================
// GET REQUESTS BY USER
// ============================================================

router.get("/user/:userId", async (req, res) => {
  try {
    const requests = await GradeReopenRequest.findByUserId(
      req.params.userId
    );

    res.json(requests);
  } catch (err) {
    console.error(
      `[ERROR ROUTE] GET /api/reopen-requests/user/${req.params.userId}:`,
      err.message,
      err.stack
    );

    res.status(500).json({
      error: err.message,
    });
  }
});


// ============================================================
// GET REQUEST BY ID
// ============================================================

router.get("/:id", async (req, res) => {
  try {
    const request = await GradeReopenRequest.findById(
      req.params.id
    );

    if (!request) {
      return res.status(404).json({
        message: "Reopen Request not found",
      });
    }

    res.json(request);
  } catch (err) {
    console.error(
      "[ERROR ROUTE] GET /api/reopen-requests/:id:",
      err.message
    );

    res.status(500).json({
      error: err.message,
    });
  }
});


// ============================================================
// CREATE REOPEN REQUEST
// ============================================================

router.post(
  "/",
  (req, res, next) => {
    uploadRequestFile.single("supporting_file")(req, res, (err) => {
      if (err) {
        console.error("[ERROR ROUTE] Multer upload error:", err);
        return res.status(400).json({
          error: err.message || "File upload error",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      console.log(
        "[DEBUG POST] /api/reopen-requests body:",
        req.body
      );

      console.log(
        "[DEBUG POST] Uploaded file:",
        req.file
          ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
          : "No file"
      );


      // --------------------------------------------------------
      // 1. GET VALUES FROM FORM DATA
      // --------------------------------------------------------

      const {
        teacher_assignment_id,
        reason,
        status,
      } = req.body;


      // --------------------------------------------------------
      // 2. VALIDATE TEACHER ASSIGNMENT
      // --------------------------------------------------------

      if (!teacher_assignment_id) {
        return res.status(400).json({
          error: "Teacher Assignment ID is required.",
        });
      }


      // --------------------------------------------------------
      // 3. VALIDATE REASON
      // --------------------------------------------------------

      if (!reason || !reason.trim()) {
        return res.status(400).json({
          error: "Reason is required.",
        });
      }


      // --------------------------------------------------------
      // 4. CHECK EXISTING PENDING REQUEST
      // --------------------------------------------------------

      const existing =
        await GradeReopenRequest.checkExistingRequest(
          teacher_assignment_id
        );

      if (existing) {
        return res.status(400).json({
          error:
            "You have already submitted a reopening request for this section.",
        });
      }


      // --------------------------------------------------------
      // 5. FIND GRADE SHEET FROM TEACHER ASSIGNMENT
      //
      // TEACHER_ASSIGNMENT -> subject_offering_id -> GRADE_SHEET
      // --------------------------------------------------------

      const [gsRows] = await db.execute(
        `
        SELECT
          ta.teacher_assignment_id,
          ta.subject_offering_id,
          gs.grade_sheet_id,
          gs.term_id

        FROM TEACHER_ASSIGNMENT ta

        INNER JOIN GRADE_SHEET gs
          ON ta.subject_offering_id = gs.subject_offering_id

        WHERE ta.teacher_assignment_id = ?

        ORDER BY gs.grade_sheet_id DESC
        LIMIT 1
        `,
        [teacher_assignment_id]
      );


      // --------------------------------------------------------
      // 7. MAKE SURE GRADE SHEET EXISTS
      // --------------------------------------------------------

      if (gsRows.length === 0) {
        return res.status(400).json({
          error:
            "No grade sheet found for this teacher assignment and term.",
        });
      }


      const gradeSheetId =
        gsRows[0].grade_sheet_id;


      // --------------------------------------------------------
      // 8. UPLOAD FILE TO CLOUDINARY
      // --------------------------------------------------------

      let fileData = {
        file_name: null,
        file_path: null,
        file_type: null,
        file_size: null,
      };


      if (req.file) {
        const cloudinaryResult =
          await uploadToCloudinary(
            req.file.buffer,
            req.file.originalname
          );

        fileData = {
          file_name: req.file.originalname,

          // Store Cloudinary URL in file_path
          file_path: cloudinaryResult.secureUrl,

          file_type: req.file.mimetype,

          file_size: req.file.size,
        };
      }


      // --------------------------------------------------------
      // 9. CREATE DATABASE PAYLOAD
      // --------------------------------------------------------

      const payload = {
        grade_sheet_id: gradeSheetId,

        teacher_assignment_id:
          Number(teacher_assignment_id),

        reason: reason.trim(),

        status: status || "PENDING",

        file_name: fileData.file_name,

        file_path: fileData.file_path,

        file_type: fileData.file_type,

        file_size: fileData.file_size,

        requested_at: new Date()
          .toISOString()
          .slice(0, 19)
          .replace("T", " "),
      };


      // --------------------------------------------------------
      // 10. INSERT INTO DATABASE
      // --------------------------------------------------------

      const id =
        await GradeReopenRequest.create(payload);


      // --------------------------------------------------------
      // 11. RESPONSE
      // --------------------------------------------------------

      res.status(201).json({
        message:
          "Reopen Request submitted successfully",

        request_id: id,

        file: fileData.file_name
          ? {
            name: fileData.file_name,
            url: fileData.file_path,
            type: fileData.file_type,
            size: fileData.file_size,
          }
          : null,
      });

    } catch (err) {

      console.error(
        "[ERROR ROUTE] POST /api/reopen-requests:",
        err.message,
        err.stack
      );


      // Multer errors
      if (err instanceof Error) {

        if (
          err.message.includes("File too large")
        ) {
          return res.status(400).json({
            error:
              "File size exceeds maximum allowed limit of 10MB.",
          });
        }

        if (
          err.message.includes(
            "Only PDF, JPG, and PNG files are allowed"
          )
        ) {
          return res.status(400).json({
            error:
              "Only PDF, JPG, and PNG files are allowed.",
          });
        }
      }


      res.status(500).json({
        error: err.message,
      });
    }
  }
);


// ============================================================
// UPDATE REQUEST
// ============================================================

router.put("/:id", async (req, res) => {
  try {

    const updated =
      await GradeReopenRequest.update(
        req.params.id,
        req.body
      );

    res.json(updated);

  } catch (err) {

    console.error(
      "[ERROR ROUTE] PUT /api/reopen-requests/:id:",
      err.message
    );

    res.status(500).json({
      error: err.message,
    });
  }
});


// ============================================================
// DELETE REQUEST
// ============================================================

router.delete("/:id", async (req, res) => {
  try {

    const success =
      await GradeReopenRequest.delete(
        req.params.id
      );

    if (!success) {
      return res.status(404).json({
        message: "Reopen Request not found",
      });
    }

    res.json({
      message:
        "Reopen Request deleted successfully",
    });

  } catch (err) {

    console.error(
      "[ERROR ROUTE] DELETE /api/reopen-requests/:id:",
      err.message
    );

    res.status(500).json({
      error: err.message,
    });
  }
});


module.exports = router;