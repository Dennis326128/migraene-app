/**
 * Types for the ME/CFS Statistics Card components.
 */
import type { MeCfsDonutSegment } from "@/lib/mecfs/donutData";

export interface MeCfsSlice {
  segment: MeCfsDonutSegment;
  count: number;
  color: string;
  label: string;
}

/** Donut colors by segment */
export const DONUT_COLORS: Record<MeCfsDonutSegment, string> = {
  undocumented: 'hsl(var(--muted))',
  none: 'hsl(var(--muted-foreground) / 0.3)',
  mild: '#facc15',
  moderate: '#fb923c',
  severe: '#ef4444',
};

/** German labels by segment */
export const SEGMENT_LABELS: Record<MeCfsDonutSegment, string> = {
  undocumented: 'Keine Dokumentation',
  none: 'keine Belastung',
  mild: 'leicht',
  moderate: 'mittel',
  severe: 'schwer',
};

/** Display order for donut segments (undocumented kept for data model compatibility) */
export const SEGMENT_ORDER: MeCfsDonutSegment[] = ['none', 'mild', 'moderate', 'severe', 'undocumented'];
