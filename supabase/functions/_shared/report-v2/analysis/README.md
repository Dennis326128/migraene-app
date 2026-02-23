# Analysis V2 — SSOT Clinical Analysis Layer

## Purpose

Deterministic, physician-oriented analysis system for the Miary headache diary.
Single Source of Truth for all clinical metrics, MOH risk assessment, coverage tracking, and ME/CFS summaries.

**Target audience**: Neurologists in migraine consultations (typically 3-month check-ups).

## Architecture Rules

1. **Day-based counts only** in the physician core block. Intakes/entries are supplementary.
2. **No LLM calculation** — LLM receives only pre-computed facts + guardrails.
3. **Coverage is mandatory** — every analysis carries its data basis.
4. **No migraine days** — `migraineDays = null` until an explicit diagnostic flag exists.
5. **No ME/CFS extrapolation** — guardrail blocks inference when documented days < 20.
6. **Pure functions** — no DB calls, no I/O, no side effects. Isomorphic (Browser + Deno).

## Modules

| File | Responsibility |
|---|---|
| `types.ts` | AnalysisV2 contract (all types) |
| `definitions.ts` | Counting rules (text) + threshold constants |
| `coreMetrics.ts` | Day-based KPIs (headacheDays, acuteMedDays, etc.) |
| `moh.ts` | MOH risk assessment (normalized per 30 days) |
| `coverage.ts` | Data coverage ratios + warnings |
| `mecfs.ts` | ME/CFS summary with guardrails |
| `buildAnalysisV2.ts` | Orchestrator → full AnalysisV2 object |
| `index.ts` | Public API exports |

## Thresholds

- `TRIPTAN_DAYS_THRESHOLD = 10` (per 30 days → "likely" MOH)
- `ACUTE_MED_DAYS_THRESHOLD = 10` (per 30 days → "likely" MOH)
- `ME_CFS_MIN_DAYS_FOR_INFERENCE = 20`
- `LOW_DIARY_COVERAGE_THRESHOLD = 0.6`
- `LOW_WEATHER_COVERAGE_THRESHOLD = 0.5`

## Phases

- **Phase 1** (this): Foundation — types, core metrics, MOH, coverage, ME/CFS, minimal findings
- **Phase 2**: Doctor Share migration to SSOT
- **Phase 3**: Weather associations + prophylaxis effect analysis
- **Phase 4**: LLM guardrails integration
- **Phase 5**: PDF integration
