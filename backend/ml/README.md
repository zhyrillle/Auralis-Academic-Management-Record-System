# English next-term risk preview

This is a read-only, local research integration, not an operational alert system.
The Principal prediction and breakdown pages use the same saved nine-input Random
Forest export as the notebook and simulator. No fitting, threshold search,
notification, grade write, or prediction database write takes place.

## Run

1. Use Python **3.14.3** with `pip install -r backend/ml/requirements.txt`.
   On this development machine the notebook's existing Python already matches.
2. Set `AURALIS_MODEL_PYTHON` to that Python executable if needed. Windows uses
   the installed Python314 executable when present; otherwise the worker uses
   `python3`. Do not put credentials in this setting.
3. Start/restart the regular Node backend (`node server.js` in `backend`) and
   frontend (`npm run dev` in `frontend`). There is no separate public Python server.
4. Sign in as Principal, then open At-Risk Prediction or At-Risk Breakdown.
   Choose the **target** term and school year. Each preview request starts a private
   Python worker with feature values only, never learner names or identifiers.

`english-model.joblib` is the trusted export copied from the notebook's
`outputs/current/model.joblib`. It must be deployed together with
`model_metadata.json`. Do not load uploaded or third-party joblib files: loading
them executes Python code. Runtime mismatches fail closed.

## Input contract and pending teammate work

- English offerings and enrollments are scoped to the same school year and section.
- T2 uses T1; T3 uses T2. T1 has no within-year previous term and cannot be scored.
  No Overall mode, quarterly relabelling, cross-year fallback, or period skipping.
- Source term must have ended and precede the target term. Its sheet must be
  SUBMITTED and TERM_LOCKED with a saved official English `quarterly_grade`.
  Do not replace this with an initial grade or recompute the official grade.
  Older saved grades have a nullable enrollment id: match those only on the same
  learner, English offering (already tied to the selected section/year), and source
  term. Expose `sourceGradeId` and `gradeMatch`; never borrow another offering's grade.
- WW/PT percentages are derived from recorded raw scores and HPS using the existing
  grade helper. Unencoded/invalid scores block prediction; confirmed MISSING is zero;
  EXCUSED WW/PT is excluded. ST1, ST2 and TE must be mapped, unique, and complete.
- `qa_pct` is the existing English EXS **PS** (30×ST1/HPS1 + 30×ST2/HPS2 +
  40×TE/HPSTE), not the raw exam sum or subject-component WS. Component weights come
  from saved subject/year configuration. MAPEH is excluded.
- PHIL-IRI: complete `PHIL_IRI_SCREENING` results are matched to the exact enrollment
  year. The test must be taken, dated from the first term's start through the completed
  source term's end and before the target term, and have all three valid earned/HPS
  pairs. Missing, invalid, duplicated or out-of-period results leave all three inputs
  null with `phil_iri_unavailable = 1`. Oral Post-Test results are never substituted.
- Attendance: `AttendanceRiskFeatures` reads existing adviser SECTION sheets and
  learner entries, scoped to the same section, school year and completed source term.
  Datetime boundaries are converted to Manila dates; if the two terms meet on the
  same local day, that target-term day is excluded because daily entries cannot be
  separated by hour. No target-term attendance is included.
  It makes two batch SELECTs, not a new public API or per-learner read requests.
  Each source-term Monday-Friday date must have a valid P/A/L learner entry or an
  explicit HOLIDAY/SUSPENSION marker. Marked dates are excluded across duplicate
  sheets; agreeing duplicate entries count once, conflicting entries invalidate
  the rate. A contributes one absent day; P and L contribute zero absent days.
  `absence_rate = absentDays / classDays` on the 0-1 scale. The SF9 three-lates rule
  is not used: this input represents absence, not a disciplinary late conversion.
  Blanks and missing sheets are unknown, never presumed present or holidays. Missing,
  invalid or conflicting records, invalid/overlapping calendar dates, no class days,
  or recorded weekend classes leave this input null. Database errors fail the request
  instead of becoming a missing-value fallback. Learner records are never changed.
  There are no enrollment start/end dates or verified weekend schedules in the
  current schema. Consequently the adapter requires whole-source-term weekday
  coverage; it does not guess a shortened denominator for transfers/late enrollments.
  This conservative calendar policy follows the current attendance UI, not a claim
  that a complete official school calendar or transfer history exists. Historical
  half-day/excused marks cannot be represented by the current P/A/L enum and must
  not be synthesized. Support for them would require a separately approved change.
- The saved pipeline imputes these null values with **training** medians. It is never
  refitted on live records. Complete attendance supplies the real rate, including a
  genuine zero; only missing attendance is substituted. The current saved absence
  median is zero, but that is not evidence of perfect recorded attendance. Raw inputs
  remain null in API learner records, with `missingInputs` and `attendanceSummary`
  available for provenance. Deployment missingness and term transfer remain unvalidated;
  inference working is not validation.
- Task counts and coverage are not model inputs. No fictitious student fallback exists.

## Output and boundaries

`GET /api/principal/at-risk-prediction/preview` returns mode, subject, source/target
term, model version, threshold, generation time, warnings, scored learners and
unavailable learners separately. Bands: Low ≤0.30, Moderate >0.30 and <0.70,
High ≥0.70. `predictedAtRisk` uses the saved **0.35** threshold independently.
The UI shows Low/Medium/High labels, not numeric model scores. Internal scores are
not calibrated failure probabilities.

No notifications or automated decisions are made. School-year/term validation errors
are explicit 400 responses; source/model failures are 503, never empty-success results.
Unavailable learners do not enter risk counts. Figures describe score bands, not
observed failure rates. Predictions are regenerated from current records and are not
historical as-of snapshots. A future operational implementation needs prediction
persistence and actual next-term outcomes before measuring prospective performance.

The route reuses the project's temporary database-resolved user-id/role middleware
and restricts roles to Principal/System Admin. A claimed user-id header is **not secure
session authentication**. Keep this integration local/private until the team's real
session/JWT boundary protects it. Do not expose the preview publicly as production.

Quarter-trained performance and already-inspected TEST remain exploratory. New term
outcomes must be evaluated after the target term ends before relying on these alerts.

## Verify

- `node --test test/AttendanceRiskFeatures.test.js test/EnglishRiskFeatures.test.js test/AtRiskPrediction.test.js test/atRiskPredictionRoutes.test.js`
  from `backend`, then the existing `npm test` suite.
- `python -m unittest discover -s backend/ml -p "test_*.py"` from the repository root.
- Frontend targeted lint and `npm run build`.
