/**
 * AnalysisHistoryList.tsx
 *
 * Calm, mobile-friendly list of saved pattern analyses.
 * The whole card is clickable. The 3-dot menu is in the top-right corner
 * and stops propagation so it never opens the card by accident.
 * The selected card is only marked subtly (thin emerald border + faint
 * tint + small "Geöffnet" chip) — never as a fully filled green block.
 */

import React, { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
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
    const months = ['Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return `${d.getDate()}. ${months[d.getMonth()]} · ${time}`;
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
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20',
  },
  other_range: {
    label: 'Anderer Zeitraum',
    cls: 'bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border/50',
  },
  version_drift: {
    label: 'Neue Logik',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/20',
  },
  data_drift: {
    label: 'Neue Daten',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/20',
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

  const stop = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <section data-testid="analysis-history-list" className="space-y-3">
      <div className="px-1 space-y-0.5">
        <h3 className="text-sm font-medium text-foreground">Gespeicherte Analysen</h3>
        <p className="text-xs text-muted-foreground">
          Öffne eine frühere Analyse oder erstelle eine neue für den gewählten Zeitraum.
        </p>
      </div>

      <ul className="space-y-2">
        {entries.map((entry) => {
          const badge = classifyEntry(entry, selectedFrom, selectedTo, currentSignature);
          const meta = BADGE_STYLE[badge];
          const isActive = activeId === entry.id;

          const handleActivate = () => onSelect(entry);
          const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleActivate();
            }
          };

          return (
            <li key={entry.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={handleActivate}
                onKeyDown={handleKey}
                data-testid={`history-card-${entry.id}`}
                data-active={isActive ? 'true' : 'false'}
                aria-pressed={isActive}
                className={[
                  'relative w-full text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'border-emerald-500/40 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]'
                    : 'border-border/60 bg-card hover:bg-accent/30',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground leading-tight">
                      {formatCreatedAt(entry.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.fromDate && entry.toDate
                        ? `${formatDate(entry.fromDate)} – ${formatDate(entry.toDate)}`
                        : 'Zeitraum unbekannt'}
                    </p>
                  </div>

                  <div className="flex items-start gap-1.5 shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      {isActive && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                          Geöffnet
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap ${meta.cls}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={stop}
                          onKeyDown={stop}
                          className="h-8 w-8 -mr-1.5 -mt-1 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          aria-label="Analyse verwalten"
                          data-testid={`history-menu-${entry.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-44"
                        onClick={stop}
                      >
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setPendingDelete(entry);
                          }}
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

                {chips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] text-muted-foreground bg-muted/40 ring-1 ring-inset ring-border/40"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-foreground"
          onClick={onLoadMore}
          disabled={loadingMore}
          data-testid="history-load-more"
        >
          {loadingMore ? 'Lädt …' : 'Weitere Analysen laden'}
        </Button>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Analyse löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Nur die gespeicherte Analyse wird entfernt. Deine Tagebuchdaten bleiben erhalten.
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
    </section>
  );
}
