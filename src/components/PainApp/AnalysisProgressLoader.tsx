/**
 * AnalysisProgressLoader
 *
 * Stufenbasierter Ladezustand für die KI-Analyse.
 * - Kein Fake-Prozentwert (kein "87 %").
 * - Indeterminate-Balken (sliding) + wechselnder Status-Text.
 * - Nach ~25 s zusätzlicher Geduldshinweis.
 *
 * Reines Presentation-Component — keine Business-Logik.
 */
import React from "react";
import { Loader2 } from "lucide-react";

const STAGES: string[] = [
  "Daten werden vorbereitet …",
  "Schmerz- und Medikamentenmuster werden berechnet …",
  "Wetter, Zeitmuster und ME/CFS-Signale werden geprüft …",
  "KI-Auswertung wird erstellt …",
  "Ergebnis wird gespeichert …",
];

const STAGE_INTERVAL_MS = 4500;
const PATIENCE_HINT_MS = 25_000;

export function AnalysisProgressLoader() {
  const [stageIdx, setStageIdx] = React.useState(0);
  const [showPatience, setShowPatience] = React.useState(false);

  React.useEffect(() => {
    const t = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    const p = setTimeout(() => setShowPatience(true), PATIENCE_HINT_MS);
    return () => { clearInterval(t); clearTimeout(p); };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="analysis-progress-loader"
      className="rounded-lg bg-muted/20 px-4 py-5 space-y-3"
    >
      <div className="flex items-center gap-2 text-[13px] text-foreground/85">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span>{STAGES[stageIdx]}</span>
      </div>

      {/* Indeterminate progress bar — keine Prozentanzeige */}
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary/70 animate-[analysis-progress_1.8s_ease-in-out_infinite]" />
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Schritt {stageIdx + 1} von {STAGES.length}
      </p>

      {showPatience && (
        <p className="text-[11px] text-muted-foreground/80">
          Das kann bei vielen Einträgen etwas dauern. Bitte die App geöffnet lassen.
        </p>
      )}

      <style>{`
        @keyframes analysis-progress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(280%); }
        }
      `}</style>
    </div>
  );
}
