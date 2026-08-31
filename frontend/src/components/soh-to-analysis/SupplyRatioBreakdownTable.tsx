"use client";

import React from 'react';

export interface SupplyRatioBreakdownRow {
  label: string;
  totalSupply: number;
  totalTargetSales: number;
  /** null saat Target Sales grup ini kosong/<=0 -- ditampilkan sebagai "N/A", BUKAN 0. */
  ratio: number | null;
}

interface SupplyRatioBreakdownTableProps {
  title: string;
  /** Nama kolom dimensi group-by, mis. "Region" atau "Status DOI". */
  labelHeader: string;
  icon: React.ReactNode;
  rows: SupplyRatioBreakdownRow[];
  unitLabel: string;
}

/** Tabel breakdown "Hasil Hitungan (Rasio Pasokan vs Target Sales)" untuk satu
 * dimensi group-by (Region ATAU Status DOI -- dipakai 2x dengan props beda,
 * bukan didup jadi 2 komponen terpisah). SUM Total Pasokan & Target Sales
 * dihitung di caller (page.tsx, dari detailedTableData); komponen ini murni
 * presentasi + urutan tampil (rasio terkecil/paling berisiko di atas, sudah
 * diurutkan oleh caller). */
export function SupplyRatioBreakdownTable({ title, labelHeader, icon, rows, unitLabel }: SupplyRatioBreakdownTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2 mb-3">
        {icon} {title}
      </h4>
      <div className="overflow-x-auto rounded-xl border border-slate-700 shadow-xl">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-900 text-slate-300 uppercase font-bold tracking-wider">
            <tr>
              <th className="py-3 px-4">{labelHeader}</th>
              <th className="py-3 px-3 text-right">Total Pasokan ({unitLabel})</th>
              <th className="py-3 px-3 text-right">Target Sales ({unitLabel})</th>
              <th className="py-3 px-3 text-right">Hasil Hitungan (Rasio)</th>
            </tr>
          </thead>
          <tbody className="bg-slate-100 divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.label} className="hover:bg-slate-200/60 transition">
                <td className="py-2.5 px-4 font-bold text-slate-900">{row.label}</td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-800">{Math.round(row.totalSupply).toLocaleString('id-ID')}</td>
                <td className="py-2.5 px-3 text-right font-mono text-slate-800">{Math.round(row.totalTargetSales).toLocaleString('id-ID')}</td>
                <td className={`py-2.5 px-3 text-right font-mono font-black ${row.ratio !== null && row.ratio < 1 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {row.ratio !== null ? `${row.ratio.toFixed(2)}x` : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        Rasio = SUM Total Pasokan &divide; SUM Target Sales per {labelHeader.toLowerCase()} (bukan rata-rata rasio per baris). Diurutkan dari rasio terkecil (paling berisiko).
      </p>
    </div>
  );
}
