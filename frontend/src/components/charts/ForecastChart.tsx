/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React from 'react';
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

const CustomTick = (props: any) => {
  const { x, y, payload } = props;
  // payload.value is expected to be "Cabang - Category - Date"
  const parts = payload.value.split(" - ");
  const cabang = parts[0] || '';
  const category = parts[1] || '';
  const date = parts[2] || payload.value;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#94a3b8" fontSize={11}>{date}</text>
      <text x={0} y={0} dy={30} textAnchor="middle" fill="#94a3b8" fontSize={11} className="font-semibold">{category}</text>
      <text x={0} y={0} dy={44} textAnchor="middle" fill="#94a3b8" fontSize={11}>{cabang}</text>
    </g>
  );
};

export function ForecastChart({ data, activeMethod }: ForecastChartProps) {
  const chartData = data.map((d) => ({
    label: `${d.cabang} - ${d.category} - ${d.date}`,
    date: d.date,
    actual: d.actual,
    forecast: d.forecasts?.[activeMethod] || null,
    is_future: d.is_future
  }));

  // Find the first future date to draw a vertical reference line
  const firstFuture = chartData.find(d => d.is_future);

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="label" 
            stroke="#64748b" 
            tick={<CustomTick />} 
            tickLine={false} 
            axisLine={false} 
            height={70}
          />
          <YAxis 
            stroke="#64748b" 
            tick={{ fill: '#94a3b8', fontSize: 12 }} 
            tickLine={false} 
            axisLine={false} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
            cursor={{ fill: '#1e293b', opacity: 0.4 }}
            formatter={(value: any, name: any) => [value?.toFixed(2) || value, name]}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          
          <Bar 
            dataKey="actual" 
            name="Actual Sales" 
            fill="#cbd5e1" 
            radius={[4, 4, 0, 0]}
            barSize={30}
          />
          <Line 
            type="monotone"
            dataKey="forecast" 
            name={`Forecast (${activeMethod})`} 
            stroke="#00f0ff" 
            strokeWidth={3}
            dot={{ r: 4, fill: '#0f172a', stroke: '#00f0ff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: '#00f0ff' }}
          />
          
          {firstFuture && (
            <ReferenceLine x={firstFuture.label} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: 'Future Forecast', fill: '#f43f5e', fontSize: 12 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

