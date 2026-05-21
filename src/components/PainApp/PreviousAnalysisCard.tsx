/**
 * PreviousAnalysisCard.tsx
 *
 * Compact preview card for a previously generated analysis that does
 * not match the currently selected time range. Designed so it can later
 * be extended to a list of "Vorherige Analysen".
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, ChevronRight } from 'lucide-react';

export interface PreviousAnalysisEntry {
  /** ISO datetime of creation (e.g. cachedAt). */
  createdAt: string | null;
  /** Range covered by the analysis (display strings or ISO dates). */
  fromDate: string | null;
  toDate: string | null;
  /** Short status text, e.g. "anderer Zeitraum" or "Analyse-Logik aktualisiert". */
  statusLabel?: string;
}

interface PreviousAnalysisCardProps {
  entry: PreviousAnalysisEntry;
  onView: () => void;
  /** Optional formatter for the createdAt timestamp. */
  formatCreatedAt?: (iso: string) => string;
}

function defaultFormatCreatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const months = ['Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return `${day}. ${months[d.getMonth()]} ${time}`;
  } catch {
    return iso;
  }
}

export function PreviousAnalysisCard({ entry, onView, formatCreatedAt }: PreviousAnalysisCardProps) {
  const created = entry.createdAt
    ? (formatCreatedAt ?? defaultFormatCreatedAt)(entry.createdAt)
    : null;
  const range = entry.fromDate && entry.toDate ? `${entry.fromDate} – ${entry.toDate}` : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Letzte Analyse</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {created}
              {created && range ? ' · ' : ''}
              {range}
            </p>
            {entry.statusLabel && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                {entry.statusLabel}
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={onView}>
          Letzte Analyse anzeigen
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
