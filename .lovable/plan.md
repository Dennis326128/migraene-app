

## Plan: Extend Doctor-Share Snapshot for PDF-Parity on Website

### Summary
The snapshot (`doctorReportSnapshot.ts`) needs 6 additive extensions so the website can replicate all PDF report blocks without local re-calculation.

### Current State
- **Donut**: `analysis.headacheDayDonut` already has the correct 3-bucket structure (painFreeDays, painDaysNoTriptan, triptanDays). Website can use this directly.
- **Symptoms**: `analysis.symptoms.items` has name + count + percentageOfChecked, but **lacks** `group`, `burdenLevel`, `burdenLabel`, `relevanceScore`.
- **ME/CFS**: `analysis.mecfs` has segments + documentedDays + sufficient, but **lacks** `avgScore`, `peakLabel`, `iqrLabel`, `documentationRate`.
- **Medication stats**: `tables.medicationStats` has intakeCount, daysUsed, avgPer30, isTriptan, but **lacks** `last30Intakes`, `avgEffectPercent`, `ratedCount`.
- **Weather trend chart**: `charts.intensityOverTime` has date+maxIntensity but **lacks** daily temperature and pressure values for the combined chart.
- **Time-of-day histogram**: Completely missing from snapshot.

### Changes (all in `supabase/functions/_shared/doctorReportSnapshot.ts`)

#### 1. Symptoms: Add group, burden, relevance
- Fetch `user_symptom_burden` table (user_id, symptom_key, burden_level) in the parallel data load
- In `buildSymptomsAnalysis`, classify each symptom via the same `classifySymptom()` logic from `src/lib/pdf/symptomSection.ts` (migraine/neurological/other)
- Extend `SymptomStatItem` type with: `group: 'migraine'|'neurological'|'other'`, `burdenLevel: number|null`, `burdenLabel: string`, `relevanceScore: number`
- SSOT: `src/lib/pdf/symptomSection.ts` classification lists + `BURDEN_LABELS` mapping

#### 2. Medication stats: Add last30, effect data
- Fetch `medication_effects` (med_name, effect_score) joined via entry_id for entries in range
- Fetch `medication_intakes` with `taken_date` for the last-30-days window
- Extend `MedicationStat` type with: `last30Intakes: number`, `avgEffectPercent: number|null`, `ratedCount: number`
- `avgEffectPercent` = avg(effect_score) / 10 * 100 (0-10 scale to percentage)
- `last30Intakes` = count of intakes where taken_date is within last 30 days from `to`

#### 3. ME/CFS: Add clinical summary fields
- Extend `MeCfsAnalysis` type with: `avgScore: number|null`, `peakScore: number|null`, `peakLabel: string|null`, `documentationRate: number`
- Compute from `me_cfs_severity_score` on entries: avg of non-zero documented days, max score
- `peakLabel` maps score to severity label (0=none, 1-3=mild, 4-6=moderate, 7-10=severe)
- `documentationRate` = documentedDays / totalDaysInRange

#### 4. Weather trend: Add daily temp + pressure to intensityOverTime
- Extend `IntensityDataPoint` type with: `temperatureC: number|null`, `pressureMb: number|null`
- In chart building, merge weather data per date (same logic already in `buildWeatherAnalysis` weatherByDate map)
- Website can then render the combined Schmerz/Temperatur/Luftdruck chart

#### 5. Time-of-day histogram
- Add new type `TimeDistributionItem { hour: number; count: number }`
- Add to `DoctorReportCharts`: `timeDistribution: TimeDistributionItem[]`
- Compute from `allEntries`: extract hour from `selected_time` (HH:MM), group + count
- Only entries with pain_level != '-' and a valid selected_time

#### 6. Donut: No changes needed
- `analysis.headacheDayDonut` already matches the PDF exactly. Website uses:
  - `painFreeDays` / `painDaysNoTriptan` / `triptanDays` / `totalDays` / `percentages`

### Technical Details

**New DB queries added to parallel fetch:**
- `user_symptom_burden` (user_id filter)
- `medication_effects` (entry_id in range entries)
- `medication_intakes` with taken_date in last-30-day window

**Type extensions (additive, all optional):**
```text
SymptomStatItem += group, burdenLevel, burdenLabel, relevanceScore
MedicationStat += last30Intakes, avgEffectPercent, ratedCount
MeCfsAnalysis += avgScore, peakScore, peakLabel, documentationRate
IntensityDataPoint += temperatureC, pressureMb
DoctorReportCharts += timeDistribution
```

**Backward compatibility:** All new fields are optional additions. Existing consumers see no breaking changes.

**SSOT sources reused:**
- Symptom grouping: `symptomSection.ts` classification lists (mirrored in edge function)
- Burden labels: `useSymptomBurden.ts` BURDEN_LABELS
- Pain normalization: existing `painLevelToNumber`
- Donut: existing `buildHeadacheDayDonut` (unchanged)
- Weather buckets: existing `buildWeatherAnalysis` (unchanged)

**Files modified:** Only `supabase/functions/_shared/doctorReportSnapshot.ts`

**Deployment:** Edge function auto-deploys. Snapshot cache invalidates via TTL, so new fields appear on next rebuild.

