// V2.1 expanded findings postprocessing — extracted from index.ts so it
// can be imported in tests without starting the HTTP server.

export const V21_CATEGORIES = [
  "burden", "chronification", "medication_use", "medication_effect",
  "preventive_course", "symptoms_aura", "weather", "mecfs_energy_pem",
  "sleep", "stress_mood", "lifestyle_triggers", "time_pattern",
  "cycle_hormonal", "interaction", "data_quality", "red_flag",
] as const;
export const V21_EVIDENCE = ["high", "moderate", "low", "insufficient"] as const;
export const V21_SOURCE_BASIS = ["deterministic_finding", "preanalysis", "aggregated_daily_data", "data_gap"] as const;
export const V21_RELEVANCE = ["high", "medium", "low"] as const;

export const MAX_EXPANDED_FINDINGS = 24;

export interface ExpandedFinding {
  id: string;
  category: string;
  title: string;
  evidence_level: string;
  source_basis: string;
  related_deterministic_finding_ids: string[];
  summary: string;
  reasoning: string;
  limitations: string[];
  patient_relevance: string;
  doctor_relevance: string;
  recommended_tracking_next: string[];
  doctor_discussion_points: string[];
}

/**
 * Light normalization of a free-form text so dedupe can catch
 * different surface forms of the same finding summary.
 */
function normSummary(s: string): string {
  return s.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?„"'»«()\-–—]/g, '')
    .trim()
    .slice(0, 140);
}

export function postprocessExpandedFindings(
  raw: unknown,
  deterministicFindingIds: Set<string>,
): ExpandedFinding[] {
  if (!Array.isArray(raw)) return [];
  const cats = new Set<string>(V21_CATEGORIES);
  const evi = new Set<string>(V21_EVIDENCE);
  const src = new Set<string>(V21_SOURCE_BASIS);
  const rel = new Set<string>(V21_RELEVANCE);

  const out: ExpandedFinding[] = [];
  const seenKey = new Set<string>();
  const seenSummary = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : '';
    const title = typeof f.title === 'string' ? f.title.trim() : '';
    const summary = typeof f.summary === 'string' ? f.summary.trim() : '';
    if (!title || !summary) continue;

    let sourceBasis = typeof f.source_basis === 'string' && src.has(f.source_basis) ? f.source_basis : null;
    if (!sourceBasis) continue;

    const reasoning = typeof f.reasoning === 'string' ? f.reasoning.trim() : '';
    if (sourceBasis !== 'data_gap' && reasoning.length < 5) continue;

    const related = Array.isArray(f.related_deterministic_finding_ids)
      ? (f.related_deterministic_finding_ids as unknown[])
          .filter((x): x is string => typeof x === 'string' && deterministicFindingIds.has(x))
      : [];

    // Tolerance for evidence-grounded findings that lost their det id link:
    // if claimed deterministic_finding without matching ids but reasoning
    // mentions a data basis, downgrade to "preanalysis" rather than drop.
    if (sourceBasis === 'deterministic_finding' && related.length === 0 && reasoning.length >= 20) {
      sourceBasis = 'preanalysis';
    }

    const category = typeof f.category === 'string' && cats.has(f.category) ? f.category : 'data_quality';
    let evidenceLevel = typeof f.evidence_level === 'string' && evi.has(f.evidence_level) ? f.evidence_level : 'insufficient';
    if (sourceBasis === 'data_gap') evidenceLevel = 'insufficient';

    const titleKey = category + '::' + title.toLowerCase().slice(0, 80);
    const summaryKey = category + '::S::' + normSummary(summary);
    if (seenKey.has(titleKey) || seenSummary.has(summaryKey)) continue;
    seenKey.add(titleKey);
    seenSummary.add(summaryKey);

    out.push({
      id: id || `${category}.llm.${out.length + 1}`,
      category,
      title,
      evidence_level: evidenceLevel,
      source_basis: sourceBasis,
      related_deterministic_finding_ids: related,
      summary,
      reasoning,
      limitations: Array.isArray(f.limitations) ? (f.limitations as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      patient_relevance: typeof f.patient_relevance === 'string' && rel.has(f.patient_relevance) ? f.patient_relevance : 'low',
      doctor_relevance: typeof f.doctor_relevance === 'string' && rel.has(f.doctor_relevance) ? f.doctor_relevance : 'low',
      recommended_tracking_next: Array.isArray(f.recommended_tracking_next)
        ? (f.recommended_tracking_next as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      doctor_discussion_points: Array.isArray(f.doctor_discussion_points)
        ? (f.doctor_discussion_points as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    });

    if (out.length >= MAX_EXPANDED_FINDINGS) break;
  }

  // Guarantee at least one data_quality finding with discussion/tracking
  // survives, as long as the LLM produced one. If we dropped them all
  // by accident, this is a no-op.
  const hasDataQualityWithDoc = out.some(
    (f) => f.category === 'data_quality' &&
      (f.doctor_discussion_points.length > 0 || f.recommended_tracking_next.length > 0),
  );
  if (!hasDataQualityWithDoc && Array.isArray(raw)) {
    const candidate = (raw as Array<Record<string, unknown>>).find((r) => {
      const cat = typeof r.category === 'string' ? r.category : '';
      const dd = Array.isArray(r.doctor_discussion_points) && r.doctor_discussion_points.length > 0;
      const rt = Array.isArray(r.recommended_tracking_next) && r.recommended_tracking_next.length > 0;
      const t = typeof r.title === 'string' ? r.title.trim() : '';
      const s = typeof r.summary === 'string' ? r.summary.trim() : '';
      return cat === 'data_quality' && (dd || rt) && t && s;
    });
    if (candidate && out.length < MAX_EXPANDED_FINDINGS) {
      out.push({
        id: typeof candidate.id === 'string' ? candidate.id : `data_quality.llm.kept`,
        category: 'data_quality',
        title: String(candidate.title).trim(),
        evidence_level: 'insufficient',
        source_basis: 'data_gap',
        related_deterministic_finding_ids: [],
        summary: String(candidate.summary).trim(),
        reasoning: typeof candidate.reasoning === 'string' ? candidate.reasoning : '',
        limitations: [],
        patient_relevance: 'low',
        doctor_relevance: 'medium',
        recommended_tracking_next: Array.isArray(candidate.recommended_tracking_next)
          ? (candidate.recommended_tracking_next as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
        doctor_discussion_points: Array.isArray(candidate.doctor_discussion_points)
          ? (candidate.doctor_discussion_points as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
      });
    }
  }

  return out;
}
