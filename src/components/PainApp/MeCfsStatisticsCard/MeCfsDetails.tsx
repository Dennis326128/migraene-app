/**
 * Collapsible details section for ME/CFS Statistics Card.
 * Shows methodology and extended stats on demand.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TouchSafeCollapsibleTrigger } from "@/components/ui/touch-collapsible";
import type { MeCfsDonutData } from "@/lib/mecfs/donutData";

interface MeCfsDetailsProps {
  data: MeCfsDonutData;
}

export function MeCfsDetails({ data }: MeCfsDetailsProps) {
  const [open, setOpen] = useState(false);

  const rangeLabel =
    data.p25 === data.p75
      ? `${data.p25}/10`
      : `${data.p25}–${data.p75}/10`;

  const showRange = data.calendarDays >= 14;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TouchSafeCollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <span>{open ? 'Details ausblenden' : 'Details anzeigen'}</span>
      </TouchSafeCollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pt-2 text-xs text-muted-foreground border-t border-border mt-2">
          {/* Typical range */}
          <div>
            <p className="font-medium text-foreground">Üblicher Bereich</p>
            {showRange ? (
              <p>{rangeLabel}</p>
            ) : (
              <p>Noch nicht ausreichend Daten</p>
            )}
          </div>

          {/* Methodology */}
          <div>
            <p className="font-medium text-foreground">Methodik</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Tageswert = höchste Belastung des Tages</li>
              <li>Belasteter Tag = Belastung &gt; 0</li>
              <li>Hochrechnung erst ab 14 Kalendertagen</li>
              <li>Bei kürzerem Zeitraum: nur absolute Werte</li>
              <li>Ab 30 Kalendertagen: reale Werte statt Projektionen</li>
            </ul>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
