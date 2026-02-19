/**
 * Collapsible details section for ME/CFS Statistics Card.
 * Shows methodology and extended stats on demand.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TouchSafeCollapsibleTrigger } from "@/components/ui/touch-collapsible";
import { scoreToLevel, levelToLabelDe } from "@/lib/mecfs/constants";
import type { MeCfsDonutData } from "@/lib/mecfs/donutData";

interface MeCfsDetailsProps {
  data: MeCfsDonutData;
}

export function MeCfsDetails({ data }: MeCfsDetailsProps) {
  const [open, setOpen] = useState(false);

  // Find the peak severity across all documented days
  const peakScore = Math.max(
    ...(data.distribution.severe > 0 ? [9] : []),
    ...(data.distribution.moderate > 0 ? [6] : []),
    ...(data.distribution.mild > 0 ? [3] : []),
    0,
  );
  const peakLabel = levelToLabelDe(scoreToLevel(peakScore));

  const rangeLabel =
    data.p25 === data.p75
      ? `${data.p25}/10`
      : `${data.p25}–${data.p75}/10`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TouchSafeCollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <span>{open ? 'Details ausblenden' : 'Details anzeigen'}</span>
      </TouchSafeCollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pt-2 text-xs text-muted-foreground border-t border-border mt-2">
          {/* Peak severity */}
          <div>
            <p className="font-medium text-foreground">Maximale Belastung im Zeitraum</p>
            <p className="capitalize">{peakLabel}</p>
          </div>

          {/* Typical range */}
          <div>
            <p className="font-medium text-foreground">Üblicher Bereich: {rangeLabel}</p>
            <p>Hier lagen die meisten deiner Tage.</p>
          </div>

          {/* Methodology */}
          <div>
            <p className="font-medium text-foreground">Methodik</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Tageswert = höchste Belastung des Tages.</li>
              <li>Belastete Tage = Tage mit Belastung &gt; 0.</li>
              <li>30-Tage-Projektion basiert auf dem Verhältnis belasteter Tage in der Datengrundlage.</li>
            </ul>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
