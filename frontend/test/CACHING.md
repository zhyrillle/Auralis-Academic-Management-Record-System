# Shared cache and offline-work rules

The existing `navigationCache.js`, `useCachedQuery.js`, and `offline/syncManager.js`
remain the shared implementation. Do not create another cache per page or role.
All current authenticated pages that load JSON records now use this shared cache,
either through `useCachedQuery`/`loadCached` or `cachedApiFetch`. Pages retain their
existing layouts and editing state. Authentication screens, file downloads, and
live reopening-permission checks do not reuse cached page responses.

Coverage includes all three dashboards (teacher/adviser, department head, system
admin), assigned sections and learners, Class Record, Attendance, PHIL-IRI,
Master Sheet, performance and analytics, feedback and evaluation lists, reopening
requests, department notifications, profile, grading configuration, and SF9/SF10
record reads. Adviser notifications currently contain static sample content, so
there is no server read to cache on that screen.

`cachedApiFetch` caches successful JSON GET responses and returns a fresh Response
for each consumer. Keys include the request URL/query, relevant headers and the
existing account/session scope. HTTP errors and non-JSON responses pass through
without becoming cached page data. Existing API services already supporting
offline writes retain that behavior; previously native online-only writes use
`queueOffline: false` and continue to report connection failures normally.

## Data lifetime

| Data | Navigation / refresh | Logout |
| --- | --- | --- |
| Page responses | Memory serves cached data immediately while revalidating, with a two-second throttle for repeated reads. Visible queries check every 60 seconds and on return to the tab/window. IndexedDB can supply an unexpired response while the server refreshes it or when the network fails. Persistent copies expire after 24 hours by default. | Memory and persistent page copies are cleared; old-session requests cannot recreate them. |
| Pending offline edits | Remain in the existing IndexedDB outbox and score overlay, tied to the account and role that created them. | Retained for that original account. They are not displayed or sent by a different account. |
| PHIL-IRI local backups and SF9 comment drafts | Existing local-draft workflows remain, with account and school-year keys. | Retained for their original account, not treated as disposable page responses. |
| Application assets / harmless preferences | Normal browser behavior. | Not cleared by this implementation. |

Fresh network results replace the persistent copy. Successful server writes and
completed outbox syncs invalidate cached reads. Queuing an offline write retains
the existing server snapshot so the class record can still restore its pending
score overlay. HTTP rejections are not network failures. Explicit query refreshes
bypass the underlying HTTP cache too, so Refresh retrieves current server data.
Existing page loading indicators may still render briefly while cached responses
are applied; a fresh cached revisit does not need another server request.

Academic Periods & Deadlines uses the same `useCachedQuery` subscription as the
other cached management views. After a browser reload it displays an unexpired
saved context as soon as IndexedDB restores it, while the server request continues
in the background. A full skeleton is only needed until a usable context is
available. School-year keys remain separate, and explicit refreshes after deadline
or reopening changes still retrieve current server records.

Page requests share a session abort signal. Logout or an account switch aborts
pending browser requests and prevents late results from entering the next session.
Individual components may cancel their own wait without cancelling a shared read
that another component still needs. The backend may already have processed an
in-flight request before browser cancellation arrives.

The sidebar waits for the class record's pending typing buffer to be persisted
before logout. If that fails, logout stops and explains that the work needs saving.
Signing out in another tab also clears read-cache state and resets the displayed
session. Late requests from the previous session are quietly cancelled; the active
account's page loads automatically, without asking the user to reopen the site.
Refreshing while typing still requires care: the page warns while its
score buffer is not saved. There is no new service worker/app-shell offline support;
an offline hard reload is not guaranteed to boot the entire application.

## Preserving older work

Browser database version 3 clears obsolete cached responses but **does not delete
the outbox or offline-score tables**. Old edits without an account owner are marked
for review and are never assigned to whichever user next logs in. The sync badge
warns when such work exists. Legacy ownerless PHIL-IRI/SF9 local-storage keys also
remain untouched but are no longer read automatically.

Recovery requires checking the original owner and record context. Do not clear
browser site data or run a blanket database reset to remove the warning: that would
delete unsent work. There is no automatic owner-recovery screen in this change.

Rejected syncs, including HTTP 409, are retained for review. Later writes do not
skip past that rejection. This is not automatic conflict resolution; an
administrator/developer must review the server rejection and the retained edit.
Only confirmed successful mutations remove their own overlays, so a newer edit
to the same score cell survives an older successful sync.

Account keys prevent accidental cross-account display/replay in this application;
they are not encryption or a replacement for server authorization. Clearing site
data, private-browsing cleanup, or storage eviction can still destroy local work.
A lost network response can leave an already-applied operation queued: exactly-once
replay of arbitrary create operations requires backend idempotency support.

## Verification

From `frontend/`:

```sh
node --test test/navigationCache.test.mjs test/attendanceDays.test.mjs test/atRiskPresentation.test.mjs test/philIri.test.mjs
node test/navigationPages.test.mjs
npm run build
```

`offlineCache.browser.test.mjs` additionally exercises real IndexedDB migration,
expiry, account switching, logout, rejected saves, local-storage failure, concurrent
score editing, and multi-tab logout. It starts its own Vite server and a fresh
headless browser profile; it blocks non-test-server network requests. It never
connects to the school database or uses an existing browser profile.
The actual Academic Period page is also tested across browser reloads with a held
server response, school-year changes, deadline saves, offline failures, expiration,
access denial, and retry.

Run it in an environment with Playwright and its Chromium browser available:

```sh
node test/offlineCache.browser.test.mjs
```

If Playwright is provided by an external tool/runtime, set
`PLAYWRIGHT_MODULE_PATH` to that installation's absolute `index.mjs` path.
`BROWSER_CHANNEL=msedge` can use an installed Microsoft Edge instead of a
Playwright-managed Chromium. No production dependency or package-lock change
is required for this optional browser test.
