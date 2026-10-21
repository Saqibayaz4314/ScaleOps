# ScaleOps hackathon demonstration

The workload lives in `D:/client/Aws-deployed-web/scaleops-demo`; the monitoring dashboard lives in `D:/ScaleOps`. Terraform provisions the infrastructure. AWS target tracking adjusts capacity. The dashboard only reads telemetry.

## Before the demo

1. Run dashboard migrations and configure PostgreSQL plus ENCRYPTION_KEY. Sign in and connect a dedicated read-only IAM user on Connection. Use the deployed Terraform outputs for region, ASG, ALB ARN and target group ARN.
2. Check `/api/health` and `/api/info` through the deployed ALB. Confirm healthy targets and actual scaling policy in AWS. Source defaults are min/desired/max 1/1/3, CPU target 50%, policy warm-up 120s and grace period 180s; record actual deployed values.
3. Deploy the fixed workload app through its existing release pipeline before testing. Local changes do not change running EC2 instances. Confirm the deployed app version using `/api/info`.
4. Start evidence collection from D:/ScaleOps in a separate terminal (AWS CLI must use the dedicated read-only principal):

```powershell
./scripts/capture-evidence.ps1 -Region YOUR_REGION -AsgName YOUR_ASG -AlbArn YOUR_ALB_ARN -TargetGroupArn YOUR_TG_ARN -DurationMinutes 30
```

The collector needs the read permissions in README. It saves timestamped capacity, target health, scaling activities and CloudWatch CPU/request/latency JSON. It performs no AWS mutations. Keep the capture running through scale-in; increase duration up to 120 minutes if needed. CloudWatch publication can lag; missing datapoints do not mean zero. Interrupted or failed captures remain marked `collecting`, not completed. An AWS read failure stops capture.

## Repeatable load test

Run only against the owned demo ALB. In the workload project:

```powershell
$demoUrl = 'http://YOUR-ALB-DNS'
New-Item -ItemType Directory -Force evidence | Out-Null
[DateTime]::UtcNow.ToString('o') | Set-Content evidence/baseline-start.txt
k6 run --summary-export=evidence/baseline-summary.json --out json=evidence/baseline-samples.json -e ALB_URL=$demoUrl tests/k6-baseline.js
if ($LASTEXITCODE -ne 0) { throw 'Baseline failed; inspect results before ramp-up.' }
[DateTime]::UtcNow.ToString('o') | Set-Content evidence/ramp-start.txt
k6 run --summary-export=evidence/ramp-summary.json --out json=evidence/ramp-samples.json -e ALB_URL=$demoUrl tests/k6-rampup.js
if ($LASTEXITCODE -ne 0) { throw 'Ramp test failed; retain the evidence and investigate.' }
[DateTime]::UtcNow.ToString('o') | Set-Content evidence/ramp-end.txt
```

Baseline is 5 virtual users for 2 minutes. Ramp is 2 to 10 virtual users, sustained then reduced to zero over 12 minutes. Virtual users are not RPS. The ramp preflight must return 200 from the workload endpoint; 403/429 are test failures. The endpoint intentionally performs CPU work, so assess normal endpoint health separately from its deliberately long response times. Save k6 error rate and p95 latency, CloudWatch averages, target health and ASG capacity on the same UTC timeline. Continue observation after traffic stops; scale-in is optional if it does not occur during the demo.

## Results to fill from real evidence

No live results are claimed by this template. Do not fill cells using invented numbers.

| Phase / UTC interval | Requests per minute | CPU average % | ALB average latency ms | k6 p95 ms / error % | Desired / in-service | Healthy / unhealthy |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | Pending | Pending | Pending | Pending | Pending | Pending |
| Rising load before scaling | Pending | Pending | Pending | Pending | Pending | Pending |
| Sustained load after scaling | Pending | Pending | Pending | Pending | Pending | Pending |
| Reduced load / recovery | Pending | Pending | Pending | Pending | Pending | Pending |

Record first threshold breach, scaling activity start, instance InService time and first healthy-target observation. Report detection-to-healthy delay (30s snapshot precision). Copy AWS activity Cause and status; distinguish traffic scaling from health replacement or deployment refresh. Compare pre/post scaling under similar demand. If load differs, state that limitation. Record any scale-in as a separate event; manual desired-capacity changes are not proof of automatic scaling.

## Scaling and reliability analysis

- Keep the existing 50% CPU target as a starting point; tune from measured latency/error objectives and sustained CPU. Avoid a higher threshold if requests already degrade before extra capacity becomes healthy. A single Node process may not fully use all vCPUs; check that the chosen load actually crosses the group CPU target before claiming the policy failed.
- Measure bootstrap-to-healthy time. Set warm-up and health grace to cover normal startup. The bootstrap downloads packages and artifacts, so 120s warm-up / 180s grace may be too short. A prebuilt AMI can reduce startup variation. Do not blindly shorten settings for a fast demo.
- If scaling repeatedly reverses with stable traffic, inspect workload shape, target value and warm-up. For target tracking, prioritize correct warm-up and metric selection over an arbitrary cooldown.
- Keep `/api/health` lightweight. CPU work now yields between chunks so it does not hold the event loop for an entire request. Saturated hosts can still experience scheduling delays; use observed health-check failures to tune limits.
- One minimum instance costs less but has no running-instance redundancy. Two healthy instances spread across AZs improve availability and increase baseline compute cost. Two subnets alone do not mean two running instances.
- A maximum of three bounds compute capacity, but does not cap the total AWS bill. Reject excess workload explicitly, monitor 429/5xx, and consider rate limits/WAF, caching and request queues where appropriate. Disable the public test workload after the demo.
- ALB normally routes to healthy targets. If every registered target is unhealthy, ALB can fail open and route to unhealthy targets. Record reason codes and consult AWS health-check behavior: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html

## Cost and safe cleanup

Provide a regional estimate using current AWS pricing and the actual test duration. Include EC2 instance-hours, EBS, ALB hours plus LCUs, public IPv4, data transfer, CloudWatch detailed monitoring/logs, S3 artifacts/state and any burstable-instance surplus CPU charges. The workload README's basic monthly figure is not a complete bill. Compare one and two minimum instances explicitly; explain warm-up headroom and maximum capacity trade-offs.

1. Stop k6; preserve test results, CloudWatch JSON, activities and screenshots. Disable WORKLOAD_ENABLED in the deployment configuration and roll out the change if keeping the infrastructure.
2. For teardown, use the original Terraform backend/workspace and real variables. Run `terraform plan -destroy`, review the exact resources, then `terraform destroy`. Do not destroy shared resources or the state backend first.
3. Confirm EC2 instances, ALB, EBS volumes and dedicated networking are gone; check retained CloudWatch logs and other separately created resources.
4. Remove dedicated artifact bucket contents only if no longer needed. Versioned buckets require removing object versions and delete markers; a plain recursive S3 delete is insufficient.
5. Preserve remote state/audit records until destruction is verified. Remove a dedicated state bucket/lock table only after confirming no other stack uses them. Disconnect dashboard credentials and revoke the dedicated IAM key when no longer needed.

## Milestone evidence map

1: app + baseline summary and CPU. 2: Terraform ALB/health settings + healthy targets + instance IDs from repeated `/api/info`. 3: launch template/ASG/policy configuration. 4: k6 scripts and output. 5: filled comparison and timing analysis. 6: target health/reasons + CloudWatch + activities. 7: regional cost comparison and teardown record. 8: live dashboard or exported snapshots. 9: real AWS traffic-induced scale-out, with optional scale-in.
