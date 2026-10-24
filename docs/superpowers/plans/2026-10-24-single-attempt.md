# Single Attempt Exam Implementation Plan

Goal: Permanently reserve a student's only attempt at start and prevent re-entry after submission, deadline, or exit.
Architecture: Existing local/Node server plus SQLite using built-in node:sqlite. Unique normalized student ID and full-name indexes are the authority; browser storage carries only a bearer token. Server generates order and deadline, records each answer, and makes finalization irreversible. Google Sheets remains a result export, not the locking database.

Deployment constraint: Node.js 22.20+ with a persistent writable disk shared by all app processes. Local SQLite is not a supported deployment on Vercel or independent replicas. Reject Vercel deployments explicitly rather than silently losing locks.
Assumptions: Refresh counts as exit. Switching tabs alone does not. Name means full first + last name, not first name alone. These choices follow the supplied source document and current local runtime; user may override.

- [x] Test unique ID/name claims, persistence after reopen, two database connections, invalid tokens, immutable finalization, page ownership, deadline, answer revisions, and exit.
- [x] Implement transactional attempts store with a durable pending-results queue. Never reopen a finished attempt when Sheets is unavailable.
- [x] Add start, claim, answer-save and exit APIs, and secure the existing submit API using the attempt token and server-side identity/order/deadline.
- [x] Replace browser-only initialization and add unload beacon, per-answer save, and server timer. Prevent reopening the same token on another page.
- [ ] Test the UI flow, types, lint and build. Report actual Sheets write limitation if credentials are missing.

Close events are best effort, so reserve at start and detect page ownership on re-entry. A periodic server sweep finalizes elapsed deadlines and retries queued Sheet exports while the Node server is running. Abnormal program termination may defer final score export until a server sweep, but cannot restore exam eligibility.

Verification: 34 tests pass; TypeScript, lint and production build pass. Production-built API handlers passed start/submit/repeated-submit, exit/reopen, refresh, forged-token, and forced-deadline smoke checks with a temporary database. Actual browser flow could not be run because binding localhost:3011 is blocked by the execution sandbox (EPERM). Google Sheets writes still require service-account credentials.
