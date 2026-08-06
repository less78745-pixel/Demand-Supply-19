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
  // payload.value is expected to be "Cabang - Date"
  const parts = payload.value.split(" - ");
  const cabang = parts[0] || '';
  const date = parts[1] || payload.value;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>{date}</text>
      <text x={0} y={0} dy={30} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11} className="font-semibold">{cabang}</text>
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-white/10 rounded-lg p-3 text-sm shadow-xl">
        <p className="text-slate-400 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.fill }}>
            {p.name}: <span className="font-bold">{Number(p.value).toFixed(2)}%</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function OccupancyChart({ data }: OccupancyChartProps) {
  const chartData = data.slice(0, 50).map((d) => ({
    ...d,
    label: `${d.cabang} - ${d.date}`
  }));

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            tick={<CustomTickOcc />}
            tickLine={false}
            axisLine={false}
            height={50}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '100% Full', fill: '#ef4444', fontSize: 11 }} />
          <ReferenceLine y={80}  stroke="#f59e0b" strokeDasharray="4 2" label={{ value: '80% Warn', fill: '#f59e0b', fontSize: 11 }} />

          <Bar
            dataKey="occupancy_pct"
            name="Occupancy %"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            isAnimationActive={chartData.length <= 25}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

