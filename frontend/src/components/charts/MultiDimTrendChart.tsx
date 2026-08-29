"use client";

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { formatNumberCompact } from '@/lib/utils';
import { sortBulans } from '@/lib/csvParser';

const formatNum = (val: number) => val.toLocaleString('id-ID');

export type TrendMetric = 'Value' | 'CBM' | 'Qty';

export interface MultiDimTrendSeries {
  dataKey: string;
  stackId: string;
  group: string;
  status: string;
  color: string;
  opacity: number;
  /** Set for "Slow Moving"/"Dead Moving" stacks — Bar fill uses this hatch pattern id instead of a flat color. */
  patternId?: 'hatch-dead' | 'hatch-slow';
}

const RISK_COLORS: Record<'dead' | 'slow', string> = { dead: '#dc2626', slow: '#f59e0b' };

/** Slow/Dead Moving stacks get a distinct hatch texture regardless of which group/cluster they're nested under, so "at risk" volume stands out at a glance anywhere in the chart. */
function getRiskKind(status: string): 'dead' | 'slow' | null {
  const s = status.toLowerCase();
  if (s.includes('dead')) return 'dead';
  if (s.includes('slow')) return 'slow';
  return null;
}

export interface MultiDimTrendResult {
  data: Record<string, any>[];
  series: MultiDimTrendSeries[];
  targetGroups: string[];
  uniqueStatuses: string[];
  GROUP_COLORS: string[];
  OPACITIES: number[];
}

const GROUP_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const OPACITIES = [1, 0.75, 0.5, 0.25, 0.1];

/**
 * Aggregates rows into a stacked-bar shape along `xAxisField` (default
 * 'BULAN'), clustered by `groupingField` (e.g. Category, Branch Name, Status
 * Product, Grup, or BULAN itself when the X-axis is something else, like
 * Grup) and stacked by a secondary dimension. Shared by every "Analisa Trend
 * Multidimensi"-style chart on the SKU Velocity page so each dimension gets
 * identical top-5/stacking/coloring rules.
 */
export function buildMultiDimTrendData(
  filteredInput: Record<string, any>[],
  groupingField: string,
  metric: TrendMetric,
  allXValues: string[],
  limitTop5: boolean,
  xAxisField: string = 'BULAN'
): MultiDimTrendResult {
  let filtered = filteredInput;

  const overallGroupMap: Record<string, number> = {};
  filtered.forEach(r => {
    const key = r[groupingField] || 'Unknown';
    overallGroupMap[key] = (overallGroupMap[key] || 0) + (r['Value'] || 0);
  });

  // A BULAN cluster/legend must stay chronological, not sorted by value size.
  let targetGroups = groupingField === 'BULAN'
    ? sortBulans(Object.keys(overallGroupMap))
    : Object.keys(overallGroupMap).sort((a, b) => overallGroupMap[b] - overallGroupMap[a]);
  if (limitTop5) {
    targetGroups = targetGroups.slice(0, 5);
  }

  filtered = filtered.filter(r => targetGroups.includes(r[groupingField] || 'Unknown'));

  let stackGrouping = 'Status Product';
  if (groupingField === 'Status Product') {
    stackGrouping = 'Category';
  }

  let targetStacks: string[] = [];
  if (stackGrouping === 'Status Product') {
    targetStacks = Array.from(new Set(filtered.map(d => d['Status Product'] || 'Unknown'))).sort();
  } else {
    const stackMap: Record<string, number> = {};
    filtered.forEach(r => {
      const key = r[stackGrouping] || 'Unknown';
      stackMap[key] = (stackMap[key] || 0) + (r['Value'] || 0);
    });
    targetStacks = Object.keys(stackMap).sort((a, b) => stackMap[b] - stackMap[a]).slice(0, 5);
  }

  if (stackGrouping === 'Category') {
    filtered = filtered.filter(r => targetStacks.includes(r[stackGrouping] || 'Unknown'));
  }

  const xMap: Record<string, any> = {};
  filtered.forEach(r => {
    const xKey = r[xAxisField] || 'Unknown';
    const groupKey = r[groupingField] || 'Unknown';
    const stackKey = r[stackGrouping] || 'Unknown';

    if (!xMap[xKey]) {
      xMap[xKey] = { name: xKey };
    }

    const dataKey = `${groupKey}||${stackKey}`;
    if (!xMap[xKey][dataKey]) xMap[xKey][dataKey] = 0;

    let valToAdd = 0;
    if (metric === 'Value') valToAdd = r['Value'] || 0;
    else if (metric === 'CBM') valToAdd = r['CBM'] || 0;
    else valToAdd = r['On Hand'] || 0;

    xMap[xKey][dataKey] += valToAdd;
  });

  const data = allXValues.map(x => xMap[x]).filter(Boolean);

  const series: MultiDimTrendSeries[] = [];
  targetGroups.forEach((group, gIdx) => {
    targetStacks.forEach((stack, sIdx) => {
      const risk = getRiskKind(stack);
      series.push({
        dataKey: `${group}||${stack}`,
        stackId: group,
        group,
        status: stack,
        color: risk ? RISK_COLORS[risk] : GROUP_COLORS[gIdx % GROUP_COLORS.length],
        opacity: risk ? 1 : OPACITIES[sIdx % OPACITIES.length],
        patternId: risk ? `hatch-${risk}` : undefined
      });
    });
  });

  return { data, series, targetGroups, uniqueStatuses: targetStacks, GROUP_COLORS, OPACITIES };
}

export const EMPTY_MULTI_DIM_TREND: MultiDimTrendResult = {
  data: [], series: [], targetGroups: [], uniqueStatuses: [], GROUP_COLORS: [], OPACITIES: []
};

export function MultiDimTrendChart({ trendData, trendMetric, height = 450 }: { trendData: MultiDimTrendResult; trendMetric: TrendMetric; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={trendData.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <defs>
            <pattern id="hatch-dead" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <rect width="8" height="8" fill={RISK_COLORS.dead} />
              <line x1="0" y1="0" x2="0" y2="8" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="3" />
            </pattern>
            <pattern id="hatch-slow" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <rect width="8" height="8" fill={RISK_COLORS.slow} />
              <line x1="0" y1="0" x2="0" y2="8" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="3" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(val) => formatNumberCompact(val)} width={70} />

          <Tooltip
            wrapperStyle={{ pointerEvents: 'auto' }}
            content={({ active, payload, label }: any) => {
              if (active && payload && payload.length) {
                const groups: Record<string, any[]> = {};
                payload.forEach((entry: any) => {
                  const grp = entry.dataKey.split('||')[0];
                  if (!groups[grp]) groups[grp] = [];
                  groups[grp].push(entry);
                });

                return (
                  <div className="bg-white/95 backdrop-blur-md p-4 border border-slate-200 rounded-xl shadow-xl z-50 min-w-[220px] max-h-[350px] overflow-y-auto pointer-events-auto custom-scrollbar">
                    <p className="font-bold text-slate-800 mb-2 border-b pb-1.5 flex justify-between">
                      <span>{label}</span>
                      <span className="text-indigo-600 ml-2">{trendMetric}</span>
                    </p>

                    {Object.entries(groups).map(([grp, entries]) => {
                      const total = entries.reduce((sum, e) => sum + e.value, 0);
                      if (total === 0) return null;

                      return (
                        <div key={grp} className="mb-3 last:mb-0">
                          <p className="font-bold text-xs text-slate-700 mb-1 flex justify-between items-center bg-slate-100 p-1.5 rounded-md">
                            <span>{grp}</span>
                            <span className="text-indigo-600">{formatNum(total)}</span>
                          </p>
                          <div className="space-y-1">
                            {entries.map((entry, idx) => {
                              if (entry.value === 0) return null;
                              const percent = ((entry.value / total) * 100).toFixed(1) + '%';
                              return (
                                <div key={idx} className="flex justify-between items-center text-xs pl-2 border-l-2 mb-0.5" style={{ borderColor: entry.color, opacity: entry.payload.opacity }}>
                                  <span className="text-slate-600 font-medium">{entry.name}</span>
                                  <span className="font-semibold text-slate-700 ml-3">
                                    {formatNum(entry.value)} <span className="text-[10px] text-slate-400 font-medium">({percent})</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            content={() => {
              const { targetGroups, uniqueStatuses, GROUP_COLORS: colors, OPACITIES: opacities } = trendData;
              return (
                <div className="flex flex-col items-center gap-2 pt-6">
                  <div className="flex flex-wrap justify-center gap-4">
                    {targetGroups.map((grp, i) => (
                      <div key={grp} className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <span className="w-3.5 h-3.5 rounded-sm shadow-sm" style={{ backgroundColor: colors[i % colors.length] }}></span>
                        {grp}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    {uniqueStatuses.map((status, i) => {
                      const risk = getRiskKind(status);
                      return (
                        <div key={status} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          <span
                            className="w-3 h-3 rounded-sm"
                            style={risk ? {
                              backgroundColor: RISK_COLORS[risk],
                              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.65) 0, rgba(255,255,255,0.65) 1.5px, transparent 1.5px, transparent 4px)'
                            } : { backgroundColor: '#1e293b', opacity: opacities[i % opacities.length] }}
                          ></span>
                          {status}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />

          {trendData.series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.status}
              stackId={s.stackId}
              fill={s.patternId ? `url(#${s.patternId})` : s.color}
              fillOpacity={s.opacity}
              radius={[0, 0, 0, 0]}
              maxBarSize={50}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
