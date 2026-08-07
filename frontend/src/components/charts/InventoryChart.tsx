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
} from 'recharts';

interface InventoryChartProps {
  data: any[];
}

export function InventoryChart({ data }: InventoryChartProps) {
  const chartData = data.slice(0, 30);

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 40, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis 
            dataKey="category" 
            stroke="#94a3b8" 
            tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }}
            angle={-35} textAnchor="end" height={80}
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            stroke="#94a3b8" 
            tick={{ fill: '#64748b', fontSize: 11 }} 
            tickLine={false} 
            axisLine={false} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            cursor={{ fill: '#f1f5f9', opacity: 0.8 }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          
          <Bar 
            dataKey="volume" 
            name="Sales Volume" 
            fill="hsl(var(--chart-4))" 
            radius={[4, 4, 0, 0]}
            isAnimationActive={chartData.length <= 15}
          />
          <Bar 
            dataKey="on_hand" 
            name="On Hand Inventory" 
            fill="hsl(var(--chart-2))" 
            radius={[4, 4, 0, 0]}
            isAnimationActive={chartData.length <= 15}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
