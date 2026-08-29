const express = require('express');
const router = express.Router();
const AtRiskPrediction = require('../models/AtRiskPrediction');

/**
 * GET /api/principal/at-risk-prediction/summary
 * Query params: schoolYear, term, gradeLevel
 */
router.get('/summary', async (req, res) => {
  try {
    const { schoolYear, term, gradeLevel } = req.query;
    const summary = await AtRiskPrediction.getSummary({ schoolYear, term, gradeLevel });
    res.json(summary);
  } catch (err) {
    console.error("Error in /api/principal/at-risk-prediction/summary:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/principal/at-risk-prediction/students
 * Query params: schoolYear, term, gradeLevel, riskLevel, limit
 */
router.get('/students', async (req, res) => {
  try {
    const { schoolYear, term, gradeLevel, riskLevel, limit } = req.query;
    if (!riskLevel) {
      return res.status(400).json({ error: "riskLevel is required (e.g. 'high', 'medium', 'low')" });
    }
    const result = await AtRiskPrediction.getStudentsByRiskLevel({
      schoolYear,
      term,
      gradeLevel,
      riskLevel: riskLevel.toLowerCase(),
      limit,
    });
    res.json(result);
  } catch (err) {
    console.error("Error in /api/principal/at-risk-prediction/students:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/principal/at-risk-prediction/breakdown
 * Query params: schoolYear, term
 */
router.get('/breakdown', async (req, res) => {
  try {
    const { schoolYear, term } = req.query;
    const data = await AtRiskPrediction.getBreakdownData({ schoolYear, term });
    res.json(data);
  } catch (err) {
    console.error("Error in /api/principal/at-risk-prediction/breakdown:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
