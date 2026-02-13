import React, { useMemo } from 'react';
import { PIE_COLORS_CSS, PIE_LABELS } from '@/lib/theme/pieColors';

interface HeadacheDaysPieProps {
  totalDays: number;
  painFreeDays: number;
  painDaysNoTriptan: number;
  triptanDays: number;
  showPercent?: boolean;
  compact?: boolean;
}

interface SliceData {
  key: 'painFree' | 'painNoTriptan' | 'triptan';
  value: number;
  color: string;
  label: string;
}

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
  painFreeDays,
  painDaysNoTriptan,
  triptanDays,
  showPercent = true,
  compact = false,
}) => {
  const slices = useMemo<SliceData[]>(() => {
    const all: SliceData[] = [
      { key: 'painFree', value: painFreeDays, color: PIE_COLORS_CSS.painFree, label: PIE_LABELS.painFree },
      { key: 'painNoTriptan', value: painDaysNoTriptan, color: PIE_COLORS_CSS.painNoTriptan, label: PIE_LABELS.painNoTriptan },
      { key: 'triptan', value: triptanDays, color: PIE_COLORS_CSS.triptan, label: PIE_LABELS.triptan },
    ];
    return all;
  }, [painFreeDays, painDaysNoTriptan, triptanDays]);

  const activeSlices = useMemo(() => slices.filter(s => s.value > 0), [slices]);

  const paths = useMemo(() => {
    if (totalDays === 0) return [];
    const cx = 60, cy = 60, r = 55;
    let currentAngle = -Math.PI / 2; // Start at top
    
    return activeSlices.map(slice => {
      const sweepAngle = (slice.value / totalDays) * Math.PI * 2;
      const d = describeArc(cx, cy, r, currentAngle, currentAngle + sweepAngle);
      currentAngle += sweepAngle;
      return { ...slice, d };
    });
  }, [activeSlices, totalDays]);

  const size = compact ? 100 : 120;
  const pct = (v: number) => totalDays > 0 ? Math.round((v / totalDays) * 1000) / 10 : 0;

  return (
    <div className={`flex ${compact ? 'flex-row items-center gap-3' : 'flex-col sm:flex-row items-center sm:items-center gap-4'}`}>
      {/* SVG Pie Chart */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size}>
          {totalDays === 0 ? (
            <circle cx="60" cy="60" r="55" fill="hsl(var(--muted))" />
          ) : (
            paths.map(p => (
              <path key={p.key} d={p.d} fill={p.color} />
            ))
          )}
          {/* White center circle for donut effect */}
          <circle cx="60" cy="60" r="32" fill="hsl(var(--card))" />
          {/* Center text */}
          <text x="60" y="56" textAnchor="middle" className="fill-foreground" fontSize="18" fontWeight="bold">
            {totalDays}
          </text>
          <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize="10">
            Tage
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className={`flex flex-col gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
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
                  width: compact ? 10 : 12,
                  height: compact ? 10 : 12,
                  backgroundColor: slice.color,
                }}
              />
              <span className="text-foreground">{slice.label}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">
                {slice.value}
                {showPercent && totalDays > 0 && (
                  <span className="ml-1">({pct(slice.value)}%)</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HeadacheDaysPie;
