/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface MosValueChartProps {
  periodLabels: string[];
  seriesByBranch: Record<string, number[]>;
  /** Optional: restrict/order which branches render (e.g. respecting an active table filter). */
  branches?: string[];
}

// ── Design notes (dataviz skill) ──────────────────────────────────────────
// The data's job here is BOTH "trend over time" AND "tell branches apart" --
// with a branch count that can run into the dozens on real uploads (provinces
// like "Aceh", "Bali", ...). Past ~3-4 series, an all-pairs form (grouped
// bars sharing one axis) can't keep every branch visually distinct no matter
// which palette is used -- that was the previous chart's actual failure mode
// ("cabang tidak kelihatan"), not a one-off color bug. The fix per the skill's
// series-count ladder is to FACET: one small bar-chart panel per cabang, so
// no two branches ever have to be told apart by hue.
//
// Within each panel there is only one series, and MOS is a "does it clear the
// threshold" state, not an identity -- so each bar is colored by STATUS
// (good vs critical against MOS = 1x), never by branch. That turns color into
// the analysis signal itself: a red bar anywhere in a panel *is* the finding.
// A single series needs no legend box (the panel title already names it);
// the two status colors get one shared icon+label strip instead, since a
// status hue is never allowed to carry meaning by hue alone.
const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const GRIDLINE = '#e1e0d9';
const BASELINE = '#c3c2b7';
const STATUS_GOOD = '#0ca30c';
const STATUS_CRITICAL = '#d03b3b';
const MOS_SAFE_THRESHOLD = 1;

function statusColor(value: number | null): string {
  if (value === null || value === undefined) return GRIDLINE;
  return value < MOS_SAFE_THRESHOLD ? STATUS_CRITICAL : STATUS_GOOD;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value;
  if (value === null || value === undefined) return null;
  const isCritical = value < MOS_SAFE_THRESHOLD;
  return (
    <div className="bg-white border rounded-lg px-3 py-2 shadow-xl" style={{ borderColor: 'rgba(11,11,11,0.10)' }}>
      <p className="text-[11px] font-semibold mb-0.5" style={{ color: INK_SECONDARY }}>{label}</p>
      <p className="text-base font-bold" style={{ color: INK_PRIMARY }}>
        {Number(value).toFixed(2)}x
        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide" style={{ color: isCritical ? STATUS_CRITICAL : STATUS_GOOD }}>
          {isCritical ? 'Risiko' : 'Aman'}
        </span>
      </p>
    </div>
  );
};

// Selective labeling (never a number on every bar): only the weeks that
// breach the safe threshold get a direct value label -- those are the ones
// the reader needs to act on. Everything else stays legible through the
// y-axis, the tooltip, and the table above this chart.
const renderCriticalLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (value === null || value === undefined || value >= MOS_SAFE_THRESHOLD) return null;
  return (
    <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={700} fill={STATUS_CRITICAL}>
      {Number(value).toFixed(2)}
    </text>
  );
};

const BAR_WIDTH_PX = 22;
const MIN_PANEL_WIDTH_PX = 420;

function BranchPanel({ cabang, values, periodLabels }: { cabang: string; values: (number | null)[]; periodLabels: string[] }) {
  const chartData = periodLabels.map((label, i) => ({ label, value: values[i] ?? null }));
  const knownWeeks = chartData.filter((d) => d.value !== null);
  const criticalWeeks = knownWeeks.filter((d) => (d.value as number) < MOS_SAFE_THRESHOLD);
  const chartWidth = Math.max(MIN_PANEL_WIDTH_PX, chartData.length * BAR_WIDTH_PX);

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(11,11,11,0.10)' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b" style={{ borderColor: GRIDLINE }}>
        <span className="font-bold text-sm truncate" style={{ color: INK_PRIMARY }} title={cabang}>{cabang}</span>
        {knownWeeks.length > 0 && (
          <span
            className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={
              criticalWeeks.length > 0
                ? { color: STATUS_CRITICAL, backgroundColor: 'rgba(208,59,59,0.10)' }
                : { color: STATUS_GOOD, backgroundColor: 'rgba(12,163,12,0.10)' }
            }
          >
            {criticalWeeks.length > 0 ? `${criticalWeeks.length}/${knownWeeks.length} minggu berisiko` : 'Semua minggu aman'}
          </span>
        )}
      </div>
      <div className="w-full h-[190px] overflow-x-auto">
        <div style={{ width: chartWidth, height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 18, right: 12, left: 4, bottom: 34 }}>
              <CartesianGrid strokeDasharray="none" stroke={GRIDLINE} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={BASELINE}
                tick={{ fill: INK_MUTED, fontSize: 9, fontWeight: 600 }}
                angle={-40}
                textAnchor="end"
                height={40}
                interval={0}
                tickLine={false}
              />
              <YAxis
                stroke={BASELINE}
                tick={{ fill: INK_MUTED, fontSize: 10 }}
                tickLine={false}
                width={34}
                unit="x"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(11,11,11,0.05)' }} />
              <ReferenceLine
                y={MOS_SAFE_THRESHOLD}
                stroke={INK_SECONDARY}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: '1x', fill: INK_SECONDARY, fontSize: 9, fontWeight: 700, position: 'right' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={chartData.length <= 60}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={statusColor(d.value)} />
                ))}
                <LabelList dataKey="value" content={renderCriticalLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function MosValueChart({ periodLabels, seriesByBranch, branches }: MosValueChartProps) {
  // Semua cabang ditampilkan (tidak dipotong) -- panel grid di bawah sudah
  // di-scroll per halaman, jadi menampilkan seluruh cabang tetap aman dibaca.
  const branchNames = branches && branches.length ? branches : Object.keys(seriesByBranch);

  if (periodLabels.length === 0 || branchNames.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Legenda status (bukan legenda per-cabang -- tiap panel di bawah hanya
          punya satu seri, jadi judul panelnya sendiri sudah menamainya). Warna
          status wajib disertai ikon+label, tidak boleh hanya mengandalkan hue. */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold" style={{ color: INK_SECONDARY }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: STATUS_GOOD }} /> Aman (MOS &ge; 1x)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: STATUS_CRITICAL }} /> Risiko (MOS &lt; 1x)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: INK_SECONDARY }} /> Batas aman (1x)
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {branchNames.map((cabang) => (
          <BranchPanel key={cabang} cabang={cabang} values={seriesByBranch[cabang] || []} periodLabels={periodLabels} />
        ))}
      </div>
    </div>
  );
}
