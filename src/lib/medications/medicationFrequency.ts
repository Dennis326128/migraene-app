/**
 * Medication Frequency / Dosing Label SSOT
 * Used by UI and PDF to produce professional, consistent dosage descriptions.
 */

export type RegularFrequency =
  | "daily_1x"
  | "daily_2x"
  | "daily_3x"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "other";

export const FREQUENCY_OPTIONS: { value: RegularFrequency; label: string }[] = [
  { value: "daily_1x", label: "1× täglich" },
  { value: "daily_2x", label: "2× täglich" },
  { value: "daily_3x", label: "3× täglich" },
  { value: "weekly", label: "1× pro Woche" },
  { value: "monthly", label: "1× pro Monat" },
  { value: "quarterly", label: "1× pro Quartal" },
  { value: "other", label: "Anderer Rhythmus" },
];

export function frequencyLabel(freq: RegularFrequency | null | undefined): string {
  const found = FREQUENCY_OPTIONS.find((o) => o.value === freq);
  return found ? found.label : "regelmäßig";
}

// CGRP-Antikörper (typischerweise monatlich/quartalsweise)
const MONTHLY_CGRP_PATTERNS = [
  /ajovy/i,
  /fremanezumab/i,
  /emgality/i,
  /galcanezumab/i,
  /aimovig/i,
  /erenumab/i,
];

const QUARTERLY_PATTERNS = [/vyepti/i, /eptinezumab/i];

export function detectImplicitFrequency(
  name: string | null | undefined
): RegularFrequency | null {
  if (!name) return null;
  if (QUARTERLY_PATTERNS.some((r) => r.test(name))) return "quarterly";
  if (MONTHLY_CGRP_PATTERNS.some((r) => r.test(name))) return "monthly";
  return null;
}

export interface DoseLabelInput {
  name?: string | null;
  intake_type?: string | null;
  art?: string | null;
  regular_frequency?: string | null;
  dosis_morgens?: string | null;
  dosis_mittags?: string | null;
  dosis_abends?: string | null;
  dosis_nacht?: string | null;
  regular_weekdays?: string[] | null;
  as_needed_standard_dose?: string | null;
  as_needed_max_per_24h?: number | null;
  as_needed_max_days_per_month?: number | null;
  as_needed_min_interval_hours?: number | null;
  dosis_bedarf?: string | null;
}

export type DoseMode = "asNeeded" | "daily" | "periodic";

export interface ComputedDose {
  mode: DoseMode;
  label: string; // Hauptlabel, z.B. "1× monatlich", "bei Bedarf", "2× täglich"
  detail?: string; // Optional, z.B. "max. 2x/Tag, 4h Abstand"
}

export function computeDoseDescription(med: DoseLabelInput): ComputedDose {
  const isRegular =
    med.intake_type === "regular" ||
    med.art === "prophylaxe" ||
    med.art === "regelmaessig";

  // ── AS-NEEDED ────────────────────────────────────────────────
  if (!isRegular) {
    const parts: string[] = [];
    if (med.as_needed_standard_dose) parts.push(med.as_needed_standard_dose);
    if (med.as_needed_max_per_24h)
      parts.push(`max. ${med.as_needed_max_per_24h}×/Tag`);
    if (med.as_needed_max_days_per_month)
      parts.push(`max. ${med.as_needed_max_days_per_month} Tage/Monat`);
    if (med.as_needed_min_interval_hours)
      parts.push(`Abstand ${med.as_needed_min_interval_hours} h`);
    if (parts.length === 0 && med.dosis_bedarf) parts.push(med.dosis_bedarf);
    return {
      mode: "asNeeded",
      label: "bei Bedarf",
      detail: parts.length ? parts.join(", ") : undefined,
    };
  }

  // ── REGULAR ──────────────────────────────────────────────────
  const explicit = med.regular_frequency as RegularFrequency | undefined;
  const freq = explicit && explicit.length > 0
    ? explicit
    : detectImplicitFrequency(med.name) ?? null;

  // Generic dose text for periodic schedules (e.g., "1 Injektion", "225 mg")
  const periodicDoseDetail = med.as_needed_standard_dose?.trim() || "";

  if (freq === "monthly")
    return { mode: "periodic", label: "1× monatlich", detail: periodicDoseDetail || undefined };
  if (freq === "quarterly")
    return { mode: "periodic", label: "1× pro Quartal", detail: periodicDoseDetail || undefined };
  if (freq === "weekly") {
    const weekdays = med.regular_weekdays?.filter(Boolean) ?? [];
    const detailParts = [
      weekdays.length > 0 && weekdays.length < 7 ? weekdays.join(", ") : "",
      periodicDoseDetail,
    ].filter(Boolean);
    return {
      mode: "periodic",
      label: weekdays.length > 0 && weekdays.length < 7 ? "wöchentlich" : "1× pro Woche",
      detail: detailParts.length ? detailParts.join(" · ") : undefined,
    };
  }
  if (freq === "daily_3x") return { mode: "daily", label: "3× täglich" };
  if (freq === "daily_2x") return { mode: "daily", label: "2× täglich" };
  if (freq === "daily_1x") return { mode: "daily", label: "1× täglich" };

  // ── FALLBACK: aus Tagesdosen ableiten ────────────────────────
  const filled = [
    med.dosis_morgens,
    med.dosis_mittags,
    med.dosis_abends,
    med.dosis_nacht,
  ].filter((d) => d && d.trim().length > 0).length;
  if (filled >= 3) return { mode: "daily", label: `${filled}× täglich` };
  if (filled === 2) return { mode: "daily", label: "2× täglich" };
  if (filled === 1) return { mode: "daily", label: "1× täglich" };

  // ── Wochentage ohne explizite Frequenz ───────────────────────
  const weekdays = med.regular_weekdays?.filter(Boolean) ?? [];
  if (weekdays.length > 0 && weekdays.length < 7) {
    return { mode: "periodic", label: "wöchentlich", detail: weekdays.join(", ") };
  }

  // ── Letzter Fallback: implizite Erkennung ────────────────────
  const implicit = detectImplicitFrequency(med.name);
  if (implicit === "monthly") return { mode: "periodic", label: "1× monatlich" };
  if (implicit === "quarterly")
    return { mode: "periodic", label: "1× pro Quartal" };

  return { mode: "periodic", label: "regelmäßig" };
}
