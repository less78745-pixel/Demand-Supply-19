"use client";

import React, { useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { InventoryChart } from '@/components/charts/InventoryChart';
import { PackageSearch, AlertTriangle, Info, AlertOctagon, LayoutGrid, CheckCircle } from 'lucide-react';
import { uploadInventoryFile } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import toast from 'react-hot-toast';

export default function InventoryPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const [selectedCabang, setSelectedCabang] = useState<string[]>(["All"]);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(["All"]);
  const [selectedClass, setSelectedClass] = useState<string[]>(["All"]);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Running ABC-XYZ Classification...', { id: 'inventory-upload' });

    try {
      const data = await uploadInventoryFile(file);
      setResults(data);
      try {
        localStorage.setItem('lastInventory', JSON.stringify(data));
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di memori browser');
      }
      toast.success('Classification complete!', { id: 'inventory-upload' });
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.detail || 'Failed to process dataset. Please check columns.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'inventory-upload' });
    } finally {
      setIsProcessing(false);
    }
  };

  const cabangs = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.matrix_data.map((d:any) => d.cabang)))];
  }, [results]);

  const categories = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.matrix_data.map((d:any) => d.category)))];
  }, [results]);
  
  const classes = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.matrix_data.map((d:any) => d.class)))];
  }, [results]);

  const filteredData = useMemo(() => {
    if (!results) return [];
    return results.matrix_data.filter((d: any) => 
      (selectedCabang.includes("All") || selectedCabang.includes(d.cabang)) &&
      (selectedCategory.includes("All") || selectedCategory.includes(d.category)) &&
      (selectedClass.includes("All") || selectedClass.includes(d.class))
    );
  }, [results, selectedCabang, selectedCategory, selectedClass]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <PackageSearch className="w-8 h-8 text-primary" />
          Inventory Intelligence
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          ABC-XYZ Classification and Dead Stock analysis per branch.
        </p>
      </header>

      {!results ? (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <GlassCard>
              <FileUploader 
                onFileUpload={handleFileUpload} 
                isLoading={isProcessing}
                templateCsv={"Cabang,Category,Date,Penjualan,On Hand\nJakarta,Electronics,2023-01-01,50,200"}
                templateName={"inventory_template.csv"}
                label="Upload Inventory Data"
                description="Drop your Excel file with Cabang, Category, Date, Penjualan, On Hand."
              />
            </GlassCard>
          </div>
          <div className="md:col-span-1">
             <GlassCard className="h-full bg-muted/30">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Info className="w-5 h-5 text-primary" />
                Required Schema
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0"></div>
                  <div><span className="font-mono text-foreground font-semibold">Cabang</span> & <span className="font-mono text-foreground font-semibold">Category</span></div>
                </li>
              </ul>
            </GlassCard>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* KPI Row */}
          <div className="grid md:grid-cols-4 gap-6">
            <KPICard title="Total Kategori" value={filteredData.length} icon={<LayoutGrid />} />
            <KPICard title="Class A (Fast Movers)" value={results.kpi_summary.a_class_count} icon={<CheckCircle />} />
            <KPICard title="High Volatility (Z)" value={results.kpi_summary.z_class_count} icon={<AlertTriangle />} />
            <KPICard title="Dead Stock (DOH>90)" value={results.kpi_summary.dead_stock_count}
              icon={<AlertOctagon />} isAlert={results.kpi_summary.dead_stock_count > 0} />
          </div>

          {/* Stockout warning */}
          {(results.kpi_summary.stockout_risk_count ?? 0) > 0 && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-3">
              <AlertOctagon className="w-5 h-5 text-destructive shrink-0" />
              <span className="text-sm text-foreground">
                <b>{results.kpi_summary.stockout_risk_count}</b> kategori berisiko stockout (DOH &lt; 14 hari).
                Segera lakukan replenishment.
              </span>
            </div>
          )}

          {/* Chart + filters */}
          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4 border-b border-border pb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">ABC-XYZ Matrix Chart</h3>
                <div className="flex flex-wrap gap-3 mt-4">
                  <MultiSelect
                    options={cabangs}
                    selected={selectedCabang}
                    onChange={setSelectedCabang}
                    selectAllLabel="Semua Cabang"
                  />
                  <MultiSelect
                    options={categories}
                    selected={selectedCategory}
                    onChange={setSelectedCategory}
                    selectAllLabel="Semua Kategori"
                  />
                  <MultiSelect
                    options={classes}
                    selected={selectedClass}
                    onChange={setSelectedClass}
                    selectAllLabel="Semua Class"
                  />
                </div>
              </div>
              <button onClick={() => setResults(null)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition text-sm font-medium shrink-0">
                Upload Baru
              </button>
            </div>
            
            {filteredData.length > 0
              ? <InventoryChart data={filteredData} />
              : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                  Tidak ada data untuk filter yang dipilih.
                </div>
            }
          </GlassCard>

          {/* Detailed Insights Table */}
          <GlassCard>
            <h3 className="text-lg font-bold text-foreground mb-4 uppercase tracking-wide">
              Detailed Insights — Semua Kombinasi Cabang × Kategori
            </h3>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs text-left text-muted-foreground min-w-[1100px]">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                  <tr>
                    <th className="px-3 py-3">Cabang</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3 text-center">Class</th>
                    <th className="px-3 py-3 text-right">Volume</th>
                    <th className="px-3 py-3 text-right">Mean Sales</th>
                    <th className="px-3 py-3 text-right">CV</th>
                    <th className="px-3 py-3 text-right">DOH</th>
                    <th className="px-3 py-3 text-right">On Hand</th>
                    <th className="px-3 py-3 text-center">Trend</th>
                    <th className="px-3 py-3 text-center">Risk</th>
                    <th className="px-3 py-3">Strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row: any, idx: number) => {
                    const abcColor =
                      row.abc === 'A' ? 'text-primary font-bold' :
                      row.abc === 'B' ? 'text-orange-500' : 'text-muted-foreground';
                    const xyzColor =
                      row.xyz === 'X' ? 'text-blue-500' :
                      row.xyz === 'Y' ? 'text-yellow-500' : 'text-destructive';
                    const dohColor = row.doh > 90 ? 'text-destructive font-bold' :
                                     row.doh < 14 ? 'text-orange-500 font-bold' : 'text-foreground';
                    const trendColor = row.trend_pct > 5 ? 'text-primary' :
                                       row.trend_pct < -5 ? 'text-destructive' : 'text-muted-foreground';

                    return (
                      <tr key={idx} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 font-medium text-foreground">{row.cabang}</td>
                        <td className="px-3 py-3 font-medium text-foreground">{row.category}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-mono font-bold text-sm ${abcColor}`}>{row.abc}</span>
                          <span className={`font-mono font-bold text-sm ${xyzColor}`}>{row.xyz}</span>
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-foreground">{Number(row.volume).toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-medium text-foreground">{Number(row.mean_sales).toLocaleString()}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground">{Number(row.cv).toFixed(2)}</td>
                        <td className={`px-3 py-3 text-right ${dohColor}`}>{row.doh}</td>
                        <td className="px-3 py-3 text-right font-medium text-foreground">{Number(row.on_hand).toLocaleString()}</td>
                        <td className={`px-3 py-3 text-center font-medium ${trendColor}`}>
                          {row.trend_pct > 0 ? '▲' : row.trend_pct < 0 ? '▼' : '—'}
                          {' '}{Math.abs(row.trend_pct).toFixed(1)}%
                        </td>
                        <td className="px-3 py-3 text-center">
                          {row.stockout_risk && (
                            <span className="bg-destructive/10 text-destructive text-xs px-1.5 py-0.5 rounded font-bold mr-1">STOCKOUT</span>
                          )}
                          {row.overstock && (
                            <span className="bg-orange-500/10 text-orange-600 text-xs px-1.5 py-0.5 rounded font-bold">OVERSTOCK</span>
                          )}
                          {!row.stockout_risk && !row.overstock && (
                            <span className="text-muted-foreground font-semibold text-xs">OK</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs max-w-xs leading-relaxed">{row.strategy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
