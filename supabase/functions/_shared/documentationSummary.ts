/**
 * documentationSummary.ts — friendly documentation conclusion
 *
 * Pure, no I/O. Used by both server (deterministic builder) and client
 * report renderer. Avoids harsh wording like "unzureichend" / "Mangel".
 *
 * Mirrored 1:1 in supabase/functions/_shared/documentationSummary.ts
 */

export interface DocumentationInput {
  rangeDays: number;
  anyEntryDays: number;       // unique YYYY-MM-DD with at least one signal
  painDays: number;
  medDays: number;
  mecfsDays: number;
  contextNoteCount: number;
  effectRatingCount: number;
  weatherDaysCapped: number;  // already capped to rangeDays
}

export interface DocumentationSummary {
  coverage: number;
  tone: "good" | "solid" | "growing";
  headline: string;
  detailHints: string[];
  /** Combined plain-language text used in finding summary. */
  plainText: string;
}

export function computeDocumentationSummary(input: DocumentationInput): DocumentationSummary {
  const { rangeDays, anyEntryDays } = input;
  const coverage = rangeDays > 0 ? anyEntryDays / rangeDays : 0;

  let tone: DocumentationSummary["tone"];
  let headline: string;
  if (coverage >= 0.8) {
    tone = "good";
    headline = `Du hast an ${anyEntryDays} von ${rangeDays} Tagen Einträge dokumentiert. Die Grundlage für Verlauf und Belastung ist dadurch gut.`;
  } else if (coverage >= 0.5) {
    tone = "solid";
    headline = `An ${anyEntryDays} von ${rangeDays} Tagen sind Einträge vorhanden. Das reicht für eine solide Einschätzung von Verlauf und Medikamenten.`;
  } else {
    tone = "growing";
    headline = `An ${anyEntryDays} von ${rangeDays} Tagen sind Einträge dokumentiert. Für stabilere Aussagen wären weitere Tage hilfreich – schon kurze Einträge zählen.`;
  }

  const detailHints: string[] = [];
  if (input.mecfsDays / Math.max(1, rangeDays) < 0.3) {
    detailHints.push("Für PEM-/Energie-Muster wären zusätzliche kurze Energie-Einträge hilfreich.");
  }
  if (input.contextNoteCount / Math.max(1, rangeDays) < 0.3) {
    detailHints.push("Tagesfaktoren wie Schlaf, Stress oder Auslöser helfen, feinere Zusammenhänge zu erkennen.");
  }
  if (input.effectRatingCount === 0 && input.medDays > 0) {
    detailHints.push("Medikamentenwirkung kurz zu bewerten verbessert die Auswertung der Akutstrategie.");
  }

  const tail =
    "Verlauf und Medikamententrends bleiben gut auswertbar; Trigger- und PEM-Zusammenhänge sind ohne Detaildaten vorsichtiger.";
  const plainText = detailHints.length > 0
    ? `${headline} ${detailHints.join(" ")} ${tail}`
    : `${headline} ${tail}`;

  return {
    coverage: Math.round(coverage * 1000) / 1000,
    tone,
    headline,
    detailHints,
    plainText,
  };
}
