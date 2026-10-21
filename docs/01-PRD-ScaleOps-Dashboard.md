# 01 — Product Requirements Document (PRD)

**Product:** ScaleOps Command Center  
**Hackathon challenge:** Intelligent Auto Scaling and Load Management for Web Applications — AWS Cloud Club MUET, HacktoberFest 3.0  
**Scope:** Application B — AWS Monitoring & Scaling Dashboard  
**Version:** 1.0 | **Target build time:** 3 hours | **Priority:** Real AWS evidence before polish

## 1. Product summary

ScaleOps Command Center is a read-only, operational Next.js dashboard hosted on Vercel. It visualizes **real** telemetry from the existing App A infrastructure provisioned with Terraform: AWS EC2 Auto Scaling Group (ASG), Application Load Balancer (ALB), EC2 instances and CloudWatch. It does not create, scale, restart or delete AWS resources. AWS itself performs target-tracking scaling; ScaleOps observes it and explains the outcome.

**Product promise:** Within 15 seconds of opening the dashboard, a judge understands the number of running instances, actual CPU/load trend, load-balancer health, and whether AWS scaled out or in during the demo.

**Non-negotiable:** No fake values, animated counters pretending to be live, mock metrics labeled as live, fabricated savings or unsupported predictions.

## 2. Problem and users

**Problem:** AWS Console spreads relevant load-balancing and scaling signals across CloudWatch, EC2, ELB and Auto Scaling pages. For a short hackathon demonstration it is difficult to show one coherent story of traffic, resource pressure, scaling reaction and application health.

**Primary users:** Hackathon judges watching a live demo; developer/operator validating Terraform-deployed App A. **Secondary user:** teammates preparing screenshots and evidence.

**User jobs:**
1. Confirm dashboard is connected to the correct AWS region and ASG.
2. See active/desired/min/max capacity and healthy/unhealthy ALB targets.
3. Track CPU load, ALB request count and target response time over time.
4. Inspect AWS-generated scaling activities, with their statuses and timestamps.
5. Explain the relationship between a load test, load change and scale-out event.
6. Quickly diagnose missing data or AWS permissions instead of showing deceptive zeros.

## 3. Delivery boundaries

### In scope — P0 (must ship)

- Public-facing **read-only**, access-controlled single-environment dashboard for App A.
- **Overview** at `/dashboard`: AWS connection indicator, region, ASG, last successful fetch time, four main KPI cards, CPU chart, requests chart, recent scaling activities and target health.
- **Infrastructure** at `/infrastructure`: list of ASG instances (ID masked or shortened in UI), lifecycle state, health state, Availability Zone; ALB target health and reasons when present.
- **Scaling history** at `/events`: actual EC2 Auto Scaling `DescribeScalingActivities` history (status, cause, start/end time, description).
- **Live refresh** via browser polling every 30 seconds, plus explicit refresh button; timestamps always visible. CloudWatch datapoints are not necessarily instantaneous.
- **Time range** switch: last 1 hour / 3 hours / 6 hours; chart shows real returned datapoints only.
- **Controlled error states**: AWS permission denied, not configured, CloudWatch no datapoints, zero instances, API timeouts; distinguish each.
- **Responsive UI** optimized for a projected laptop screen and usable on tablet/mobile.
- **Vercel deployment** with secret credentials exclusively server-side; restrict access to dashboard because infrastructure metadata must not be publicly exposed.

### In scope — P1 (after P0 works)

- **Evidence panel**: latest scale-out/scale-in activity with before/after capacity where recoverable from actual data; direct AWS Console deep-link when safe and correct.
- **Demo mode indicator**: a clear banner for empty AWS telemetry or test environment; no invented data.
- **Export** read-only currently displayed metrics and events to JSON/CSV, with collection timestamp and AWS identifiers.
- **Load-test annotation**: manually enter the time window of an authorized k6 run and visually overlay it; does not itself generate load.

### Out of scope for the 3-hour build

- Building or deploying App A, Terraform or GitHub Actions (already handled separately).
- Triggering scaling, editing ASG desired capacity, executing k6 from Vercel or changing AWS configuration.
- AI recommendations, anomaly prediction, cost forecasting or optimization engine.
- Registration, organizations, teams, billing, multi-account/multi-region discovery, WebSockets, background polling workers.
- Persistent raw metric ingestion; historical telemetry comes from CloudWatch.
- Full audit logging, multi-tenant RBAC, complex alert pipelines.

## 4. Prioritized product requirements

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-01 | P0 | AWS account/region/ASG context | Header identifies configured region and ASG; no ambiguous account switching |
| FR-02 | P0 | Capacity snapshot | Show `min`, `max`, `desired`, `in-service`, `pending` from AWS; display fetched time |
| FR-03 | P0 | Instance view | Each instance belongs to configured ASG and shows lifecycle and health states |
| FR-04 | P0 | Target health | Show healthy/unhealthy/initial target counts from ELBv2 response, not inferred from ASG health |
| FR-05 | P0 | CPU utilization chart | Plot CloudWatch AWS/EC2 CPUUtilization with clearly labeled dimension/statistic; use a valid ASG aggregate metric strategy |
| FR-06 | P0 | Request chart | Plot ALB request volume using correct AWS/ApplicationELB dimensions/periods |
| FR-07 | P0 | Response time chart | Display ALB TargetResponseTime if datapoints available; label unit (seconds or milliseconds after explicit conversion) |
| FR-08 | P0 | Scaling timeline | Display actual scaling activity events, status, reason, start time and outcome |
| FR-09 | P0 | Refresh/staleness | Poll every 30s; show `lastUpdated`, pending refresh and stale warning after failed refreshes |
| FR-10 | P0 | Failure states | IAM/access, throttling, wrong resource ID and no data handled separately; never quietly substitute mock metrics |
| FR-11 | P0 | Backend boundary | Browser talks exclusively to Next.js Route Handlers; no AWS secret ever appears in client JS or API JSON |
| FR-12 | P0 | Protected access | Protect entire dashboard/API with hackathon-appropriate server-side access gate before AWS calls; do not rely on obscurity |
| FR-13 | P1 | Export proof | JSON/CSV export with timestamp, source, units and no credential content |
| FR-14 | P1 | Load-test context | Annotate test window without claiming causal proof beyond observed metrics |

## 5. Screens and user flows

### Screen A: Operations overview (`/dashboard`)

**Above the fold:** compact product identity, selected infrastructure, AWS connection state, 30s refresh indicator; capacity (desired/in-service), healthy targets, CPU metric (last returned sample or labeled average), requests during selected interval. Main data visualizations are two large time-series charts with tooltips and honest missing-data handling. Beneath: latest ASG activities and instance table preview.

**Quick flow:** Open URL → pass access gate → see fetch indicator → KPI cards and charts populate from AWS → start authorized load test separately against App A → refresh/watch CPU/load rise → inspect ASG activity → observe new instance in service and target health.

### Screen B: Infrastructure (`/infrastructure`)

ASG capacity settings, instance table and target-health table. Distinguish ASG health from ALB target health; show health-reason strings when available. Do not expose credentials or entire metadata documents.

### Screen C: Scaling events (`/events`)

Reverse-chronological event list, status labels, cause, start/end timestamps. Explain that some event causes describe health replacement/instance refresh rather than traffic-driven scale-out.

## 6. Source of truth and data freshness

- **ASG capacity and lifecycle:** EC2 Auto Scaling `DescribeAutoScalingGroups`.
- **Scaling history:** `DescribeScalingActivities`.
- **EC2 details:** EC2 `DescribeInstances` for ASG member IDs, if needed.
- **ALB targets:** ELBv2 `DescribeTargetHealth`.
- **Time-series:** CloudWatch `GetMetricData` with deliberately validated metric names, dimensions and period/statistics (App A resource identifiers must be inspected before wiring queries).
- **Last refreshed:** time of most recent successful server retrieval, not a claim that CloudWatch data itself is realtime.

CloudWatch metrics commonly arrive with delay; if newest datapoint is several minutes old, display its exact observation time. Missing datapoints are gaps, not zero values.

## 7. Architecture constraints (product-level)

- **Frontend:** Next.js App Router, TypeScript, Tailwind, accessible charts; deploy to Vercel.
- **Backend:** Next.js Node.js Route Handlers; AWS SDK v3 on the server; short server-side request timeout, bounded response payloads, controlled polling and caching.
- **AWS credentials:** separate **read-only** IAM principal from Terraform/GitHub deployment user. Use Vercel environment variables or short-lived federation. Never reuse wide Terraform administration credentials on the dashboard.
- **Database:** **none required for 3-hour MVP**. CloudWatch is metric history; AWS APIs provide infrastructure/events. Available PostgreSQL/Atlas can be integrated later for saved sessions/annotations, but adding a DB now would increase risk without meeting a core milestone.
- **Access:** simple secure password/session gate or Vercel-level protection, with API protection enforced server-side. Never place access password in `NEXT_PUBLIC_*`.
- **Config:** `AWS_REGION`, `AWS_ASG_NAME`, `AWS_ALB_ARN`, `AWS_TARGET_GROUP_ARN`, AWS credentials or role config; validate at startup/request boundary. Secrets never logged.

## 8. Functional integrity and quality requirements

**Reliability:** Dashboard renders useful status or actionable error even when one AWS service fails. Independent panels fail independently. Preserve last successful results client-side with a visible `stale` label, not as fresh values.

**Performance:** Aim for first meaningful dashboard shell within 2s on a reasonable connection; aim for AWS-backed data within 8s, subject to AWS/API/network latency. These are targets, not guaranteed SLAs.

**Security:** Read-only AWS permissions; authenticated access; no client AWS calls; no mutation endpoints; rate-limit polling if necessary; redacted errors. Never expose full credential or AWS SDK stack traces.

**Accessibility:** Keyboard navigable, chart summaries or tabular values, sufficient contrast, status labels in text (not color alone), mobile-friendly layout, reduced-motion support.

**Design direction (binding for later UI/UX doc):** serious infrastructure control-room / editorial engineering aesthetic, not generic AI SaaS. Avoid teal, mint-green, ubiquitous purple gradients, glassmorphism-heavy cards, glowing gradients, gradient KPIs and random decorative icons. Use a restrained palette with graphite/ink, bone/off-white, cobalt or vermilion signal accent, precise typography, tight data hierarchy and crafted tables/plots. Full tokens, spacing, states and layouts belong in `03-UI-UX-DESIGN.md`.

## 9. Three-hour build allocation

| Time | Deliverable | Gate |
|---|---|---|
| 00:00–00:20 | Next.js scaffold, AWS env validation, protected access | `/api/health` and AWS identity/config check behave safely |
| 00:20–01:10 | AWS SDK server clients + overview/capacity/targets/events endpoints | Real responses using App A identifiers; no fake data |
| 01:10–02:00 | Operations overview with charts, state handling, polling | Actual metrics render with units/timestamps |
| 02:00–02:30 | Infrastructure/events pages, responsive refinement | All P0 pages work |
| 02:30–03:00 | Vercel deployment, IAM/access check, demo rehearsal and fixes | Live protected URL; screenshots of real AWS values |

**Cut line:** If running late, cut export, load-test annotation, fancy animations, expanded pages and optional database before compromising real AWS data, access controls or error handling. A robust single overview is better than many broken pages.

## 10. Demo / judge acceptance scenarios

1. **Normal state:** Dashboard shows configured ASG + ALB identifiers, real in-service count, real healthy targets, timestamp and actual charts.
2. **Traffic increase:** Authorized k6 test targets App A (not this dashboard). CPU/request charts reflect change once CloudWatch datapoints become available.
3. **Scaling event:** New ASG scaling activity appears; configured capacity and running instances can be compared with AWS Console. Do not promise a scale event inside a fixed number of minutes.
4. **Failure mode:** Temporarily invalid ASG config yields clear actionable error, not dummy metrics.
5. **Security check:** Browser network tab contains no AWS keys, access tokens, Terraform state or unrestricted AWS identifiers unrelated to selected deployment.
6. **Deploy check:** Vercel production environment is configured and routes work after a cold start.

**Definition of done:** Real AWS account → real read-only API calls → protected serverless backend → correct live UI → observed scaling history and honest telemetry timestamps. P1 only after this passes.

## 11. Risks and decisions

| Risk | Mitigation |
|---|---|
| AWS permissions too narrow / too broad | Read-only policy scoped where possible; test each SDK call; never deploy with Terraform admin access keys |
| CloudWatch lag / no samples | Timestamp returned samples, select supported periods, show no-data state |
| Scaling not induced by ordinary requests | Test App A separately using its explicitly bounded CPU workload and k6; do not manufacture events |
| Vercel serverless runtime limits | Short SDK calls, no background daemon or infinite polling in function |
| Complex database integration delays delivery | No DB for MVP |
| UI looks generic or hides operational evidence | Editorial control-room aesthetic; data density and accuracy before effects |
| Public demo reveals sensitive infrastructure metadata | Access gate, server-side authorization, sanitized responses |

## 12. Dependencies and handoff

**Required from App A Terraform outputs:** region, Auto Scaling Group name, ALB ARN / DNS, Target Group ARN, ideally known EC2 tags and monitored application URL. **Required from AWS:** dedicated dashboard read-only credentials/role and validated CloudWatch metric permissions. **Required from deployment:** Vercel project and environment variables.

**Next documents to create, one at a time:** `02-TRD.md`, `03-UI-UX-DESIGN.md`, `04-BACKEND-SCHEMA.md`, `05-DATAFLOW.md`, `06-IMPLEMENTATION-PLAN.md`. TRD must specify precise AWS SDK calls, metric dimensions and API contracts; Design doc must provide a distinctive and implementation-ready visual system.
