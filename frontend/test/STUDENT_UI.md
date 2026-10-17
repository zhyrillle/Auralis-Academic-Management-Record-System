# Student-management UI checks

Both System Admin student pages reuse the existing `DropdownSelect`, `SearchBar`,
`StatCard`, `ProgressBar`, `EmptyState`, `Toast`, and shared read cache.
`OverlayPanel` supplies the shared animated modal/drawer shell; `SegmentedControl`
and `TablePagination` are reused across the page views and drawer workspaces.

Manage Students is the directory for **all** learner profiles, not a directory
limited to specialized programs. Section membership is handled separately.
The capacity bar is a visual 40–45-student guide; it is not a new database limit.
Its colors are green below 40, yellow at 40–45, and red above 45; no capacity
status text is shown. No backend route or schema change is required.
Section cards retain their original name/grade layout with Manage, View, and a
confirmed Delete action. Assignment dialogs include section search. Student
directory rows open profiles by pointer or keyboard; edit/delete actions do not
trigger the row. Residential address fields stay in the same student form.

Run from `frontend/`:

```sh
node --test test/studentSections.test.mjs test/navigationCache.test.mjs
node test/navigationPages.test.mjs
node test/studentManagement.browser.test.mjs
npm run build
```

The browser test uses Playwright with a temporary profile and intercepted,
synthetic API responses. It does not access the school database. It verifies
section creation/editing/removal, drawer add/remove flows, assignment selection
across pages, profile drawers, validation and rejected saves, and layout at
1366×768 and 1920×1080. It also writes sample-data screenshots to a temporary
folder, or `UI_ARTIFACT_DIR` if provided.

For an externally provided Playwright runtime, set `PLAYWRIGHT_MODULE_PATH` to
its `index.mjs`. `BROWSER_CHANNEL=msedge` uses the installed Microsoft Edge.
User Management reuses the same native overlay for account drawers and its
compact, bottom-anchored profile box. Directory rows support pointer and
keyboard activation; Edit/Delete remain independent actions. Tests cover
delayed profile responses after closing, adviser eligibility, teaching assignment
payloads, and rejected saves without accessing the school database.
Drawer success feedback floats above the footer without shifting content.
Profile spacing is compact, field focus rings stay inside scrollable content,
and G7–G10 section badges use consistent per-grade colors (blue, green, amber,
and violet). A held-refresh test checks that saving never briefly clears the
drawer count or eligible learners. Audit activity text uses a shared one-line
hover/focus scrolling component and respects reduced-motion preferences.
No new production dependency or package-lock change is needed for these checks.

Student additions show loading icons in the active row and bulk action, and
retain them through the post-save refresh. The browser checks both paths with
deliberately held reads. Program-column pills reuse Badge with one shared color
mapping for STE, SPJ, SPA, and EBEC across both student tables. Activity scrolling
uses a faster 60px/s timing basis with a four-second minimum loop.

After integrating main's LRN privacy update, both tables and learner profiles
reuse MaskedLrn. Checks verify masked defaults, reveal/hide, retained copy
controls, and that revealing an LRN does not open the clickable profile row.

Collapsed sidebar groups reuse their existing navigation entries in an anchored
native popover. Checks cover both student destinations, keyboard navigation,
Escape/focus restoration, outside dismissal, active links, viewport bounds, and
cleanup when switching back to the expanded sidebar.
The flyout has no repeated heading, centers its full container on the trigger,
connects to the sidebar through a centered navy tail, and pops out using a
scale-and-overshoot transition without sliding. Collapsed
icons share one center line, and reduced-motion settings disable the transition.
Selected destinations use a white background and navy text without a gold accent.
