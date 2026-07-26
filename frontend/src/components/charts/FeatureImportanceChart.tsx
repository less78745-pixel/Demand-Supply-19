"use client";

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface FeatureImportanceChartProps {
  data: any[];
}

export function FeatureImportanceChart({ data }: FeatureImportanceChartProps) {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
          <XAxis 
            type="number" 
            stroke="#64748b" 
            tick={{ fill: '#94a3b8', fontSize: 12 }} 
            tickLine={false} 
            axisLine={false} 
            tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
          />
          <YAxis 
            type="category" 
            dataKey="feature" 
            stroke="#64748b" 
            tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 500 }} 
            tickLine={false} 
            axisLine={false} 
          />
          <Tooltip 
            cursor={{ fill: '#1e293b', opacity: 0.4 }}
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
            formatter={(value: any) => [`${(Number(value) * 100).toFixed(1)}%`, 'Importance']}
          />
          
          <Bar dataKey="importance" radius={[0, 4, 4, 0]} barSize={24}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={index === 0 ? '#00f0ff' : '#0284c7'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
