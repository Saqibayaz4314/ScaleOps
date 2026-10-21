param(
  [Parameter(Mandatory=$true)][string]$Region,
  [Parameter(Mandatory=$true)][string]$AsgName,
  [Parameter(Mandatory=$true)][string]$AlbArn,
  [Parameter(Mandatory=$true)][string]$TargetGroupArn,
  [int]$DurationMinutes = 25,
  [string]$OutputDirectory = "evidence/$(Get-Date -Format 'yyyyMMdd-HHmmss')"
)
$ErrorActionPreference = 'Stop'
if ($DurationMinutes -lt 1 -or $DurationMinutes -gt 120) { throw 'DurationMinutes must be 1-120.' }
if ($AlbArn -notmatch ':loadbalancer/(app/[^/]+/[^/]+)$') { throw 'Invalid ALB ARN.' }
$albDimension = $Matches[1]
Get-Command aws -ErrorAction Stop | Out-Null
$evidenceRoot = New-Item -ItemType Directory -Force -Path $OutputDirectory
$start = [DateTime]::UtcNow
$end = $start.AddMinutes($DurationMinutes)
function Save-AwsJson([string[]]$AwsArguments, [string]$FileName) {
  $result = & aws @AwsArguments --region $Region --output json --no-cli-pager
  if ($LASTEXITCODE -ne 0) { throw "AWS read failed; evidence incomplete: $FileName" }
  $result | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot.FullName $FileName)
  return ($result | ConvertFrom-Json)
}
$metadata = @{ startUtc = $start.ToString('o'); region = $Region; asg = $AsgName; albArn = $AlbArn; targetGroupArn = $TargetGroupArn; status = 'collecting' }
$metadata | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $evidenceRoot.FullName 'run.json')
Write-Host "Read-only capture started: $($evidenceRoot.FullName). Run baseline and ramp-up k6 tests in another terminal."
try {
  do {
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    $group = Save-AwsJson @('autoscaling','describe-auto-scaling-groups','--auto-scaling-group-names',$AsgName) "$stamp-capacity.json"
    if (-not $group.AutoScalingGroups.Count) { throw 'ASG not found.' }
    $null = Save-AwsJson @('elbv2','describe-target-health','--target-group-arn',$TargetGroupArn) "$stamp-health.json"
    $null = Save-AwsJson @('autoscaling','describe-scaling-activities','--auto-scaling-group-name',$AsgName,'--max-records','50') "$stamp-activities.json"
    Write-Host "$stamp desired=$($group.AutoScalingGroups[0].DesiredCapacity) instances=$($group.AutoScalingGroups[0].Instances.Count)"
    if ([DateTime]::UtcNow -lt $end) { Start-Sleep -Seconds 30 }
  } while ([DateTime]::UtcNow -lt $end)
  # Allow CloudWatch publication delay; rerun metric queries later if the newest periods are missing.
  $queries = @()
  foreach ($spec in @(
    @('cpu','AWS/EC2','CPUUtilization','Average','AutoScalingGroupName',$AsgName),
    @('requests','AWS/ApplicationELB','RequestCount','Sum','LoadBalancer',$albDimension),
    @('latency','AWS/ApplicationELB','TargetResponseTime','Average','LoadBalancer',$albDimension)
  )) {
    $queries += @{ Id=$spec[0]; ReturnData=$true; MetricStat=@{ Metric=@{ Namespace=$spec[1]; MetricName=$spec[2]; Dimensions=@(@{Name=$spec[4]; Value=$spec[5]}) }; Period=60; Stat=$spec[3] } }
  }
  $queryFile = Join-Path $evidenceRoot.FullName 'metric-queries.json'
  # AWS CLI JSON inputs must not have a UTF-8 BOM.
  [System.IO.File]::WriteAllText($queryFile, (ConvertTo-Json -InputObject $queries -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  $null = Save-AwsJson @('cloudwatch','get-metric-data','--metric-data-queries',"file://$queryFile",'--start-time',$start.ToString('o'),'--end-time',[DateTime]::UtcNow.ToString('o'),'--scan-by','TimestampAscending') 'cloudwatch.json'
  $metadata.status = 'captured'
} finally {
  $metadata.endUtc = [DateTime]::UtcNow.ToString('o')
  $metadata | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $evidenceRoot.FullName 'run.json')
}
