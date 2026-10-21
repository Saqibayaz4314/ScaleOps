# Vercel deployment

Deploy the dashboard repository rooted at `D:/ScaleOps`. The separate workload stays on AWS; do not import its project into this Vercel application.

## Settings

- Framework: Next.js. Node.js: 22.x (pinned in package.json).
- Install command: `npm ci`. Build command: `npm run build`. Output directory: framework default.
- Choose the function region closest to the PostgreSQL database in Vercel project settings. Use a managed pooled database URL for concurrency; each application instance uses up to five connections.
- API routes allow 60 seconds for database startup and AWS verification. Individual AWS calls retain their own shorter timeouts. This does not guarantee large-account discovery finishes within 60 seconds.

## Environment variables

Set these in the Vercel dashboard for Production. Use a separate database and key for Preview when possible.

| Setting | Value |
| --- | --- |
| DATABASE_URL | Your managed PostgreSQL connection URL; never a NEXT_PUBLIC variable |
| DATABASE_SSL | `require` for verified remote TLS; `no-verify` only if the provider requires its self-signed certificate; `disable` only for a local database |
| ENCRYPTION_KEY | The same current base64 key used locally if reusing the same database |
| SIGNUP_ENABLED | `true` to allow registration |
| SIGNUP_INVITE_CODE | Optional, at least 8 characters; omit rather than entering placeholder text |
| ENCRYPTION_KEY_PREVIOUS | Optional old key during an intentional key rotation; otherwise omit |

Do not generate a different ENCRYPTION_KEY for a database that already holds encrypted AWS connections: those connections need the original key. Do not add the dashboard user's AWS keys as Vercel environment variables; enter them through Connection after login. Keep Terraform deployment credentials separate.

## Database and release

1. Ensure the target database allows connections from Vercel and configure the provider's required TLS mode. Set the variables above in Vercel before deploying.
2. Apply migrations to that exact database using a trusted local terminal or CI environment with DATABASE_URL, DATABASE_SSL and ENCRYPTION_KEY set: `npm run db:migrate`. Both `001_init.sql` and `002_user_name.sql` are required. Migrations are not automatically run during a Vercel build.
3. Run `npm run preflight` against the target configuration. It checks settings, database availability and applied migrations without exposing secrets or modifying data.
4. Commit the source and lockfile; .env.local, test evidence and .verification are excluded. Import the repo and deploy. Redeploy if you change environment variables.
5. Open the HTTPS production URL. Register using name/email/password, then log out and back in. Confirm unauthenticated `/api/overview` returns 401, and `/api/health` returns 200. Health is liveness only; it does not verify database or AWS access.
6. On Connection, use a dedicated read-only IAM user, correct region, ASG, ALB and target group. Verify all read checks, charts, target health and scaling activities against AWS Console. A successful credential check can still have no CloudWatch datapoints.
7. Follow HACKATHON-DEMO.md for an actual traffic-induced scale-out and record the results. Local build success is not proof of the production cloud integration.

## If deployment fails

- Signup/database error: verify variables, TLS, database networking, connection limits and both migrations. Inspect Vercel function logs without sharing credentials.
- Decryption failure: restore the correct ENCRYPTION_KEY for the database; do not overwrite existing encrypted values.
- AWS access denied: use the policy in README, correct account/region and supported long-term IAM keys. Root keys and ASIA temporary keys are rejected by this version.
- API timeout: check database proximity/reachability and AWS throttling, and confirm the route duration configured in the deployment.

Official references: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions and https://vercel.com/docs/functions/configuring-functions/duration
