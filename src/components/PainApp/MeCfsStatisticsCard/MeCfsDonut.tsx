/**
 * SVG Donut chart for ME/CFS severity distribution.
 */
import type { MeCfsSlice } from "./types";

interface MeCfsDonutProps {
  slices: MeCfsSlice[];
  totalDays: number;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const delta = endAngle - startAngle;
  if (delta >= Math.PI * 2 - 0.001) {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const xMid = cx + r * Math.cos(startAngle + Math.PI);
    const yMid = cy + r * Math.sin(startAngle + Math.PI);
    return [
      `M ${cx} ${cy}`, `L ${x1} ${y1}`,
      `A ${r} ${r} 0 0 1 ${xMid} ${yMid}`,
      `A ${r} ${r} 0 0 1 ${x1} ${y1}`, 'Z',
    ].join(' ');
  }
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = delta > Math.PI ? 1 : 0;
  return [`M ${cx} ${cy}`, `L ${x1} ${y1}`, `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, 'Z'].join(' ');
}

export function MeCfsDonut({ slices, totalDays }: MeCfsDonutProps) {
  const activeSlices = slices.filter(s => s.count > 0);
  const size = 120;
  const cx = 60, cy = 60, r = 55;
  let currentAngle = -Math.PI / 2;

  const paths = activeSlices.map(slice => {
    const sweepAngle = (slice.count / totalDays) * Math.PI * 2;
    const d = describeArc(cx, cy, r, currentAngle, currentAngle + sweepAngle);
    currentAngle += sweepAngle;
    return { ...slice, d };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size}>
        {paths.map(p => (
          <path key={p.segment} d={p.d} fill={p.color} />
        ))}
        <circle cx="60" cy="60" r="32" fill="hsl(var(--card))" />
        <text x="60" y="54" textAnchor="middle" className="fill-foreground" fontSize={18} fontWeight="bold">
          {totalDays}
        </text>
        <text x="60" y="68" textAnchor="middle" className="fill-muted-foreground" fontSize={8}>
          dokumentiert
        </text>
      </svg>
    </div>
  );
}
