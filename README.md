# ScaleOps — AWS Auto Scaling Command Center

Multi-user, read-only dashboard for an EC2 Auto Scaling group, its Application Load Balancer and CloudWatch.
It never creates, scales or deletes anything. Original specs are in `docs/`.

For the combined AWS workload + dashboard demo, repeatable load tests, evidence collection,
scaling analysis and cleanup, follow [the hackathon runbook](docs/HACKATHON-DEMO.md).
The dashboard's **Export evidence JSON** button saves the selected metric window, current capacity,
target health and recent scaling events with source timestamps and stale status. It contains no AWS keys.

## How it works
1. A user signs up (name + email + password) and signs in.
2. On the **Connection** page they paste read-only IAM access keys; ScaleOps verifies them with AWS (STS identity,
   root keys rejected, ASG discovery, a test of every read API), then stores them **AES-256-GCM encrypted** in PostgreSQL.
3. Dashboard, Infrastructure and Scaling Events read live data from *that user's* AWS account. One connection per user.
Once verified and saved, the connection is reused across pages and logins. Discovery alone does not save it.
Pages show an inline setup link when AWS is not connected; navigation is not redirected to Connection.

## Run locally
```bash
npm install
cp .env.example .env.local      # set DATABASE_URL and ENCRYPTION_KEY (npm run gen:key)
npm run db:migrate              # creates tables (safe to re-run)
npm run dev                     # http://localhost:3000  -> /signup
```

## Heroku Postgres
Use the `DATABASE_URL` from `heroku config:get DATABASE_URL -a <app>` and set `DATABASE_SSL=no-verify` (Heroku uses a self-signed
certificate). Heroku plans cap connections (Essential: 20); each serverless instance opens up to 5.

## Environment (server-only)
`DATABASE_URL`, `DATABASE_SSL` (optional), `ENCRYPTION_KEY` (required) · `ENCRYPTION_KEY_PREVIOUS`, `SIGNUP_ENABLED`, `SIGNUP_INVITE_CODE` (optional).

## IAM policy for the user's dashboard key
Create a dedicated IAM user (no console access) with only:
```json
{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Resource": "*", "Action": [
  "autoscaling:DescribeAutoScalingGroups", "autoscaling:DescribeScalingActivities",
  "ec2:DescribeInstances", "elasticloadbalancing:DescribeTargetHealth",
  "elasticloadbalancing:DescribeTargetGroups", "cloudwatch:GetMetricData" ] }] }
```
ScaleOps cannot technically force keys you provide to be read-only; the attached policy does.

## Security model
- Passwords: scrypt (per-user salt, self-describing params). Unknown-email logins burn equal time.
- Sessions: random 256-bit token in an HttpOnly, SameSite=Lax, Secure cookie; only its SHA-256 is stored; revocable; 7-day expiry.
- AWS keys: AES-256-GCM, random IV per write, AAD bound to the owning user id, key id for rotation. Never returned to the browser, never logged.
- Rate limits stored in PostgreSQL (shared across serverless instances): login, signup, connect/verify.
- CSRF: Origin check on every state-changing route + SameSite cookies. Security headers set in `next.config.ts`.
- Audit log table (`audit_log`) records login/signup/connection events, never secrets.
- Root credentials and temporary (ASIA) keys are rejected.

## Where ScaleOps fits in the hackathon task
ScaleOps is the **monitoring and reporting** half. The load-tested workload (the "demo app" behind the ALB/ASG, deployed with
Terraform) is a separate project; ScaleOps only reads from AWS and never changes it.

| Milestone | Covered by |
|---|---|
| 1 App setup + baseline | Demo app + baseline k6 test (run it, then export evidence) |
| 2 Load balancer, 3 Auto Scaling | Demo app's Terraform (ALB, target group, launch template, ASG, CPU policy) |
| 4 Load simulation | k6 ramp-up test against the ALB, evidence captured with `scripts/capture-evidence.ps1` |
| 5 Scaling analysis, 7 Cost & cleanup | Written from the exported evidence (see the runbook in `docs/`) |
| 6 Health monitoring | **ScaleOps**: target health, instance status, CloudWatch metrics, scaling activities |
| 8 Visualization | **ScaleOps**: request volume, CPU, response time, instance count, events, healthy/unhealthy targets |
| 9 AWS integration | **ScaleOps** reads EC2, ALB, Auto Scaling and CloudWatch live; scale-out is demonstrated with the k6 test |

## Deploy to Vercel (quick steps)
1. Run `npm run db:migrate` once against your database (put `DATABASE_URL` in `.env.local` first).
2. Push this project to its own GitHub repo. `.gitignore` already keeps `.env.local` and `node_modules` out.
3. In Vercel choose **Add New → Project**, import the repo (framework: Next.js, no custom build command).
4. Add these environment variables for Production (and Preview):
   - `DATABASE_URL`: your Postgres URL (Heroku: `heroku config:get DATABASE_URL -a <app>`)
   - `DATABASE_SSL`: `no-verify` for Heroku Postgres
   - `ENCRYPTION_KEY`: from `npm run gen:key`. **Use the same value as local if the database already holds saved connections**, otherwise they cannot be decrypted.
   - `SIGNUP_ENABLED` / `SIGNUP_INVITE_CODE` (optional): set `SIGNUP_ENABLED=false` after creating your account.
5. Deploy, open `/signup`, then connect read-only keys on `/connection`.

## Deploy to Vercel
See [the deployment runbook](docs/VERCEL-DEPLOY.md) for environment settings, migrations and post-deploy verification.
Create a PostgreSQL database (pooled URL), run `npm run db:migrate` once against it, set `DATABASE_URL` and
`ENCRYPTION_KEY` in Vercel (Production + Preview), deploy.

## Scripts
`npm run typecheck` · `npm run lint` · `npm test` (set `TEST_DATABASE_URL` to also run DB integration tests) · `npm run build` · `npm run db:migrate` · `npm run gen:key`

## Routes
Pages: `/signup`, `/login`, `/connection`, `/dashboard`, `/infrastructure`, `/scaling-events`.
API: `/api/overview?range=1h|3h|6h`, `/api/metrics`, `/api/infrastructure`, `/api/scaling-events?limit=1-50`, `/api/health`,
`/api/auth/{signup,login,logout}`, `/api/connection` (GET/PUT/DELETE), `/api/connection/{discover,verify}`.

## Metric semantics
CPU: `AWS/EC2 CPUUtilization` Average on the ASG dimension, 5-minute periods (falls back to a labelled per-instance mean).
Requests: `RequestCount` Sum per 60 s (1h/3h) or 300 s (6h) — a count per period, not RPS. Response time: `TargetResponseTime`
seconds, shown in ms. Missing datapoints are gaps, never zero.
