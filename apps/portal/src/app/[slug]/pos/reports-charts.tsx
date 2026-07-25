'use client';

import { useMemo } from 'react';

// ─── Donut / Ring Chart ───
export function DonutChart({
  data, total, centerText, centerSub, currencySymbol, size = 120,
}: {
  data: { label: string; value: number; color: string }[];
  total: number; centerText?: string; centerSub?: string; currencySymbol?: string; size?: number;
}) {
  const cx = size / 2, cy = size / 2, r = size * 0.4, sw = size * 0.15;
  const circumference = 2 * Math.PI * r;
  const slices = useMemo(() => {
    let off = 0;
    return data.filter(d => d.value > 0).map(d => {
      const pct = total > 0 ? d.value / total : 0;
      const seg = { ...d, dash: pct * circumference, offset: off, pct };
      off += pct * circumference;
      return seg;
    });
  }, [data, total, circumference]);

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[160px] mx-auto">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-400" fontSize={size * 0.09}>0</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-gray-400" fontSize={size * 0.06}>No data</text>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[160px] mx-auto">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
      {slices.map((s, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${Math.max(s.dash, 0.5)} ${circumference}`}
          strokeDashoffset={-s.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="transition-all duration-300"
        />
      ))}
      <text x={cx} y={cy - (centerSub ? 4 : 0)} textAnchor="middle" fontSize={size * 0.11} fontWeight="bold" fill="#374151">
        {centerText ?? (currencySymbol ? `${currencySymbol}${total.toFixed(0)}` : String(total))}
      </text>
      {centerSub && <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size * 0.065} fill="#9ca3af">{centerSub}</text>}
    </svg>
  );
}

// ─── Bar Chart ───
export function BarChart({
  data, maxValue, format, height = 200, barColor = '#3b82f6',
}: {
  data: { label: string; value: number }[];
  maxValue?: number; format?: (n: number) => string; height?: number; barColor?: string;
}) {
  const mx = maxValue ?? Math.max(...data.map(d => d.value), 1);
  return (
    <div className="relative" style={{ height }}>
      <div className="absolute inset-0 flex items-end gap-1">
        {data.map((d, i) => {
          const pct = (d.value / mx) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center min-w-0 h-full justify-end">
              <div
                className="w-full rounded-t transition-all duration-300 hover:opacity-80"
                style={{ height: `${Math.max(pct, 1)}%`, backgroundColor: barColor, opacity: 0.6 + (pct / 100) * 0.4 }}
                title={format ? format(d.value) : String(d.value)}
              />
              <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Line / Area Chart ───
export function LineChart({
  data, aspectRatio = 3, color = '#3b82f6', format, showDots = true,
}: {
  data: { label: string; value: number }[];
  aspectRatio?: number; color?: string; format?: (n: number) => string; showDots?: boolean;
}) {
  if (data.length === 0) return <div className="text-center text-gray-400 text-sm py-12">No data</div>;

  const width = 600, height = Math.round(width / aspectRatio);
  const mx = Math.max(...data.map(d => d.value), 1);
  const pad = { t: 20, r: 16, b: 24, l: 52 };
  const chartW = width - pad.l - pad.r;
  const chartH = height - pad.t - pad.b;
  const stepX = chartW / Math.max(data.length - 1, 1);
  const yScale = (v: number) => pad.t + chartH - (v / mx) * chartH;

  const points = data.map((d, i) => `${pad.l + i * stepX},${yScale(d.value)}`);
  const areaPoints = `${pad.l},${pad.t + chartH} ${points.join(' ')} ${pad.l + (data.length - 1) * stepX},${pad.t + chartH}`;

  const yTicks = [0, Math.round(mx / 2), mx];
  const xTicks = data.length > 10
    ? data.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1)
    : data;

  return (
    <div style={{ aspectRatio: `${width}/${height}` }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} y1={yScale(v)} x2={width - pad.r} y2={yScale(v)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={pad.l - 6} y={yScale(v) + 3} textAnchor="end" fontSize="10" fill="#9ca3af">
              {format ? format(v) : String(v)}
            </text>
          </g>
        ))}
        <polygon points={areaPoints} fill={color} fillOpacity="0.1" />
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {showDots && data.map((d, i) => (
          <circle key={i} cx={pad.l + i * stepX} cy={yScale(d.value)} r="3" fill={color} stroke="white" strokeWidth="2">
            <title>{d.label}: {format ? format(d.value) : String(d.value)}</title>
          </circle>
        ))}
        {xTicks.map((d, i) => {
          const idx = data.indexOf(d);
          const x = pad.l + idx * stepX;
          return (
            <text key={i} x={x} y={height - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{d.label}</text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Heatmap ───
export function Heatmap({
  data, rows, cols, getColor, getValue, cellSize = 36,
}: {
  data: { row: string; col: string; value: number }[];
  rows: string[]; cols: string[];
  getColor: (v: number, max: number) => string;
  getValue?: (v: number) => string;
  cellSize?: number;
}) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const colW = cellSize, rowH = cellSize;
  const labelW = 80, labelH = 16;
  const w = labelW + cols.length * colW;
  const h = labelH + rows.length * rowH;

  const lookup = new Map(data.map(d => [`${d.row}|${d.col}`, d.value]));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto max-w-full" style={{ maxWidth: w }}>
      {/* Column headers */}
      {cols.map((c, i) => (
        <text key={`ch-${i}`} x={labelW + i * colW + colW / 2} y={labelH - 4} textAnchor="middle" fontSize="9" fill="#6b7280">{c}</text>
      ))}
      {/* Row labels + cells */}
      {rows.map((r, ri) => (
        <g key={`r-${ri}`}>
          <text x={labelW - 4} y={labelH + ri * rowH + rowH / 2 + 3} textAnchor="end" fontSize="9" fill="#6b7280">{r}</text>
          {cols.map((c, ci) => {
            const v = lookup.get(`${r}|${c}`) || 0;
            return (
              <g key={`c-${ci}`}>
                <rect x={labelW + ci * colW} y={labelH + ri * rowH} width={colW - 1} height={rowH - 1} rx="2" fill={getColor(v, maxVal)} />
                <title>{r} {c}: {getValue ? getValue(v) : String(v)}</title>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
