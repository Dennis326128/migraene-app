import React, { useMemo } from 'react';
import { PIE_COLORS_CSS, PIE_LABELS } from '@/lib/theme/pieColors';

interface HeadacheDaysPieProps {
  totalDays: number;
  documentedDays?: number;
  painFreeDays: number;
  painDaysNoMedication?: number;
  painDaysWithMedication?: number;
  undocumentedDays?: number;
  painDaysNoTriptan?: number;
  triptanDays?: number;
  showPercent?: boolean;
  compact?: boolean;
  /** Render at larger size for fullscreen views */
  fullscreen?: boolean;
  showBasisToggle?: boolean;
}

interface SliceData {
  key: 'painFree' | 'painNoMedication' | 'withMedication' | 'undocumented';
  value: number;
  color: string;
  label: string;
}

type DayBasis = 'all' | 'documented';
const STORAGE_KEY = 'headache_days_pie_basis';

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  // Full circle special case
  const delta = endAngle - startAngle;
  if (delta >= Math.PI * 2 - 0.001) {
    // Draw two semicircles
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const xMid = cx + r * Math.cos(startAngle + Math.PI);
    const yMid = cy + r * Math.sin(startAngle + Math.PI);
    return [
      `M ${cx} ${cy}`,
      `L ${x1} ${y1}`,
      `A ${r} ${r} 0 0 1 ${xMid} ${yMid}`,
      `A ${r} ${r} 0 0 1 ${x1} ${y1}`,
      'Z',
    ].join(' ');
  }

  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = delta > Math.PI ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${x1} ${y1}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
    'Z',
  ].join(' ');
}

export const HeadacheDaysPie: React.FC<HeadacheDaysPieProps> = ({
  totalDays,
  documentedDays,
  painFreeDays,
  painDaysNoMedication,
  painDaysWithMedication,
  undocumentedDays = 0,
  painDaysNoTriptan,
  triptanDays,
  showPercent = true,
  compact = false,
  fullscreen = false,
  showBasisToggle = true,
}) => {
  const [basis, setBasis] = React.useState<DayBasis>(() => {
    if (typeof window === 'undefined') return 'all';
    return window.localStorage.getItem(STORAGE_KEY) === 'documented' ? 'documented' : 'all';
  });

  const noMedicationDays = painDaysNoMedication ?? painDaysNoTriptan ?? 0;
  const withMedicationDays = painDaysWithMedication ?? triptanDays ?? 0;
  const documentedTotal = documentedDays ?? Math.max(0, totalDays - undocumentedDays);
  const chartTotalDays = basis === 'documented' ? documentedTotal : totalDays;

  const handleBasisChange = (nextBasis: DayBasis) => {
    setBasis(nextBasis);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, nextBasis);
  };

  const slices = useMemo<SliceData[]>(() => {
    const all: SliceData[] = [
      { key: 'painFree', value: painFreeDays, color: PIE_COLORS_CSS.painFree, label: PIE_LABELS.painFree },
      { key: 'painNoMedication', value: noMedicationDays, color: PIE_COLORS_CSS.painNoMedication, label: PIE_LABELS.painNoMedication },
      { key: 'withMedication', value: withMedicationDays, color: PIE_COLORS_CSS.withMedication, label: PIE_LABELS.withMedication },
    ];
    if (basis === 'all') {
      all.push({ key: 'undocumented', value: undocumentedDays, color: PIE_COLORS_CSS.undocumented, label: PIE_LABELS.undocumented });
    }
    return all;
  }, [basis, painFreeDays, noMedicationDays, withMedicationDays, undocumentedDays]);

  const activeSlices = useMemo(() => slices.filter(s => s.value > 0), [slices]);

  const paths = useMemo(() => {
    if (chartTotalDays === 0) return [];
    const cx = 60, cy = 60, r = 55;
    let currentAngle = -Math.PI / 2; // Start at top
    
    return activeSlices.map(slice => {
      const sweepAngle = (slice.value / chartTotalDays) * Math.PI * 2;
      const d = describeArc(cx, cy, r, currentAngle, currentAngle + sweepAngle);
      currentAngle += sweepAngle;
      return { ...slice, d };
    });
  }, [activeSlices, chartTotalDays]);

  const size = fullscreen ? 220 : compact ? 100 : 120;
  const fontSize = fullscreen ? 'text-base' : compact ? 'text-xs' : 'text-sm';
  const swatchSize = fullscreen ? 14 : compact ? 10 : 12;
  const centerFontSize = fullscreen ? 20 : 18;
  const centerSubFontSize = fullscreen ? 11 : 10;
  const pct = (v: number) => chartTotalDays > 0 ? Math.round((v / chartTotalDays) * 1000) / 10 : 0;

  return (
    <div className="w-full space-y-3">
      {showBasisToggle && !compact && (
        <div className="flex flex-col xs:flex-row xs:items-center gap-2 text-xs">
          <span className="text-muted-foreground whitespace-nowrap">Tage berücksichtigen</span>
          <div className="inline-flex w-full xs:w-auto rounded-full bg-secondary p-1 border border-border overflow-hidden">
            {([
              ['all', 'Alle'],
              ['documented', 'Nur dokumentierte'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleBasisChange(value)}
                className={`flex-1 xs:flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${basis === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`flex ${fullscreen ? 'flex-col sm:flex-row items-center gap-8' : compact ? 'flex-row items-center gap-3' : 'flex-col sm:flex-row items-center sm:items-center gap-4'}`}>
      {/* SVG Pie Chart */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size}>
          {chartTotalDays === 0 ? (
            <circle cx="60" cy="60" r="55" fill="hsl(var(--muted))" />
          ) : (
            paths.map(p => (
              <path key={p.key} d={p.d} fill={p.color} />
            ))
          )}
          {/* White center circle for donut effect */}
          <circle cx="60" cy="60" r="32" fill="hsl(var(--card))" />
          {/* Center text */}
          <text x="60" y={fullscreen ? 55 : 56} textAnchor="middle" className="fill-foreground" fontSize={centerFontSize} fontWeight="bold">
            {chartTotalDays}
          </text>
          <text x="60" y={fullscreen ? 73 : 72} textAnchor="middle" className="fill-muted-foreground" fontSize={centerSubFontSize}>
            Tage
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className={`flex flex-col gap-1.5 ${fontSize}`}>
        {slices.map(slice => {
          const isZero = slice.value === 0;
          return (
            <div
              key={slice.key}
              className={`flex items-center gap-2 ${isZero ? 'opacity-40' : ''}`}
            >
              <span
                className="inline-block shrink-0 rounded-sm"
                style={{
                  width: swatchSize,
                  height: swatchSize,
                  backgroundColor: slice.color,
                }}
              />
              <span className="text-foreground">{slice.label}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">
                {slice.value}
                {showPercent && chartTotalDays > 0 && (
                  <span className="ml-1">({pct(slice.value)}%)</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
};

export default HeadacheDaysPie;
