const express = require("express");
const { resolveCurrentUser } = require("../middleware/resolveCurrentUser");
const SectionDetailsService = require("../services/SectionDetailsService");

const router = express.Router();

router.use(resolveCurrentUser);

router.get("/:assignmentType/:assignmentId", async (req, res) => {
  try {
    const data = await SectionDetailsService.getSectionDetails({
      assignmentType: req.params.assignmentType,
      assignmentId: req.params.assignmentId,
      userId: req.currentUser.user_id,
      term: req.query.term || "T1",
    });
    return res.json(data);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Section Details request failed:", error);
    return res.status(statusCode).json({
      code: error.code || "SECTION_DETAILS_REQUEST_FAILED",
      message: statusCode >= 500
        ? "The Section Details request could not be completed."
        : error.message,
    });
  }
});

module.exports = router;
