/**
 * AnalysisHistoryList.tsx
 *
 * Renders the user's saved pattern analyses as a clean, calm list.
 * Each card shows date/time, range, key metrics, a status badge, and
 * a manage menu (3-dot) for deletion. The currently opened analysis is
 * marked subtly (thin border + small "Geöffnet" tag), never as a full
 * CTA-style green card.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AnalysisHistoryEntry } from '@/lib/voice/analysisCache';
import { extractSignatureVersion } from '@/lib/voice/analysisCache';

export type HistoryBadge =
  | 'current'
  | 'other_range'
  | 'version_drift'
  | 'data_drift';

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

  // Same range → check version then data signature.
  const storedV = extractSignatureVersion(entry.dataStateSignature);
  const currentV = extractSignatureVersion(currentSignature);
  if (storedV && currentV && storedV !== currentV) return 'version_drift';

  if (
    currentSignature &&
    entry.dataStateSignature &&
    entry.dataStateSignature === currentSignature
  ) {
    return 'current';
  }
  return 'data_drift';
}

const BADGE_STYLE: Record<HistoryBadge, { label: string; cls: string }> = {
  current: {
    label: 'Aktuell',
    cls: 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  },
  other_range: {
    label: 'Anderer Zeitraum',
    cls: 'bg-muted text-muted-foreground',
  },
  version_drift: {
    label: 'Analyse-Logik aktualisiert',
    cls: 'bg-amber-100/70 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  },
  data_drift: {
    label: 'Neue Daten',
    cls: 'bg-amber-100/70 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
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
  onDelete: (entry: AnalysisHistoryEntry) => Promise<void> | void;
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
  onDelete,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState<AnalysisHistoryEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (entries.length === 0) return null;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(pendingDelete);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <Card data-testid="analysis-history-list">
      <CardContent className="p-4 space-y-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium text-foreground">Gespeicherte Analysen</h3>
          <p className="text-xs text-muted-foreground">
            Öffne eine gespeicherte Analyse oder erstelle eine neue für den oben gewählten Zeitraum.
          </p>
        </div>

        <ul className="space-y-2">
          {entries.map((entry) => {
            const badge = classifyEntry(entry, selectedFrom, selectedTo, currentSignature);
            const meta = BADGE_STYLE[badge];
            const isActive = activeId === entry.id;

            return (
              <li key={entry.id}>
                <div
                  data-testid={`history-card-${entry.id}`}
                  data-active={isActive ? 'true' : 'false'}
                  className={`group rounded-md border px-3 py-2.5 transition-colors ${
                    isActive
                      ? 'border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/10'
                      : 'border-border hover:bg-accent/30'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {formatCreatedAt(entry.createdAt)}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isActive && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] tracking-wide bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                              Geöffnet
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wide ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                        </div>
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
                          {entry.painEntryCount != null && `${entry.painEntryCount} Schmerztage`}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => onSelect(entry)}
                          data-testid={`history-open-${entry.id}`}
                          className="text-[11px] text-primary hover:underline focus:outline-none focus:underline"
                        >
                          {isActive ? 'Geöffnet' : 'Öffnen'}
                        </button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              aria-label="Analyse verwalten"
                              data-testid={`history-menu-${entry.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => setPendingDelete(entry)}
                              className="text-destructive focus:text-destructive"
                              data-testid={`history-delete-${entry.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Analyse löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
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

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Analyse löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese gespeicherte Analyse wird entfernt. Deine Tagebuchdaten bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="history-delete-confirm"
            >
              {isDeleting ? 'Lösche …' : 'Analyse löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
