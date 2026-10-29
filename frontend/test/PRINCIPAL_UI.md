# Principal UI / real-record testing

Local changes form four reviewable groups; no commits, pushes or PRs are created.

1. Real records/errors: remove Performance preview imports and Analytics
   historical baselines; propagate database failures; add grade-count metadata
   for missing-term gaps versus genuine zero; use configured school years.
   Feedback distinguishes empty success from a failed request.
2. Shared charts/navigation: reuse FilterToolbar/DropdownSelect, fix line-chart
   domain labels and gaps, optional panel-filling bars, keyboard/hover donut
   animated connectors and wider independent pill paths advanced only by cursor
   movement, with a short settle when the cursor stops, eased entry/exit and
   reduced-motion support. Hovering with a stationary cursor does not animate them.
   Preserve English-only prediction controls and source terms.
3. Performance/Analytics styling: remove preview badges, apply navy/gold and
   section-band colors, distinct muted teacher/subject colors with solid lines and round markers, larger grade
   numbers, compact text-valued overview cards, taller subject chart and real empty rankings.
4. Feedback: reuse Principal overview cards, tables, progress bars, search and
   dropdowns; preserve anonymous comment filtering, survey text and rating precision.

Page keys and underlying HTTP reads use recordsVersion=2. Updated Principal
responses acknowledge that version, preventing an old running backend from
silently reintroducing samples. Old unverified snapshots are bypassed, not
deleted. Newly verified records remain usable through the existing offline cache.
Missing historical comparisons/differences are unavailable; available-year
records stay visible. Recorded zero is not classified as a missing grade.

## Safe verification

Backend tests VM-load real modules with SELECT-only substitutes. Browser tests
intercept all APIs and block external traffic. They never contact the school DB.

From backend:

    node --test test/PrincipalRealRecords.test.js
    node --test test/DeptHeadMonitoring.test.js
    node --test test/reportRoutes.test.js

From frontend:

    node test/principalRealRecords.test.mjs
    node test/navigationPages.test.mjs
    node test/navigationCache.test.mjs
    node test/atRiskPresentation.test.mjs
    node test/principalUi.browser.test.mjs
    node test/principalRefresh.browser.test.mjs
    node test/offlineCache.browser.test.mjs
    node test/departmentHead.browser.test.mjs
    node test/studentManagement.browser.test.mjs
    npm run build

Browser tests require Playwright/Chromium or PLAYWRIGHT_MODULE_PATH and
BROWSER_CHANNEL overrides as in the existing regressions. Principal checks cover
1366x768, 1920x1080 and 390x844, reduced motion, keyboard/hover, empty/error/
malformed results, missing historical years, zero, retries, filters, old-cache
bypass, verified offline records and unsent-work preservation. Existing account,
logout, System Admin, Department Head and adviser regressions remain intact.
Focused source lint and frontend build pass; the existing bundle-size warning remains.

## Background updates

Visible cached queries check for updates every 60 seconds and when the user returns
to the tab/window. Principal performance, analytics and feedback retain usable
content and controls during these checks, applying new results without resetting
filters or scroll. Only a filter change awaiting its own results uses the content
overlay; initial reads without any usable data retain the loading skeleton.

Cache subscribers receive completion even when the response has not changed.
The refresh regression uses a virtual clock and intercepted responses to check
the one-minute interval, unchanged/changed/failed reads, overlapping requests,
filter transitions, hidden tabs and return refreshes without contacting school data.

Validation of the refresh fix: the dedicated refresh browser regression, Principal
data contracts, focused lint and frontend build pass. The broader Principal UI
suite currently expects the absent text "No recorded grades for this term";
the offline-cache suite fails because an existing fallback hides a 403 rejection.
Both failures were reproduced using the committed source as well as the refresh
changes. Those separate behaviors are outside this loading fix.

## Handoff

Restart the backend normally to load the new response contract. It was not
restarted in testing because startup may initialize the school database. Updated
Principal pages deliberately reject old response formats until the restart.

No school database records, deliberately saved demo learners, permissions,
grading/prediction formulas, drafts or queued edits were modified.
Unrelated package-lock edits, CodeQualityReview.md and Design.md remain untouched.
VS Code unsaved copies were neither saved nor discarded. Existing query
scope/year/enrollment issues and grade-based versus model-based risk definitions
were not expanded into this UI task.

## SF10 follow-up

The SF10 report route now imports the existing shared database connection,
fixing its immediate `db is not defined` failure. Its queries, response structure,
grade calculations and export behavior are unchanged. Four isolated SF10 tests
pass using SELECT-only substitutes; no school database connection is created.
The separate existing SF9 regression suite currently fails during test setup
because its encryption dependency is not stubbed. SF9 files were not changed.

## Grading follow-up scope

Subject Teacher → Adviser submission now uses existing SCORE, STUDENT_GRADE,
GRADE_SHEET, audit and notification tables. The separate Adviser → Principal
report-submission proposal and its unapplied migration were removed. Principal
report tracking is not claimed as implemented. See
backend/docs/teacher-adviser-grade-flow.md for the revised behavior and tests.
