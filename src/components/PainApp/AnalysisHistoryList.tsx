/**
 * AnalysisHistoryList.tsx
 *
 * Renders the user's most recent saved pattern analyses as a clickable
 * list. The time-range filter in the parent decides only what gets
 * analysed *next* — past analyses always remain accessible here.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, ChevronRight } from 'lucide-react';
import type { AnalysisHistoryEntry } from '@/lib/voice/analysisCache';
import { extractSignatureVersion } from '@/lib/voice/analysisCache';

export type HistoryBadge = 'current' | 'older' | 'other_range';

function formatCreatedAt(iso: string): string {
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

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}.${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export function classifyEntry(
  entry: AnalysisHistoryEntry,
  selectedFrom: string,
  selectedTo: string,
  currentSignature: string | null,
): HistoryBadge {
  const sameRange = entry.fromDate === selectedFrom && entry.toDate === selectedTo;
  if (!sameRange) return 'other_range';
  // Same range: check version + data signature.
  if (
    currentSignature &&
    entry.dataStateSignature &&
    entry.dataStateSignature === currentSignature
  ) {
    return 'current';
  }
  // Version drift counts as older.
  const storedV = extractSignatureVersion(entry.dataStateSignature);
  const currentV = extractSignatureVersion(currentSignature);
  if (storedV && currentV && storedV !== currentV) return 'older';
  return 'older';
}

const BADGE_STYLE: Record<HistoryBadge, { label: string; cls: string }> = {
  current: {
    label: 'Aktuell',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  older: {
    label: 'Ältere Analyse',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  other_range: {
    label: 'Anderer Zeitraum',
    cls: 'bg-muted text-muted-foreground',
  },
};

interface Props {
  entries: AnalysisHistoryEntry[];
  selectedFrom: string;
  selectedTo: string;
  currentSignature: string | null;
  activeId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (entry: AnalysisHistoryEntry) => void;
  onLoadMore: () => void;
}

export function AnalysisHistoryList({
  entries,
  selectedFrom,
  selectedTo,
  currentSignature,
  activeId,
  hasMore,
  loadingMore,
  onSelect,
  onLoadMore,
}: Props) {
  if (entries.length === 0) return null;

  return (
    <Card data-testid="analysis-history-list">
      <CardContent className="p-4 space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium text-foreground">Letzte Analysen</h3>
          <p className="text-xs text-muted-foreground">
            Wähle eine gespeicherte Analyse oder erstelle eine neue für den oben gewählten Zeitraum.
          </p>
        </div>

        <ul className="space-y-2">
          {entries.map((entry) => {
            const badge = classifyEntry(entry, selectedFrom, selectedTo, currentSignature);
            const meta = BADGE_STYLE[badge];
            const isActive = activeId === entry.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  data-testid={`history-card-${entry.id}`}
                  className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring ${
                    isActive ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {formatCreatedAt(entry.createdAt)}
                        </p>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wide shrink-0 ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.fromDate && entry.toDate
                          ? `${formatDate(entry.fromDate)} – ${formatDate(entry.toDate)}`
                          : 'Zeitraum unbekannt'}
                      </p>
                      {(entry.daysAnalyzed != null || entry.painEntryCount != null) && (
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                          {entry.daysAnalyzed != null && `${entry.daysAnalyzed} Tage`}
                          {entry.painEntryCount != null && entry.daysAnalyzed != null && ' · '}
                          {entry.painEntryCount != null && `${entry.painEntryCount} Schmerzeinträge`}
                        </p>
                      )}
                      <span className="mt-1.5 inline-flex items-center text-[11px] text-primary">
                        Analyse anzeigen
                        <ChevronRight className="h-3 w-3 ml-0.5" />
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="history-load-more"
          >
            {loadingMore ? 'Lädt …' : 'Weitere Analysen laden'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
