/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface ForecastChartProps {
  data: any[];
  activeMethod: string;
}

// Above this many raw rows for a single Cabang x Kategori series, fall back
// to aggregation too - guards against pathologically long single-series
// history, though in practice the per-group cap below is what usually kicks in.
const RAW_POINT_LIMIT = 2000;

const CustomTick = (props: any) => {
  const { x, y, payload } = props;
  // payload.value is "Cabang - Category - Date" for a single-series view,
  // or just "Date" once aggregated across multiple Cabang x Kategori groups.
  const parts = payload.value.split(" - ");
  const [cabang, category, date] = parts.length >= 3
    ? parts
    : [null, null, parts[0]];

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#475569" fontSize={11}>{date}</text>
      {category && <text x={0} y={0} dy={30} textAnchor="middle" fill="#475569" fontSize={11} className="font-semibold">{category}</text>}
      {cabang && <text x={0} y={0} dy={44} textAnchor="middle" fill="#475569" fontSize={11}>{cabang}</text>}
    </g>
  );
};

export function ForecastChart({ data, activeMethod }: ForecastChartProps) {
  const { chartData, isAggregated, groupCount } = useMemo(() => {
    const groupKeys = new Set(data.map((d) => `${d.cabang}|||${d.category}`));
    const groupCount = groupKeys.size;

    // A raw per-row chart only makes sense for a single Cabang x Kategori
    // series - stitching multiple groups' points onto one line/bar axis is
    // both meaningless (unrelated series concatenated into one zigzag) and,
    // for large uploads, catastrophic for Recharts (tens of thousands of SVG
    // nodes freeze the tab). Aggregate to one point per date whenever more
    // than one group is in view instead of plotting every raw row.
    if (groupCount <= 1 && data.length <= RAW_POINT_LIMIT) {
      return {
        groupCount,
        isAggregated: false,
        chartData: data.map((d) => ({
          label: `${d.cabang} - ${d.category} - ${d.date}`,
          date: d.date,
          actual: d.actual,
          forecast: d.forecasts?.[activeMethod] ?? null,
          is_future: d.is_future,
        })),
      };
    }

    const byDate = new Map<string, { date: string; actual: number | null; forecast: number | null; is_future: boolean }>();
    data.forEach((d) => {
      const entry = byDate.get(d.date) || { date: d.date, actual: null, forecast: null, is_future: !!d.is_future };
      if (d.actual !== null && d.actual !== undefined) {
        entry.actual = (entry.actual || 0) + Number(d.actual);
      }
      const f = d.forecasts?.[activeMethod];
      if (f !== null && f !== undefined) {
        entry.forecast = (entry.forecast || 0) + Number(f);
      }
      byDate.set(d.date, entry);
    });

    const chartData = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ label: e.date, date: e.date, actual: e.actual, forecast: e.forecast, is_future: e.is_future }));

    return { groupCount, isAggregated: true, chartData };
  }, [data, activeMethod]);

  // Find the first future date to draw a vertical reference line
  const firstFuture = chartData.find(d => d.is_future);

  return (
    <div className="w-full h-[400px]">
      {isAggregated && (
        <p className="text-xs text-muted-foreground mb-2">
          Menampilkan total agregat dari {groupCount} kombinasi Cabang × Kategori per periode. Pilih satu Cabang dan satu Kategori spesifik pada filter di atas untuk melihat rincian per baris.
        </p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#475569"
            tick={<CustomTick />}
            tickLine={false}
            axisLine={false}
            height={70}
          />
          <YAxis
            stroke="#475569"
            tick={{ fill: '#475569', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            formatter={(value: any, name: any) => [!isNaN(Number(value)) ? Number(value).toFixed(2) : value || '—', name]}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />

          <Bar
            dataKey="actual"
            name="Actual Sales"
            fill="hsl(var(--chart-3))"
            radius={[4, 4, 0, 0]}
            barSize={30}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name={`Forecast (${activeMethod})`}
            stroke="hsl(var(--chart-1))"
            strokeWidth={3}
            dot={{ r: 4, fill: 'hsl(var(--background))', stroke: 'hsl(var(--chart-1))', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'hsl(var(--chart-1))' }}
          />

          {firstFuture && (
            <ReferenceLine x={firstFuture.label} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: 'Future Forecast', fill: '#f43f5e', fontSize: 12 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
