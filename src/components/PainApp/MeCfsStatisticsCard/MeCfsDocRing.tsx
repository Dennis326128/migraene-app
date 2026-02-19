/**
 * Small documentation ring showing documented vs not-documented days.
 * Neutral, non-judgmental, transparency-focused.
 */

interface MeCfsDocRingProps {
  documentedDays: number;
  calendarDays: number;
}

export function MeCfsDocRing({ documentedDays, calendarDays }: MeCfsDocRingProps) {
  const undocumented = calendarDays - documentedDays;

  // Don't show if fully documented
  if (undocumented <= 0) return null;

  const docPct = calendarDays > 0 ? Math.round((documentedDays / calendarDays) * 100) : 0;
  const size = 56;
  const cx = 28, cy = 28, r = 24;

  const docAngle = (documentedDays / calendarDays) * Math.PI * 2;
  const startAngle = -Math.PI / 2;

  // Documented arc
  const docEnd = startAngle + docAngle;
  const docPath = describeArc(cx, cy, r, startAngle, docEnd, documentedDays === calendarDays);

  // Undocumented arc
  const undocPath = describeArc(cx, cy, r, docEnd, startAngle + Math.PI * 2, undocumented === calendarDays);

  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 56 56" width={size} height={size}>
          {documentedDays > 0 && (
            <path d={docPath} fill="hsl(var(--primary) / 0.5)" />
          )}
          {undocumented > 0 && (
            <path d={undocPath} fill="hsl(var(--muted))" />
          )}
          <circle cx={cx} cy={cy} r="14" fill="hsl(var(--card))" />
          <text x={cx} y={cy + 3} textAnchor="middle" className="fill-muted-foreground" fontSize={9} fontWeight="600">
            {docPct}%
          </text>
        </svg>
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: 'hsl(var(--primary) / 0.5)' }} />
          <span>Dokumentiert: {documentedDays}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: 'hsl(var(--muted))' }} />
          <span>Nicht dokumentiert: {undocumented}</span>
        </div>
      </div>
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, isFullCircle: boolean): string {
  if (isFullCircle) {
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
  const delta = endAngle - startAngle;
  const largeArc = delta > Math.PI ? 1 : 0;
  return [`M ${cx} ${cy}`, `L ${x1} ${y1}`, `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, 'Z'].join(' ');
}
