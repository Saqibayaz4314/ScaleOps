# 04 — Backend Data Schema, Normalization & API Contracts

**ScaleOps Command Center | Next.js serverless | no database in MVP**

## 1. “Schema” means typed read models, not database tables

For this 3-hour dashboard AWS is the source of truth. PostgreSQL/Atlas are **deliberately not used**. Build schemas for normalized server responses to keep AWS SDK shapes out of browser code. No migrations, collections, indexes, ORM, or webhook job queue needed. AWS API calls are **read-only**.

## 2. Core canonical types (TypeScript reference)

```ts
export type ServiceStatus = 'ok' | 'partial' | 'error';
export type AwsErrorCode =
  | 'NOT_CONFIGURED' | 'AWS_ACCESS_DENIED' | 'AWS_RESOURCE_MISSING'
  | 'AWS_THROTTLED' | 'AWS_TIMEOUT' | 'AWS_UNAVAILABLE' | 'NO_DATAPOINTS';
export interface PanelError {
  source: 'autoscaling' | 'ec2' | 'elbv2' | 'cloudwatch';
  code: AwsErrorCode;
  message: string; // sanitized, user-actionable
}
export interface ResourceContext {
  region: string;
  asgName: string;
  albName: string | null;  // sanitized display name
  targetGroupName: string | null;
}
export interface CapacitySnapshot {
  min: number; max: number; desired: number;
  inService: number; pending: number; terminating: number;
}
export type AlbTargetState =
  | 'healthy' | 'unhealthy' | 'initial' | 'draining' | 'unused' | 'unavailable' | 'unknown';
export interface TargetSnapshot {
  targetId: string; // shortened for UI
  state: AlbTargetState;
  reason: string | null;
  description: string | null;
}
export interface TargetSummary {
  healthy: number; unhealthy: number; initial: number;
  draining: number; unused: number; unavailable: number;
  targets: TargetSnapshot[];
}
export interface TimePoint {
  timestamp: string;  // ISO UTC
  value: number | null;
}
export interface MetricSeries {
  id: 'cpu' | 'requests' | 'responseTime';
  namespace: 'AWS/EC2' | 'AWS/ApplicationELB';
  metricName: string;
  statistic: 'Average' | 'Sum';
  unit: '%' | 'count' | 'seconds';
  periodSeconds: 60 | 300;
  points: TimePoint[];
  latestObservedAt: string | null;
  aggregationNote: string;  // precise dimensional semantics
}
export interface ScalingEvent {
  activityId: string;
  startedAt: string | null;
  endedAt: string | null;
  statusCode: string;
  description: string;
  cause: string;
  progress: number | null;
}
export interface BaseApiResponse {
  status: ServiceStatus;
  fetchedAt: string;
  context: ResourceContext;
  errors: PanelError[];
}
export interface OverviewResponse extends BaseApiResponse {
  capacity: CapacitySnapshot | null;
  targets: TargetSummary | null;
  metrics: { cpu: MetricSeries | null; requests: MetricSeries | null; responseTime: MetricSeries | null };
  recentEvents: ScalingEvent[];
}
export interface InstanceRow {
  instanceId: string;  // may be shortened for presentation
  ec2State: string | null;
  asgLifecycle: string;
  asgHealth: string;
  availabilityZone: string | null;
  instanceType: string | null;
  albTargetHealth: AlbTargetState | null;
}
export interface InfrastructureResponse extends BaseApiResponse {
  capacity: CapacitySnapshot | null;
  instances: InstanceRow[];
  targets: TargetSummary | null;
}
export interface EventsResponse extends BaseApiResponse {
  events: ScalingEvent[];
}
```

**Note:** Keep `null` for missing metrics and metadata, not 0 or empty fake values. Preserve exact AWS event cause text where safe; truncate to reasonable length. Never return raw AWS credentials or unrestricted SDK response dumps.

## 3. API endpoints and examples

### `GET /api/overview?range=1h|3h|6h`

Protected, default `1h`. Example with **illustrative schema-only values** (never render as real data):

```json
{
  "status":"ok",
  "fetchedAt":"2026-10-21T06:00:00Z",
  "context":{"region":"ap-south-1","asgName":"example-asg","albName":"example-alb","targetGroupName":"example-target-group"},
  "capacity":{"min":1,"max":3,"desired":2,"inService":2,"pending":0,"terminating":0},
  "targets":{"healthy":2,"unhealthy":0,"initial":0,"draining":0,"unused":0,"unavailable":0,"targets":[]},
  "metrics":{"cpu":{"id":"cpu","namespace":"AWS/EC2","metricName":"CPUUtilization","statistic":"Average","unit":"%","periodSeconds":300,"points":[{"timestamp":"2026-10-21T05:55:00Z","value":43.2}],"latestObservedAt":"2026-10-21T05:55:00Z","aggregationNote":"ASG average where available"},"requests":null,"responseTime":null},
  "recentEvents":[],"errors":[]
}
```

Actual AWS values are not supplied by these docs; implement retrieval. If metric requests fail, respond `status:partial` with matching `PanelError`. For valid but empty series, return `points:[]`, `latestObservedAt:null`, and a client-facing `NO_DATAPOINTS` notice where useful.

### `GET /api/infrastructure`

Protected. Returns capacity, EC2 instance rows, ALB targets and context. ASG instances are filtered from the configured ASG; never search/account-list all instances. EC2 extra details are optional to protect time budget. If EC2 details fail but ASG details succeed, preserve ASG row information and flag `partial`.

### `GET /api/events?limit=20`

Protected; clamp integer limit 1–50, default 20. Returns `events` newest first. Distinguish `Successful`/`InProgress`/`Failed` statuses using AWS-provided `StatusCode`. Treat zero activities as empty valid history, **not** necessarily an error.

### `GET /api/health`

Unprotected, `{ "status":"ok" }` with HTTP 200, no AWS details. Does not assert connectivity to AWS.

### `POST /api/auth/login`, `POST /api/auth/logout`

Only password for login; signed session cookie, no AWS metadata in auth response. Limit attempts at ingress if feasible. On login failure send HTTP 401 generic message. Authorization runs inside every protected route handler; anonymous direct API access must return 401.

## 4. Backend-only utility contracts

```ts
interface AwsConfig {
  region: string;
  asgName: string;
  albArn: string;
  targetGroupArn: string;
}
async function getAsgSnapshot(config: AwsConfig): Promise<CapacitySnapshot>;
async function getTargetHealth(config: AwsConfig): Promise<TargetSummary>;
async function getScalingEvents(config: AwsConfig, limit: number): Promise<ScalingEvent[]>;
async function getEc2Details(instanceIds: string[]): Promise<Map<string, Partial<InstanceRow>>>;
async function getCloudWatchMetrics(config: AwsConfig, range: '1h'|'3h'|'6h'): Promise<MetricSeries[]>;
function deriveAlbDimension(albArn: string): string; // 'app/name/id'
function normalizeAwsError(error: unknown): PanelError;
```

Use `GetMetricData` with 3 metric queries where possible to reduce calls. `GetMetricData` may paginate with `NextToken`; handle it or explicitly bound output/time and document any truncation. Sort datapoints ascending because CloudWatch order can differ. Nulls remain gaps. Parse timestamps as ISO strings. Unit consistency is mandatory (`TargetResponseTime` AWS native seconds). Never confuse `RequestCount` period sum with per-second rate.

## 5. IAM / authorization schema

There are **two distinct AWS identities**:

1. **Deployment IAM principal**: Terraform/GitHub Actions, has create/update/delete permissions; must never be configured in dashboard/Vercel.
2. **Dashboard IAM principal**: read-only Auto Scaling, CloudWatch, EC2, ELBv2 API permissions only.

Recommended protected API boundary: `isAuthorized(sessionCookie) => boolean`; signed, expiry-checked session on each route. Authenticate before creating AWS client and before request fan-out. Secrets read only on server. Sanitize `AccessDenied` messages to remove sensitive account metadata.

## 6. Field provenance matrix

| UI field | AWS call | Field / transformation |
|---|---|---|
| ASG min/max/desired | DescribeAutoScalingGroups | `MinSize`, `MaxSize`, `DesiredCapacity` |
| In-service count | DescribeAutoScalingGroups | count `LifecycleState=InService` |
| Pending count | DescribeAutoScalingGroups | count `LifecycleState` starts `Pending` |
| Instance AZ | DescribeAutoScalingGroups / DescribeInstances | ASG instance AZ; EC2 if available |
| ALB target healthy | DescribeTargetHealth | count `TargetHealth.State=healthy` |
| CPU plot | GetMetricData | `AWS/EC2:CPUUtilization`, ASG dimension or labeled per-instance fallback |
| Request volume | GetMetricData | `AWS/ApplicationELB:RequestCount`, LoadBalancer suffix dimension, Sum |
| Response time | GetMetricData | `AWS/ApplicationELB:TargetResponseTime`, LoadBalancer suffix, Average, seconds |
| Scaling ledger | DescribeScalingActivities | `ActivityId`, `StatusCode`, `Cause`, `Description`, timestamps |
| Last refresh | Server clock | actual successful fetch time; not metric sample time |

## 7. Partial error strategy

- If **ASG missing**, return a clear configuration error for capacity/infrastructure, not `desired:0`.
- If **CloudWatch no data**, charts show empty-state and metric timestamps null; page still loads.
- If **ALB permission denied**, target panel shows error; scaling ledger still loads.
- If **throttled**, retry once with backoff/jitter within time budget, otherwise expose temporary read failure.
- If **Vercel function timeout**, return panel-level or route-level `AWS_TIMEOUT`; browser retains previous result labeled stale.
- 200 with `status:partial` when some panels succeeded; 503 if all required backends failed. 401 unauthenticated, 400 invalid query.

## 8. Testing contract

Unit tests: `deriveAlbDimension`, period selection, timestamp/value zip-and-sort, missing-datapoint handling, ASG counts, mapping ALB target state, events sorting, sanitized AWS errors. Route tests: unauthorized requests return 401 without AWS calls; valid range succeeds with stubbed AWS clients; invalid range 400; partial AWS failure yields partial payload; no secrets returned.

Integration verification is against actual user-owned AWS deployment. No `mock` badges hidden in production screens. QA evidence: capture response timestamp, resource context and relevant AWS Console entries.

## 9. Persistence if the project continues after hackathon (not implemented now)

If later needed, use existing **PostgreSQL** to persist load-test sessions and annotations, **not raw every-30-second metrics**, e.g. `test_sessions(id uuid pk, started_at timestamptz, ended_at timestamptz, label text, asg_name text)` and `test_annotations(id uuid pk, session_id uuid fk, noted_at timestamptz, note text)`. No schema migrations now. MongoDB Atlas is unnecessary for the current structured, tiny domain.
