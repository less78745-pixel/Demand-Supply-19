"use client";

import React from 'react';
import { Globe2 } from 'lucide-react';

interface NationalInventoryValueCardProps {
  periodLabels: string[];
  qtySeries: number[];
  valueSeries: number[];
  mosValueSeries: number[];
}

/** Level Nasional dari "Analisa Nilai Inventori" -- total gabungan SEMUA
 * cabang/region (SUM, bukan rata-rata). Sengaja disederhanakan jadi 1 tabel
 * 3-baris tanpa dimensi group-by (mirror tampilan per-cabang di
 * qty_series_by_branch, tapi cuma 1 baris "total"), bukan komponen filter. */
export function NationalInventoryValueCard({
  periodLabels,
  qtySeries,
  valueSeries,
  mosValueSeries,
}: NationalInventoryValueCardProps) {
  if (!periodLabels.length) return null;

  return (
    <div className="mb-8">
      <h4 className="text-sm sm:text-base font-extrabold text-black mb-4 flex items-center gap-2.5 border-b border-orange-200 pb-2.5">
        <Globe2 className="w-5 h-5 text-orange-400" /> Analisa Nilai Inventori - Level Nasional (Total Seluruh Cabang &amp; Region)
      </h4>
      <div className="overflow-x-auto rounded-xl border border-orange-500/30 bg-black shadow-xl">
        <table className="w-full text-xs text-left text-black">
          <thead className="bg-black text-white uppercase font-extrabold border-b border-orange-500/40 tracking-wider">
            <tr>
              <th className="py-3.5 px-4 text-left">Metrik</th>
              {periodLabels.map((label, i) => (
                <th key={i} className="py-3.5 px-3 text-right">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-orange-500/10 font-medium">
            <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/10">
              <td className="py-2 px-3 text-center font-bold text-white bg-black rounded">QTY</td>
              {qtySeries.map((v, i) => (
                <td key={i} className={`py-2.5 px-3 text-right text-sm font-bold ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                  {v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                </td>
              ))}
            </tr>
            <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/20">
              <td className="py-2 px-3 text-center font-bold text-black bg-orange-400 rounded">Value (Rp)</td>
              {valueSeries.map((v, i) => (
                <td key={i} className={`py-2.5 px-3 text-right text-sm font-bold font-mono ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                  Rp {v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                </td>
              ))}
            </tr>
            {mosValueSeries.length > 0 && (
              <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/20">
                <td className="py-2 px-3 text-center font-bold text-black bg-white border-2 border-black rounded">MOS (Value)</td>
                {mosValueSeries.map((v, i) => (
                  <td key={i} className={`py-2.5 px-3 text-right text-sm font-bold font-mono ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                    {v.toFixed(2)}x
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-black/60 mt-2">
        Total Nasional = penjumlahan QTY/Value seluruh cabang (setara SUM seluruh baris Region di tabel Regional di bawah). Rumus konversi sama persis dengan level Cabang/Region (Container &times; 68 &divide; CBM, lalu &times; Harga Product).
      </p>
    </div>
  );
}
