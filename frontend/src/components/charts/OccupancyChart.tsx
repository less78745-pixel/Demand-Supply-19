/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface OccupancyChartProps {
  data: any[];
}

const CustomTickOcc = (props: any) => {
  const { x, y, payload } = props;
  // payload.value is "Cabang - Date" in per-period mode, or just "Cabang" in
  // aggregated mode (dataset besar -> satu bar per cabang, tanpa dimensi tanggal).
  const parts = payload.value.split(" - ");
  const cabang = parts[0] || '';
  const date = parts.length > 1 ? parts[1] : null;
  const label = date ? `${cabang} - ${date}` : cabang;

  // Label diputar -35deg (bukan dua baris terpisah horizontal) supaya tidak
  // saling bertabrakan saat banyak bar berdempetan pada dataset besar.
  return (
    <g transform={`translate(${x},${y}) rotate(-35)`}>
      <text x={0} y={0} dy={12} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={11} className="font-semibold">
        {label}
      </text>
    </g>
  );
};

interface GrupBreakdown { nama: string; qty: number; }

// Deliverable: sort desc + slice top 3 -- dilakukan di sini (bukan backend)
// supaya backend bebas kirim SEMUA grup tanpa peduli "top berapa" yang mau
// ditampilkan; ubah tooltip ke top-5 pun tidak perlu ubah backend.
function getTop3Grup(grup: GrupBreakdown[] = []): GrupBreakdown[] {
  return [...grup].sort((a, b) => b.qty - a.qty).slice(0, 3);
}

const fmtContainer = (n: number) => Math.round(n).toLocaleString('id-ID');

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload; // full daily_data row (termasuk `breakdown`)
  const b = row.breakdown || {};
  const top3 = getTop3Grup(b.grup);

  return (
    <div className="bg-popover border border-border rounded-lg p-3 text-sm shadow-xl min-w-[240px]">
      <p className="text-popover-foreground mb-2 font-semibold">{label}</p>

      <p style={{ color: 'hsl(var(--chart-1))' }}>
        Occupancy: <span className="font-bold">{Number(row.occupancy_pct).toFixed(2)}%</span>
      </p>
      <p className="text-muted-foreground">
        Stock Awal: <span className="font-bold text-popover-foreground">{fmtContainer(b.stock_awal || 0)} Container</span>
      </p>
      <p className="text-muted-foreground">
        Vessel (Inbound/Transit): <span className="font-bold text-popover-foreground">{fmtContainer(b.vessel_in || 0)} Container</span>
      </p>

      <div className="mt-2 pt-2 border-t border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Breakdown (3 Terbesar):</p>
        {top3.length === 0 && <p className="text-xs italic text-muted-foreground">Tidak ada data grup</p>}
        {top3.map((g) => (
          <p key={g.nama} className="text-xs pl-2 text-muted-foreground">
            {g.nama} : <span className="font-bold text-popover-foreground">{fmtContainer(g.qty)} Container</span>
          </p>
        ))}
      </div>

      <div className="mt-2 pt-2 border-t border-border">
        <p className="text-muted-foreground">TO: <span className="font-bold text-popover-foreground">{fmtContainer(b.to || 0)} Container</span></p>
        <p className="text-muted-foreground">Target Penjualan: <span className="font-bold text-popover-foreground">{fmtContainer(b.target_penjualan || 0)} Container</span></p>
      </div>
    </div>
  );
};

// Lebar per-bar (px) supaya label "Cabang - Tanggal" tidak saling tumpuk saat
// dataset besar -- chart di-scroll horizontal alih-alih dipadatkan/dipotong,
// jadi SEMUA baris tetap tampil apa adanya, tanpa agregasi atau slice.
const BAR_WIDTH_PX = 34;
const MIN_CHART_WIDTH_PX = 600;

export function OccupancyChart({ data }: OccupancyChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: `${d.cabang} - ${d.date}`,
  }));

  const chartWidth = Math.max(MIN_CHART_WIDTH_PX, chartData.length * BAR_WIDTH_PX);

  return (
    <div className="w-full h-[440px] overflow-x-auto">
      <div style={{ width: chartWidth, height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 70 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              tick={<CustomTickOcc />}
              tickLine={false}
              axisLine={false}
              height={90}
              interval={0}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              unit="%"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.6 }} />
            <Legend
              verticalAlign="bottom"
              align="center"
              layout="horizontal"
              wrapperStyle={{ paddingTop: '16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', rowGap: '4px' }}
            />
            <ReferenceLine y={100} stroke="hsl(var(--destructive))" strokeDasharray="4 2" label={{ value: '100% Full', position: 'insideTopLeft', fill: 'hsl(var(--destructive))', fontSize: 11 }} />
            <ReferenceLine y={80}  stroke="hsl(var(--chart-4))" strokeDasharray="4 2" label={{ value: '80% Warn', position: 'insideBottomLeft', fill: 'hsl(var(--chart-4))', fontSize: 11 }} />

            <Bar
              dataKey="occupancy_pct"
              name="Occupancy %"
              fill="hsl(var(--chart-1))"
              radius={[4, 4, 0, 0]}
              isAnimationActive={chartData.length <= 60}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

