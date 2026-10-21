# Project status — 2026-10-21

ScaleOps is a read-only dashboard for the separately deployed workload at D:/client/Aws-deployed-web/scaleops-demo.

## Changes in this repair
- Removed obsolete duplicate (protected) routes; the current authenticated/connected layouts remain active.
- Removed obsolete token/config tests superseded by current password, encryption, connection and database tests.
- Replaced credentials in .env.example with placeholders. Existing real credentials were not rotated.
- Added dashboard evidence JSON export with timestamps, source data and stale status.
- Added scripts/capture-evidence.ps1 and docs/HACKATHON-DEMO.md for load tests, evidence, analysis, reliability and cleanup.
- Demo workload now yields between bounded CPU chunks, validates duration and enforces concurrent request limits while work is active.
- Demo k6 ramp preflights the workload and counts all non-200 workload responses as errors, with health checks during load.
- Removed forced connection redirects during dashboard navigation; missing AWS setup is an inline state with a setup link. Fixed discovery selection using stale React state, and connection buttons now recover from network errors.
- STS credential errors distinguish invalid tokens, signatures, clock skew, region restrictions, denied access, timeouts and throttling without exposing raw SDK messages.

## Verification
Dashboard: production build, typecheck and lint passed. All 46 tests passed with TEST_DATABASE_URL set to the configured PostgreSQL, including 8 database integration tests and 9 STS diagnostic cases. Persistence tests verify saved AWS connections remain scoped to their owning user.
Workload source was verified in an isolated dependency installation because the original folder contained a locked native module: production build, typecheck and lint passed. Its 10 tests passed in the initial verification, including workload availability/concurrency checks.
Both k6 scripts passed `k6 inspect`; the evidence collector passed PowerShell syntax validation.
No live AWS or deployment results are claimed here.
Production-mode HTTP smoke test passed: anonymous API 401, cross-origin signup 403, name/email/password registration, saved name, Secure session cookie, authenticated API, logout revocation and login. The disposable verification account was removed.
Latest development HTTP regression passed: all three monitoring pages render without redirecting to Connection, and the API explicitly returns 409 when no AWS connection exists. No real AWS data was fabricated for this check.
Read-only deployment preflight passed against both applied migrations. There were zero saved AWS connections at validation time.
Database integration tests require TEST_DATABASE_URL and are skipped when it is absent.

## Vercel preparation
- Node.js 22.x pinned in package.json and lockfile; API routes allow 60 seconds.
- .vercelignore excludes environment secrets, node_modules, .next, .verification and evidence.
- Run npm run preflight against the target database before deployment.
- Follow docs/VERCEL-DEPLOY.md. Existing encrypted AWS connections require the same ENCRYPTION_KEY when reusing a database.

## Remaining live steps
1. Deploy the fixed workload through its existing release pipeline.
2. Configure dashboard PostgreSQL/encryption and connect dedicated read-only AWS credentials.
3. Run the baseline/ramp tests and evidence collector against the owned ALB.
4. Fill the runbook result table using actual measurements and demonstrate automatic scale-out; observe scale-in if practical.
5. Calculate regional cost from actual resources and test duration. Preserve evidence before cleanup.

## Limits
No password reset/email verification/2FA, historical capacity chart, automated scaling recommendations or cost billing integration.
Current capacity and scaling events are available; timestamped CLI snapshots can record capacity over time.
AWS metrics, real scaling behavior and cloud deployment remain unverified in this local repair.
