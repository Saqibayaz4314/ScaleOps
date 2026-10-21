# 03 — UI/UX Design System & Interface Specification

**ScaleOps Command Center / Application B**  
**Intent:** An unmistakably authored *infrastructure control room* — editorial, precise, calm under stress. This is **not** a template SaaS admin panel.

## 1. Art direction: “Flight Deck × Technical Journal”

Imagine a contemporary operations floor translated into digital editorial design: annotated plots, exact columns, quiet surfaces, disciplined spacing, restrained signal colors, purposeful numeric hierarchy. Reference the **typographic confidence of a financial terminal** without imitating its density, and the **clarity of a high-end industrial instrument panel** without skeuomorphism.

**Absolutely avoid:** teal/mint/emerald as brand accent, gradient text, purple-blue glow blobs, glassmorphism, gigantic 3D server art, fake AI assistant/chat bubble, oversized rounded KPI tiles, random emojis, excessive drop shadows, gradient-only charts, fake microcopy (“AI powered optimization”), irrelevant features, every card having a different hue, stock imagery.

Core mood: **ink, chalk, cobalt, hot copper.** The data, not ornament, creates drama.

## 2. Design tokens — exact starting spec

| Token | Value | Usage |
|---|---|---|
| `--ink` | `#191E26` | Sidebar / headings, true black substitute |
| `--ink-2` | `#252C36` | Elevated dark hover surfaces |
| `--paper` | `#F4F2ED` | Main canvas; warm off-white |
| `--panel` | `#FFFFFF` | Primary data surfaces |
| `--hairline` | `#D9D9D2` | 1px structural boundaries |
| `--muted` | `#67717C` | Secondary labels / axes |
| `--cobalt` | `#365BCC` | Link and CPU trace; restrained accent |
| `--copper` | `#DB6749` | Scaling event emphasis, warnings |
| `--critical` | `#C63C36` | Actual unhealthy/errors only |
| `--success` | `#39745B` | Healthy state only, never a theme accent |
| `--quiet` | `#A9B0B8` | Placeholder / disabled data |

**Color rule:** One blue trace + one copper trace at a time. Green can appear *only* for semantically healthy status and must not dominate a view. Dark sidebar is nearly charcoal, not navy-neon. Charts sit on off-white/white and show thin neutral grids.

**Typography**: `Geist Sans` or `Inter` for interface, `IBM Plex Mono` for metrics, instance IDs, timestamps and operational annotation. Optionally `Instrument Serif` very sparingly for an editorial tagline **only if already installed**; do not mix display serif into operational content. Use CSS fallback fonts and no exotic font dependency.

| Role | Typography |
|---|---|
| Page title | 29–32px, 600, tracking -0.035em |
| Lead statistic | 36–42px Plex Mono, 500, tabular nums |
| Section title | 16px, 600 |
| Body | 13–14px, 400–500 |
| Eyebrow | 10–11px uppercase, tracking +0.12em, 600 |
| Table header | 10–11px uppercase, tracking +0.08em |
| Table body | 12–13px; IDs in monospace |
| Helper / axis | 11–12px |

Line height body 1.45–1.6, numbers 1.0–1.2. Never make the dashboard “minimal” by shrinking real data below legibility.

**Geometry**: sidebar width 228px, top header height 72px, content width up to 1600px, desktop content padding 36px (24px laptop), base spacing 4px with 8/12/16/24/32. Panel corners **6px** (not 20px pills). Dividers and 1px outlines, almost no shadows. Status pills radius 3px, compact 9–11px type. Hover transitions ≤150ms, respect reduced motion.

## 3. Signature visual composition

- A **matte charcoal permanent rail** on left with vertical “SCALE / OPS” typographic lockup; tiny uppercase label **OPERATIONS / 01**, exact navigation items `Overview`, `Infrastructure`, `Scaling Events`.
- On main canvas, wide **environment strip**: `PROD • ap-south-1` | ASG short name | last sync UTC | `LIVE DATA` status. No gratuitous “LIVE” claim if fetch is stale: show `DELAYED` or `DISCONNECTED`.
- Large page title: **“Capacity, under pressure.”** Under it a single concise factual descriptor: “Telemetry from AWS Auto Scaling, Application Load Balancer and CloudWatch.” Do not use marketing hype.
- **Capacity rail** (signature): `01` desired → `01` in service → `01` healthy; an understated segmented indicator for min/desired/max. Numbers are real, labels are clear. Do not animate counts on every refresh.
- **Two asymmetrical plot panels**: CPU utilization on wider left 7/12; ALB request volume on right 5/12. A slim third metric row for target response time and timestamps if delivered. Avoid cloned square cards.
- **Event ledger** below: a dense but readable vertical journal with thin copper line for actual scale-out/in candidates and neutral lines for unrelated events; status badge identifies AWS activity state. Do not infer scaling intent from color alone.
- Tables feel like a serious operations tool: left aligned content, monotone grid, unobtrusive sort indicator, hover state, statuses shown as text.

## 4. Desktop wireframe (textual layout)

```text
┌──────────────────┬────────────────────────────────────────────────────────────────────────────┐
│ SCALE / OPS      │ OPERATIONS / 01       PROD · ap-south-1     ● LIVE DATA   ↻ REFRESH        │
│                  ├────────────────────────────────────────────────────────────────────────────┤
│ Overview         │ Capacity, under pressure.                                               │
│ Infrastructure   │ ASG: scaleops-hackathon-asg · Fetched 11:24:03 UTC                       │
│ Scaling Events   │                                                                            │
│                  │ DESIRED  01   /   IN SERVICE  01   /   HEALTHY TARGETS  01   / CPU  39%  │
│                  │ ───────────────────────────────────────────────────────────────────────    │
│                  │                                                                            │
│                  │ CPU UTILIZATION [7/12]      │ ALB REQUEST COUNT [5/12]                  │
│                  │ Axis / plot / last point     │ Axis / bars or plot / period              │
│                  │ Missing data ≠ zero         │ Missing data ≠ zero                        │
│                  │──────────────────────────────┴─────────────────────────────────────────────│
│                  │ TARGET RESPONSE TIME     TEST WINDOW (optional)   METRIC UPDATED         │
│                  │────────────────────────────────────────────────────────────────────────────│
│                  │ RECENT SCALING ACTIVITIES                     VIEW ALL →                 │
│                  │ 11:21   Successful   Launched a new instance ...                       │
│                  │ 11:13   Successful   Terminated an instance ...                        │
└──────────────────┴────────────────────────────────────────────────────────────────────────────┘
```

**Viewport:** at 1440×900 first viewport should show title, capacity rail, both charts, and the start of event ledger; no massive empty hero art. Implement responsive grid via CSS (`minmax(0, 7fr) minmax(0, 5fr)` desktop, one column under 1100px).

## 5. Page-by-page implementation

### `/dashboard` — Overview

**Priority 0**: header/sync; capacity snapshot; `CPUUtilization` time-series; `RequestCount` series; `HealthyHostCount` derived from live target health (not CloudWatch guesses); recent scaling activity list. Response-time panel only if data returned. Selected time-range 1h / 3h / 6h in small segmented control; refresh button with clear loading state. Each panel states `Source: CloudWatch`/`Source: EC2 Auto Scaling` in footnote, with real UTC observation time.

### `/infrastructure` — Resource inventory

Left: compact ASG capacity/properties; right: target group health summary. Full-width instance table:

`Instance` | `State` | `ASG lifecycle` | `ASG health` | `AZ` | `ALB target health`.

Beware ASG `InService` and ALB `healthy` are different concepts; separate columns. A selected row may reveal masked resource ID and reason text; do not expose credentials/user data or raw metadata.

### `/events` — Activity journal

Clear left chronology gutter with `HH:mm:ss UTC` ticks and date grouping; status-coded rows. Title “Scaling activity ledger”; row contents: `StatusCode`, truncated `Description`, `Cause`, UTC start/end time. Show activity type as `AWS activity` unless a type can be safely inferred from description; do **not** misclassify replacements as load-based scaling. Filters: `All / Successful / In progress / Failed` optional if time permits.

### `/login` — Restrained access gate

Two-column desktop: left charcoal identity panel with small engineering prose; right warm paper with one password input, clear sign-in label, inline errors. No decorative lock hero illustration or animated beams. Never show AWS resource metadata pre-auth.

## 6. Component contracts and states

Every widget has five explicit states:

1. **Initial skeleton**: monochrome rectangular bars approximating final geometry; no pulsing gradient.
2. **Loaded**: real value, unit, source, and time.
3. **Empty**: “No CloudWatch datapoints returned for this window.” Offer 3h/6h range, not zero.
4. **Partial error**: preserve other panels; warn “Target health unavailable — AWS permission denied.”
5. **Stale**: keep previous value with `STALE · last updated HH:MM`; never `LIVE`.

A chart should show: visible axis labels, tick marks, 1px guides, tooltip with UTC time, line dot only on hover, data gaps not connected across invalid intervals. Use palette blue for CPU, copper for requests, neutral graphite for latency. Hover values must show units. For dense time series, downsample *only if needed* and never invent sample values.

## 7. Mobile and accessibility

At ≤1024px, rail shrinks to a compact top header or collapsible drawer. At ≤640px, 16px canvas padding, metrics split into two columns or stack, charts horizontally use a readable single column, tables may scroll horizontally **with sticky first column** and visible scroll affordance. Touch targets ≥40×40px. Tab order follows content; focus outline 2px cobalt; statuses have accessible text. Charts have adjacent summary or simple data table. Support `prefers-reduced-motion`, system font loading fallback, WCAG AA contrast for text.

## 8. Implementation constraints (to keep it authored, not AI-looking)

- No generic analytics starter template imported wholesale; build tailored app shell.
- Only 2–3 meaningful icon uses per major section; no icons attached to every heading.
- Do not repeat four identical KPI tiles; use the **capacity rail** and differently weighted plot blocks.
- Do not use dashboard stock illustration, 3D assets, blur/glow effects, or large decorative gradients.
- Write precise operational microcopy: `last observation 11:22 UTC`, `2 in service`, `no datapoints`, not `Everything is looking great!`.
- The eye should naturally move **context → capacity → load graphs → AWS reaction**.

## 9. CSS implementation blueprint

```css
:root {
  --ink:#191E26; --ink-2:#252C36; --paper:#F4F2ED;
  --panel:#FFFFFF; --hairline:#D9D9D2; --muted:#67717C;
  --cobalt:#365BCC; --copper:#DB6749; --critical:#C63C36;
  --success:#39745B;
}
body { background:var(--paper); color:var(--ink); }
.panel { background:var(--panel); border:1px solid var(--hairline); border-radius:6px; }
.metric-number { font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums; }
```

Tailwind utilities may implement the same values via `@theme` or CSS vars. Use a coherent token source, not random inline colors.

## 10. Visual acceptance checklist

- [ ] No teal/mint brand accent, big gradients, glass cards or stock hero imagery.
- [ ] 1440px desktop shows capacity, 2 charts and beginning of event history above/barely below fold.
- [ ] Instance counts are distinct from ALB healthy target counts.
- [ ] A CPU number without datapoint time or period is considered **incomplete UI**.
- [ ] Missing metric never appears as 0 or an invented line.
- [ ] Every API failure has a readable screen state.
- [ ] Mobile, keyboard, and reduced-motion modes functional.
- [ ] Output feels like a built-for-purpose SRE instrument, not an AI-generated dashboard.
