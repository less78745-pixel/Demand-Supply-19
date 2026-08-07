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
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#64748b" fontSize={11}>{date}</text>
      <text x={0} y={0} dy={30} textAnchor="middle" fill="#475569" fontSize={11} className="font-semibold">{cabang}</text>
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm shadow-xl">
        <p className="text-slate-300 mb-1 font-semibold">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.fill || '#60a5fa' }}>
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
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            tick={<CustomTickOcc />}
            tickLine={false}
            axisLine={false}
            height={60}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9', opacity: 0.8 }} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '100% Full', fill: '#ef4444', fontSize: 11 }} />
          <ReferenceLine y={80}  stroke="#f59e0b" strokeDasharray="4 2" label={{ value: '80% Warn', fill: '#f59e0b', fontSize: 11 }} />

          <Bar
            dataKey="occupancy_pct"
            name="Occupancy %"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
            isAnimationActive={chartData.length <= 25}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

