/**
 * KiAnalyseDialog
 *
 * Einheitlicher Einstiegspunkt für alle KI-Analyse-Pfade:
 *   - Analyse ansehen (Live-Karten im Statistik-Tab)
 *   - Nur KI-Analyse als PDF (kompakter Bericht)
 *   - Tagebuch + KI-Analyse als PDF (vollständiger Arztbericht)
 *
 * Zeigt die jeweilige Monats-Quota an, ohne zu blockieren — die
 * Edge Functions sind die letztgültige Quelle (SSOT).
 */

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, FileText, BookOpen, Brain } from "lucide-react";
import { useAnalysisGateState } from "@/lib/voice/useAnalysisGateState";
import { useDiaryReportQuota } from "@/features/ai-reports/hooks/useDiaryReportQuota";

export type KiAnalyseChoice = "view" | "ai_only_pdf" | "full_pdf";

interface KiAnalyseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (choice: KiAnalyseChoice) => void;
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  quotaLabel?: string;
  onClick: () => void;
}

function ActionCard({ icon, title, description, quotaLabel, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border/60 hover:bg-muted/40 hover:border-primary/40 transition-colors p-4 flex items-start gap-4 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="p-2.5 rounded-md bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-base block">{title}</span>
          {quotaLabel && (
            <span className="text-xs text-muted-foreground shrink-0">{quotaLabel}</span>
          )}
        </div>
        <span className="text-sm text-muted-foreground mt-0.5 block leading-snug">
          {description}
        </span>
      </div>
    </button>
  );
}

export const KiAnalyseDialog: React.FC<KiAnalyseDialogProps> = ({ open, onOpenChange, onChoose }) => {
  const viewGate = useAnalysisGateState(open ? 1 : 0);
  const { data: pdfQuota } = useDiaryReportQuota();

  const viewLabel = viewGate.loading
    ? ""
    : viewGate.isUnlimited
    ? "unbegrenzt"
    : `${Math.max(0, viewGate.limit - viewGate.usageCount)} / ${viewGate.limit} übrig`;

  const pdfLabel = !pdfQuota
    ? ""
    : pdfQuota.isUnlimited
    ? "unbegrenzt"
    : `${pdfQuota.remaining} / ${pdfQuota.limit} übrig`;

  const handle = (choice: KiAnalyseChoice) => {
    onOpenChange(false);
    // Defer to next tick so the dialog can close cleanly before view changes.
    setTimeout(() => onChoose(choice), 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            KI-Analyse
          </DialogTitle>
          <DialogDescription>
            Was möchtest du tun? Du kannst die Analyse direkt ansehen oder
            als PDF erzeugen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <ActionCard
            icon={<Eye className="h-5 w-5" />}
            title="Analyse ansehen"
            description="Muster und Hinweise direkt in der App — kein Download."
            quotaLabel={viewLabel}
            onClick={() => handle("view")}
          />
          <ActionCard
            icon={<FileText className="h-5 w-5" />}
            title="Nur KI-Analyse als PDF"
            description="Kompakter Bericht zum Teilen oder Speichern."
            quotaLabel={pdfLabel}
            onClick={() => handle("ai_only_pdf")}
          />
          <ActionCard
            icon={<BookOpen className="h-5 w-5" />}
            title="Tagebuch + KI-Analyse als PDF"
            description="Vollständiger Arztbericht mit Einträgen und Auswertung."
            quotaLabel={pdfLabel}
            onClick={() => handle("full_pdf")}
          />
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default KiAnalyseDialog;
