import { describe, expect, it } from "vitest";
import {
  buildPoints,
  capacityFromGroup,
  deriveAlbDimension,
  mapActivity,
  mapActivityStatus,
  meanAcrossSeries,
  parseCapacityChange,
  sortEventsDesc,
  summarizeTargets,
  hasData,
} from "@/lib/data/normalize";

const ALB = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/my-alb/50dc6c495c0c9188";

describe("deriveAlbDimension", () => {
  it("returns app/name/id", () => expect(deriveAlbDimension(ALB)).toBe("app/my-alb/50dc6c495c0c9188"));
  it("rejects bad ARNs", () => {
    expect(() => deriveAlbDimension("my-alb.elb.amazonaws.com")).toThrow();
    expect(() => deriveAlbDimension(ALB.replace("app/", "net/"))).toThrow();
  });
});

describe("buildPoints", () => {
  const start = Date.parse("2026-10-21T10:00:00Z");
  const end = Date.parse("2026-10-21T10:05:00Z");
  it("sorts ascending, keeps gaps as null and never zero-fills", () => {
    const pts = buildPoints(
      [new Date("2026-10-21T10:03:00Z"), new Date("2026-10-21T10:01:00Z")],
      [30, 10],
      start,
      end,
      60,
    );
    expect(pts.map((p) => p.value)).toEqual([null, 10, null, 30, null, null]);
    expect(pts[0]?.timestamp).toBe("2026-10-21T10:00:00.000Z");
    expect(hasData(pts)).toBe(true);
  });
  it("handles no data", () => {
    const pts = buildPoints(undefined, undefined, start, end, 60);
    expect(hasData(pts)).toBe(false);
    expect(pts.every((p) => p.value === null)).toBe(true);
  });
  it("preserves a genuine zero value", () => {
    const pts = buildPoints([new Date("2026-10-21T10:01:00Z")], [0], start, end, 60);
    expect(pts[1]?.value).toBe(0);
  });
});

describe("meanAcrossSeries", () => {
  it("averages only reporting instances per timestamp", () => {
    const t1 = new Date("2026-10-21T10:00:00Z");
    const t2 = new Date("2026-10-21T10:05:00Z");
    const m = meanAcrossSeries([{ timestamps: [t1, t2], values: [10, 20] }, { timestamps: [t1], values: [30] }], 300);
    expect(m.values).toEqual([20, 20]);
  });
});

describe("capacityFromGroup", () => {
  it("counts lifecycle states", () => {
    const c = capacityFromGroup({
      MinSize: 1,
      MaxSize: 3,
      DesiredCapacity: 2,
      Instances: [{ LifecycleState: "InService" }, { LifecycleState: "Pending:Wait" }, { LifecycleState: "Terminating" }],
    });
    expect(c).toEqual({ min: 1, max: 3, desired: 2, inService: 1, pending: 1, terminating: 1 });
  });
});

describe("scaling activities", () => {
  it("maps statuses", () => {
    expect(mapActivityStatus("Successful")).toBe("Successful");
    expect(mapActivityStatus("Failed")).toBe("Failed");
    expect(mapActivityStatus("Cancelled")).toBe("Cancelled");
    expect(mapActivityStatus("WaitingForInstanceWarmup")).toBe("InProgress");
    expect(mapActivityStatus(undefined)).toBe("Other");
  });
  it("parses capacity change only from AWS text", () => {
    expect(parseCapacityChange("..., increasing the capacity from 1 to 2.")).toEqual({ from: 1, to: 2 });
    expect(parseCapacityChange("An instance was taken out of service in response to an EC2 health check")).toBeNull();
  });
  it("sorts newest first", () => {
    const a = mapActivity({ ActivityId: "a", StartTime: new Date("2026-10-21T10:00:00Z"), StatusCode: "Successful" });
    const b = mapActivity({ ActivityId: "b", StartTime: new Date("2026-10-21T11:00:00Z"), StatusCode: "Successful" });
    expect(sortEventsDesc([a, b]).map((e) => e.activityId)).toEqual(["b", "a"]);
  });
});

describe("summarizeTargets", () => {
  it("counts states independently of ASG", () => {
    const s = summarizeTargets([
      { Target: { Id: "i-1" }, TargetHealth: { State: "healthy" } },
      { Target: { Id: "i-2" }, TargetHealth: { State: "unhealthy", Reason: "Target.FailedHealthChecks" } },
      { Target: { Id: "i-3" }, TargetHealth: { State: "weird" } },
    ]);
    expect([s.healthy, s.unhealthy]).toEqual([1, 1]);
    expect(s.targets[1]?.reason).toBe("Target.FailedHealthChecks");
    expect(s.targets[2]?.state).toBe("unknown");
  });
});
