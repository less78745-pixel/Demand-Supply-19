"use client";

import React from 'react';
import { Map } from 'lucide-react';
import { useColumnFilters, FilterableHeader } from '@/components/ui/ColumnFilterDropdown';

interface RegionalInventoryValueTableProps {
  periodLabels: string[];
  regions: string[];
  qtySeriesByRegion: Record<string, number[]>;
  valueSeriesByRegion: Record<string, number[]>;
  mosValueSeriesByRegion: Record<string, number[]>;
  /** Region terpilih dari filter halaman (pola sama seperti selectedCabang). */
  selectedRegions: string[];
}

/** Level Regional dari "Analisa Nilai Inventori" -- Group By kolom Region
 * (baru). Struktur & styling MIRROR blok qty_series_by_branch yang sudah ada
 * di page.tsx (baris "QTY"/"Value (Rp)"/"MOS (Value)" per baris cabang),
 * cuma dimensi group-by-nya Region, bukan Cabang. */
export function RegionalInventoryValueTable({
  periodLabels,
  regions,
  qtySeriesByRegion,
  valueSeriesByRegion,
  mosValueSeriesByRegion,
  selectedRegions,
}: RegionalInventoryValueTableProps) {
  const rows = React.useMemo(
    () => regions.filter((r) => selectedRegions.includes('All') || selectedRegions.includes(r)),
    [regions, selectedRegions]
  );
  const columnDefs = React.useMemo(() => ([
    { key: 'region', type: 'select' as const, getValue: (region: string) => region },
  ]), []);
  const tableFilters = useColumnFilters(rows, columnDefs);

  if (!periodLabels.length || regions.length === 0) return null;

  return (
    <div className="mb-8">
      <h4 className="text-sm sm:text-base font-extrabold text-black mb-4 flex items-center gap-2.5 border-b border-orange-200 pb-2.5">
        <Map className="w-5 h-5 text-orange-400" /> Analisa Nilai Inventori - Level Regional (Group By Region)
      </h4>
      <div className="overflow-x-auto rounded-xl border border-orange-500/30 bg-black shadow-xl">
        <table className="w-full text-xs text-left text-black">
          <thead className="bg-black text-white uppercase font-extrabold border-b border-orange-500/40 tracking-wider">
            <tr>
              <FilterableHeader
                label="Region"
                columnKey="region"
                type="select"
                className="py-3.5 px-4"
                accentClassName="text-orange-400"
                options={tableFilters.uniqueValuesByKey['region']}
                activeFilter={tableFilters.filters['region']}
                onChange={(v) => tableFilters.setFilter('region', v)}
              />
              <th className="py-3.5 px-4 text-center">Metrik</th>
              {periodLabels.map((label, i) => (
                <th key={i} className="py-3.5 px-3 text-right">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-orange-500/10 font-medium">
            {tableFilters.filteredData.map((region) => {
              const qtyVals = qtySeriesByRegion[region] || [];
              const valVals = valueSeriesByRegion[region] || [];
              const mosVals = mosValueSeriesByRegion[region] || [];
              return (
                <React.Fragment key={region}>
                  <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/10">
                    <td className="py-3 px-4 font-black text-black text-sm bg-white" rowSpan={mosVals.length ? 3 : 2}>{region}</td>
                    <td className="py-2 px-3 text-center font-bold text-white bg-black rounded">QTY</td>
                    {qtyVals.map((v, i) => (
                      <td key={i} className={`py-2.5 px-3 text-right text-sm font-bold ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                        {v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/20">
                    <td className="py-2 px-3 text-center font-bold text-black bg-orange-400 rounded">Value (Rp)</td>
                    {valVals.map((v, i) => (
                      <td key={i} className={`py-2.5 px-3 text-right text-sm font-bold font-mono ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                        Rp {v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                  </tr>
                  {mosVals.length > 0 && (
                    <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/20">
                      <td className="py-2 px-3 text-center font-bold text-black bg-white border-2 border-black rounded">MOS (Value)</td>
                      {mosVals.map((v, i) => (
                        <td key={i} className={`py-2.5 px-3 text-right text-sm font-bold font-mono ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                          {v.toFixed(2)}x
                        </td>
                      ))}
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-black/60 mt-2">
        Region diambil dari kolom &quot;Region&quot; pada sheet &quot;Raw&quot; (default &quot;Unknown&quot; untuk file yang masih pakai template lama tanpa kolom Region). SUM seluruh baris di tabel ini = baris Nasional di atas.
      </p>
    </div>
  );
}
