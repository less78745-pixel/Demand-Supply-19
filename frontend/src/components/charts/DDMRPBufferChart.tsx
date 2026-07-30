/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

interface BufferZone {
  red_zone: number;
  yellow_zone: number;
  green_zone: number;
  top_of_red: number;
  top_of_yellow: number;
  top_of_green: number;
}

interface DDMRPBufferChartProps {
  bufferZones: BufferZone;
  netFlowPosition: number;
  label?: string;
}

export function DDMRPBufferChart({ bufferZones, netFlowPosition, label }: DDMRPBufferChartProps) {
  const data = [
    {
      name: label || 'Buffer',
      red: bufferZones.red_zone,
      yellow: bufferZones.yellow_zone,
      green: bufferZones.green_zone,
    },
  ];

  // Determine NFP zone color
  let nfpColor = '#22c55e'; // green
  let nfpZone = 'Green';
  if (netFlowPosition < bufferZones.top_of_red) {
    nfpColor = '#ef4444';
    nfpZone = 'RED — URGENT';
  } else if (netFlowPosition < bufferZones.top_of_yellow) {
    nfpColor = '#f59e0b';
    nfpZone = 'Yellow — Order';
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="glass-card rounded-lg px-4 py-3 text-sm shadow-lg border border-border">
        <p className="font-bold text-foreground mb-2">Buffer Zones</p>
        <div className="space-y-1.5">
          <div className="flex justify-between gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ef4444' }} />
              Red Zone
            </span>
            <span className="font-mono font-semibold">{bufferZones.red_zone.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f59e0b' }} />
              Yellow Zone
            </span>
            <span className="font-mono font-semibold">{bufferZones.yellow_zone.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#22c55e' }} />
              Green Zone
            </span>
            <span className="font-mono font-semibold">{bufferZones.green_zone.toLocaleString()}</span>
          </div>
          <hr className="border-border my-1" />
          <div className="flex justify-between gap-6">
            <span className="font-semibold">TOG (Top of Green)</span>
            <span className="font-mono font-bold">{bufferZones.top_of_green.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="font-semibold" style={{ color: nfpColor }}>NFP</span>
            <span className="font-mono font-bold" style={{ color: nfpColor }}>{netFlowPosition.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Buffer Zone Visualization</h4>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card/50">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: nfpColor }} />
          <span className="text-xs font-semibold" style={{ color: nfpColor }}>NFP: {netFlowPosition.toLocaleString()} ({nfpZone})</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={80} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="red" stackId="buffer" fill="#ef4444" name="Red Zone" radius={[0, 0, 0, 0]} />
          <Bar dataKey="yellow" stackId="buffer" fill="#f59e0b" name="Yellow Zone" />
          <Bar dataKey="green" stackId="buffer" fill="#22c55e" name="Green Zone" radius={[0, 4, 4, 0]} />
          <ReferenceLine
            x={netFlowPosition}
            stroke={nfpColor}
            strokeWidth={3}
            strokeDasharray="8 4"
            label={{
              value: `NFP: ${netFlowPosition.toLocaleString()}`,
              position: 'top',
              fill: nfpColor,
              fontSize: 12,
              fontWeight: 700,
            }}
          />
          <ReferenceLine
            x={bufferZones.top_of_yellow}
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <ReferenceLine
            x={bufferZones.top_of_red}
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Zone thresholds legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
        <span>TOR: <strong className="text-destructive">{bufferZones.top_of_red.toLocaleString()}</strong></span>
        <span>TOY: <strong className="text-amber-500">{bufferZones.top_of_yellow.toLocaleString()}</strong></span>
        <span>TOG: <strong className="text-emerald-500">{bufferZones.top_of_green.toLocaleString()}</strong></span>
      </div>
    </div>
  );
}
