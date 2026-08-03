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
      <text x={0} y={0} dy={16} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>{date}</text>
      <text x={0} y={0} dy={30} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11} className="font-semibold">{category}</text>
      <text x={0} y={0} dy={44} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>{cabang}</text>
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
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis 
            dataKey="label" 
            stroke="hsl(var(--muted-foreground))" 
            tick={<CustomTick />} 
            tickLine={false} 
            axisLine={false} 
            height={70}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))" 
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
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
            fill="hsl(var(--muted-foreground))" 
            radius={[4, 4, 0, 0]}
            barSize={30}
          />
          <Line 
            type="monotone"
            dataKey="forecast" 
            name={`Forecast (${activeMethod})`} 
            stroke="hsl(var(--primary))" 
            strokeWidth={3}
            dot={{ r: 4, fill: 'hsl(var(--background))', stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
          />
          
          {firstFuture && (
            <ReferenceLine x={firstFuture.label} stroke="#f43f5e" strokeDasharray="3 3" label={{ position: 'top', value: 'Future Forecast', fill: '#f43f5e', fontSize: 12 }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

