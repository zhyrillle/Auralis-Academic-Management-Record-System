const express = require("express");
const MasterSheetService = require("../services/MasterSheetService");
const MasterSheetWorkbookService = require("../services/MasterSheetWorkbookService");

const router = express.Router();

const handleError = (error, res) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) console.error("Master Sheet request failed:", error);
  return res.status(statusCode).json({
    error: error.code || "MASTER_SHEET_REQUEST_FAILED",
    message: statusCode >= 500
      ? "The Master Sheet request could not be completed."
      : error.message,
  });
};

router.get("/options", async (req, res) => {
  try {
    const assignments = await MasterSheetService.getOptions(req.query.user_id);
    return res.json({ assignments });
  } catch (error) {
    return handleError(error, res);
  }
});

router.get("/:adviserAssignmentId/download", async (req, res) => {
  try {
    const data = await MasterSheetService.getMasterSheet(
      req.params.adviserAssignmentId,
      req.query.user_id,
    );
    const { buffer, filename } = await MasterSheetWorkbookService.generate(data);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (error) {
    return handleError(error, res);
  }
});

router.get("/:adviserAssignmentId", async (req, res) => {
  try {
    const data = await MasterSheetService.getMasterSheet(
      req.params.adviserAssignmentId,
      req.query.user_id,
    );
    return res.json(data);
  } catch (error) {
    return handleError(error, res);
  }
});

module.exports = router;
