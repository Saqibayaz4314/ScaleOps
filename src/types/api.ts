// Client-safe typed read models (see docs/04-BACKEND-SCHEMA). No AWS SDK types here.

export type ServiceStatus = "ok" | "partial" | "error";
export type AwsErrorCode =
  | "NOT_CONNECTED"
  | "NOT_CONFIGURED"
  | "AWS_ACCESS_DENIED"
  | "AWS_RESOURCE_MISSING"
  | "AWS_THROTTLED"
  | "AWS_TIMEOUT"
  | "AWS_UNAVAILABLE"
  | "NO_DATAPOINTS";

export type PanelSource = "autoscaling" | "ec2" | "elbv2" | "cloudwatch";

export interface PanelError {
  source: PanelSource;
  code: AwsErrorCode;
  message: string;
}

export interface ResourceContext {
  region: string;
  asgName: string;
  albName: string | null;
  targetGroupName: string | null;
}

export interface CapacitySnapshot {
  min: number;
  max: number;
  desired: number;
  inService: number;
  pending: number;
  terminating: number;
}

export type AlbTargetState =
  | "healthy"
  | "unhealthy"
  | "initial"
  | "draining"
  | "unused"
  | "unavailable"
  | "unknown";

export interface TargetSnapshot {
  targetId: string;
  state: AlbTargetState;
  reason: string | null;
  description: string | null;
}

export interface TargetSummary {
  healthy: number;
  unhealthy: number;
  initial: number;
  draining: number;
  unused: number;
  unavailable: number;
  targets: TargetSnapshot[];
}

export interface TimePoint {
  timestamp: string; // ISO 8601 UTC
  value: number | null; // null = no datapoint (a gap), never zero
}

export interface MetricSeries {
  id: "cpu" | "requests" | "responseTime";
  namespace: "AWS/EC2" | "AWS/ApplicationELB";
  metricName: string;
  statistic: "Average" | "Sum";
  unit: "%" | "count" | "seconds";
  periodSeconds: 60 | 300;
  points: TimePoint[];
  latestObservedAt: string | null;
  aggregationNote: string;
}

export type ActivityStatus = "Successful" | "InProgress" | "Failed" | "Cancelled" | "Other";

export interface ScalingEvent {
  activityId: string;
  startedAt: string | null;
  endedAt: string | null;
  statusCode: string;
  status: ActivityStatus;
  description: string;
  cause: string;
  progress: number | null;
  /** Only set when AWS-provided text states it, e.g. "from 1 to 2". */
  capacityChange: { from: number; to: number } | null;
}

export interface BaseApiResponse {
  status: ServiceStatus;
  source: string;
  fetchedAt: string;
  context: ResourceContext;
  errors: PanelError[];
}

export type RangeKey = "1h" | "3h" | "6h";

export interface OverviewResponse extends BaseApiResponse {
  range: RangeKey;
  capacity: CapacitySnapshot | null;
  targets: TargetSummary | null;
  metrics: {
    cpu: MetricSeries | null;
    requests: MetricSeries | null;
    responseTime: MetricSeries | null;
  };
  recentEvents: ScalingEvent[];
  lastActivityAt: string | null;
}

export interface MetricsResponse extends BaseApiResponse {
  range: RangeKey;
  metrics: OverviewResponse["metrics"];
}

export interface InstanceRow {
  instanceId: string;
  ec2State: string | null;
  asgLifecycle: string;
  asgHealth: string;
  availabilityZone: string | null;
  instanceType: string | null;
  launchTime: string | null;
  albTargetHealth: AlbTargetState | null;
  albTargetReason: string | null;
}

export interface InfrastructureResponse extends BaseApiResponse {
  capacity: CapacitySnapshot | null;
  instances: InstanceRow[];
  targets: TargetSummary | null;
}

export interface EventsResponse extends BaseApiResponse {
  events: ScalingEvent[];
}

export interface ApiErrorBody {
  status: "error";
  source: string;
  fetchedAt: string;
  errors: PanelError[];
}
