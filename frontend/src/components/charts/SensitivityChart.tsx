/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

interface SensitivityItem {
  factor: string;
  variation: string;
  total_cost: number;
  category: string;
}

interface SensitivityChartProps {
  data: SensitivityItem[];
  title?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Man: '#3b82f6',
  Machine: '#22c55e',
  Method: '#f59e0b',
  Material: '#8b5cf6',
  Environment: '#ef4444',
};

export function SensitivityChart({ data, title }: SensitivityChartProps) {
  // Group by factor
  const factors = Array.from(new Set(data.map(d => d.factor)));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    return (
      <div className="glass-card rounded-lg px-3 py-2 text-xs shadow-lg border border-border">
        <p className="font-bold text-foreground">{item.factor}</p>
        <p className="text-muted-foreground">Variasi: {item.variation}</p>
        <p className="font-semibold text-primary">Cost: Rp {item.total_cost?.toLocaleString()}</p>
        <p className="text-muted-foreground">Kategori: {item.category}</p>
      </div>
    );
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        {title || 'Analisis Sensitivitas 4M1E'}
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {factors.map(factor => {
          const factorData = data.filter(d => d.factor === factor);
          const category = factorData[0]?.category || 'Other';
          const color = CATEGORY_COLORS[category] || '#6b7280';

          return (
            <div key={factor} className="bg-card/30 rounded-lg p-4 border border-border/50">
              <h5 className="text-xs font-semibold mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                {factor}
              </h5>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={factorData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="variation" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total_cost" radius={[4, 4, 0, 0]}>
                    {factorData.map((_, index) => (
                      <Cell
                        key={index}
                        fill={color}
                        fillOpacity={0.6 + (index / factorData.length) * 0.4}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>

      {/* 4M1E Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <span key={cat} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            {cat}
          </span>
        ))}
      </div>
    </div>
  );
}
