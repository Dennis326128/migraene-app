/**
 * AnalysisV21Sections
 *
 * Renders an `analysisV21` payload (with optional `llm_expanded_findings`)
 * using the section taxonomy defined in `normalizeAnalysisFindings`.
 *
 * Used by `MigrainePatternAnalysis` when the loaded result is V2.1.
 * Pure presentational; data shaping happens in the normalizer.
 */
import React from "react";
import {
  normalizeAnalysisFindings,
  groupFindingsBySection,
  getEvidenceBadgeVariant,
  SECTION_ORDER,
  SECTION_LABEL,
  type NormalizedAnalysisFinding,
  type AnalysisSectionKey,
} from "@/lib/ai/normalizeAnalysisFindings";
import { curateFindingsV22, applySectionCaps } from "@/lib/ai/curateFindingsV22";

interface Props {
  /** Whole `VoiceAnalysisResult` (already has analysisV21 attached) or response_json. */
  responseJson: unknown;
  doctorShare?: boolean;
  /** Opt-in: show Voice-event data_quality cards (off by default in V2.2). */
  showVoiceQualityNotes?: boolean;
}

export function AnalysisV21Sections({ responseJson, doctorShare = false, showVoiceQualityNotes = false }: Props) {
  const curated = React.useMemo(() => {
    const raw = normalizeAnalysisFindings(responseJson, { doctorShare });
    return curateFindingsV22(raw, responseJson, { showVoiceQualityNotes });
  }, [responseJson, doctorShare, showVoiceQualityNotes]);
  const grouped = React.useMemo(() => groupFindingsBySection(curated.findings), [curated.findings]);
  const openQuestions = curated.openQuestions;

  const v21 = (responseJson as any)?.analysisV21 ?? null;
  const dataBasis = v21?.data_basis as Record<string, unknown> | undefined;
  const period = v21?.period as Record<string, unknown> | undefined;
  const caution = v21?.clinical_caution as Record<string, unknown> | undefined;
  const version = v21?.analysis_version as string | undefined;

  if (!v21) return null;

  return (
    <div className="space-y-7">
      <DataBasisCard dataBasis={dataBasis} period={period} version={version} />

      {SECTION_ORDER.map((key) => {
        if (key === "open_questions") {
          if (openQuestions.length === 0) return null;
          return (
            <Section key={key} title={SECTION_LABEL[key]}>
              <ul className="list-disc pl-4 space-y-1 text-[13px] text-foreground/80 leading-[1.7]">
                {openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Section>
          );
        }
        const items = dedupSection(grouped[key]);
        if (items.length === 0) return null;
        return (
          <Section key={key} title={SECTION_LABEL[key]}>
            <div className="space-y-4">
              {items.map((f) => <FindingCard key={f.id} f={f} />)}
            </div>
          </Section>
        );
      })}

      {caution && (
        <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
          {(caution.emergency_disclaimer as string) || "Keine medizinische Diagnose."}
        </p>
      )}
    </div>
  );
}

function dedupSection(items: NormalizedAnalysisFinding[]): NormalizedAnalysisFinding[] {
  const seen = new Set<string>();
  const out: NormalizedAnalysisFinding[] = [];
  for (const f of items) {
    const k = f.category + "::" + f.title.toLowerCase().slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function DataBasisCard({
  dataBasis, period, version,
}: { dataBasis?: Record<string, unknown>; period?: Record<string, unknown>; version?: string }) {
  if (!dataBasis && !period) return null;
  const fmt = (d?: unknown) => {
    if (typeof d !== "string") return "—";
    try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
  };
  const rows: Array<[string, unknown]> = [
    ["Zeitraum", `${fmt(period?.from)} – ${fmt(period?.to)}`],
    ["Analyseversion", version ?? "—"],
    ["Dokumentierte Tage", dataBasis?.documented_days ?? "—"],
    ["Schmerztage", dataBasis?.pain_days ?? "—"],
    ["Medikamententage", dataBasis?.medication_intake_days ?? "—"],
    ["Wettertage", dataBasis?.weather_days ?? "—"],
    ["ME/CFS- & Energietage", dataBasis?.mecfs_energy_days ?? "—"],
  ];
  return (
    <div className="rounded-lg bg-muted/20 px-4 py-3">
      <h4 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80 mb-2">
        Datenbasis
      </h4>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground/85 text-right tabular-nums">{String(v ?? "—")}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-[10px] text-muted-foreground/70 mt-2">
        Hinweise, keine Diagnose · private Notizen sind ausgeschlossen
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FindingCard({ f }: { f: NormalizedAnalysisFinding }) {
  const badge = getEvidenceBadgeVariant(f.evidenceLevel);
  const toneClass =
    badge.tone === "strong" ? "bg-primary/10 text-primary"
    : badge.tone === "medium" ? "bg-muted text-foreground/80"
    : badge.tone === "weak" ? "bg-muted/50 text-muted-foreground"
    : "bg-amber-100/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200";
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[13px] font-medium text-foreground leading-snug">{f.title}</h4>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wide shrink-0 ${toneClass}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground/70 uppercase tracking-wide">{f.category}</p>
      <p className="text-[13px] text-foreground/80 leading-[1.7]">{f.summary}</p>
      {f.reasoning && (
        <p className="text-[12px] text-foreground/65 leading-[1.6]">{f.reasoning}</p>
      )}
      {f.limitations.length > 0 && (
        <ul className="text-[11px] text-muted-foreground/80 list-disc pl-4 space-y-0.5">
          {f.limitations.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {f.recommendedTrackingNext.length > 0 && (
        <p className="text-[11px] text-muted-foreground/80">
          Nächste Dokumentation: {f.recommendedTrackingNext.join(" · ")}
        </p>
      )}
      {f.doctorDiscussionPoints.length > 0 && (
        <p className="text-[11px] text-muted-foreground/80">
          Arztgespräch: {f.doctorDiscussionPoints.join(" · ")}
        </p>
      )}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground/70 italic leading-[1.6]">{children}</p>;
}
