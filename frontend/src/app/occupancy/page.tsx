"use client";

import React, { useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { OccupancyChart } from '@/components/charts/OccupancyChart';
import { InventoryChart } from '@/components/charts/InventoryChart';
import { Activity, AlertTriangle, Info, TrendingUp, AlertOctagon, Layers, Download, PackageSearch, LayoutGrid, CheckCircle } from 'lucide-react';
import { uploadOccupancyFile } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import toast from 'react-hot-toast';

export default function OccupancyPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults]           = useState<any>(null);

  const [selectedCabang,   setSelectedCabang]   = useState<string[]>(['All']);
  const [selectedDate,     setSelectedDate]     = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedClass,    setSelectedClass]    = useState<string[]>(['All']);

  // ── Upload handler ──
  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Analyzing occupancy & inventory dataset...', { id: 'occ' });
    try {
      const data = await uploadOccupancyFile(file);
      setResults(data);
      localStorage.setItem('lastOccupancy', JSON.stringify(data));
      // Also save inventory data separately for dashboard compatibility
      if (data.inventory_analysis) {
        localStorage.setItem('lastInventory', JSON.stringify(data.inventory_analysis));
      }
      toast.success('Analysis complete!', { id: 'occ' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to process. Check columns.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'occ' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── CSV export with insights ──
  const handleExport = () => {
    if (!results?.daily_data) return;
    const rows = results.daily_data;
    
    // Main data section
    const header = ['Date','Cabang','Total On Hand','Capacity','Occupancy Pct (%)'];
    const lines = [
      header.join(','),
      ...rows.map((r: any) =>
        [r.date, r.cabang, r.total_on_hand, r.capacity, r.occupancy_pct].join(',')
      ),
    ];
    
    // KPI Summary section
    lines.push('');
    lines.push('--- DSP INSIGHT: KPI SUMMARY ---');
    lines.push(`Avg Occupancy (%),${results.kpi_summary?.avg_occupancy || 0}`);
    lines.push(`Max Occupancy (%),${results.kpi_summary?.max_occupancy || 0}`);
    lines.push(`Categories at Risk,${results.kpi_summary?.categories_at_risk || 0}`);

    // Over Occupancy Insights
    const overData = rows.filter((d: any) => d.occupancy_pct > 100);
    if (overData.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: OVER OCCUPANCY (> 100%) ---');
      lines.push('Date,Cabang,Occupancy Pct (%)');
      overData.forEach((d: any) => lines.push(`${d.date},${d.cabang},${d.occupancy_pct}`));
    }

    // Lower Occupancy Insights
    const lowerData = rows.filter((d: any) => d.occupancy_pct < 50);
    if (lowerData.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: LOWER OCCUPANCY (< 50%) ---');
      lines.push('Date,Cabang,Occupancy Pct (%)');
      lowerData.forEach((d: any) => lines.push(`${d.date},${d.cabang},${d.occupancy_pct}`));
    }

    // Shortage Alerts
    const alerts = results.shortage_alerts || [];
    if (alerts.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: SHORTAGE ALERTS (DEFICIT) ---');
      lines.push('Cabang,Category,Date,Deficit');
      alerts.forEach((a: any) => lines.push(`${a.cabang},${a.category},${a.date},${a.deficit}`));
    }

    // Inventory Analysis (if available)
    const inv = results.inventory_analysis;
    if (inv?.matrix_data?.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHT: INVENTORY ABC-XYZ CLASSIFICATION ---');
      lines.push('Cabang,Category,Class,Volume,Mean Sales,CV,DOH,On Hand,Trend (%),Risk,Strategy');
      inv.matrix_data.forEach((r: any) => {
        const risk = r.stockout_risk ? 'STOCKOUT' : r.overstock ? 'OVERSTOCK' : 'OK';
        lines.push(`"${r.cabang}","${r.category}","${r.class}",${r.volume},${r.mean_sales},${r.cv},${r.doh},${r.on_hand},${r.trend_pct},"${risk}","${r.strategy}"`);
      });

      if (inv.dead_stock?.length > 0) {
        lines.push('');
        lines.push('--- DSP INSIGHT: DEAD STOCK (DOH > 90 HARI) ---');
        lines.push('Cabang,Category,DOH,On Hand,Class');
        inv.dead_stock.forEach((d: any) => lines.push(`${d.cabang},${d.category},${d.doh},${d.on_hand},${d.class}`));
      }
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `Hasil Occupancy_Inventory_${dateStr}_DSP.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Full report exported with DSP Insights!');
  };

  // ── Dropdown options ──
  const cabangs = useMemo(() => {
    if (!results?.daily_data) return [];
    return ['All', ...Array.from(new Set<string>(results.daily_data.map((d: any) => d.cabang)))];
  }, [results]);

  const dates = useMemo(() => {
    if (!results?.daily_data) return [];
    return ['All', ...Array.from(new Set<string>(results.daily_data.map((d: any) => d.date))).sort()];
  }, [results]);

  const invCategories = useMemo(() => {
    if (!results?.inventory_analysis?.matrix_data) return [];
    return ['All', ...Array.from(new Set<string>(results.inventory_analysis.matrix_data.map((d: any) => d.category)))];
  }, [results]);

  const invClasses = useMemo(() => {
    if (!results?.inventory_analysis?.matrix_data) return [];
    return ['All', ...Array.from(new Set<string>(results.inventory_analysis.matrix_data.map((d: any) => d.class)))];
  }, [results]);

  const filteredData = useMemo(() => {
    if (!results?.daily_data) return [];
    return results.daily_data.filter((d: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(d.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(d.date))
    );
  }, [results, selectedCabang, selectedDate]);

  const insights = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return { over: [], lower: [] };
    const over = filteredData.filter((d: any) => d.occupancy_pct > 100);
    const lower = filteredData.filter((d: any) => d.occupancy_pct < 50);
    return { over, lower };
  }, [filteredData]);

  const filteredInvData = useMemo(() => {
    if (!results?.inventory_analysis?.matrix_data) return [];
    return results.inventory_analysis.matrix_data.filter((d: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(d.cabang)) &&
      (selectedCategory.includes('All') || selectedCategory.includes(d.category)) &&
      (selectedClass.includes('All') || selectedClass.includes(d.class))
    );
  }, [results, selectedCabang, selectedCategory, selectedClass]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">

      {/* Header */}
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <Activity className="w-8 h-8 text-primary" />
          Occupancy & Inventory Projector
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Balance (On Hand + In − Out) per category per tanggal ÷ kapasitas warehouse cabang + ABC-XYZ Classification.
        </p>
      </header>

      {!results ? (
        /* ── Upload state ── */
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <GlassCard>
              <FileUploader
                onFileUpload={handleFileUpload}
                isLoading={isProcessing}
                templateCsv={
                  'Cabang,Category,On Hand,In,Out,Capacity,Date\n' +
                  'Jakarta,Electronics,200,150,120,5000,2024-01-01\n' +
                  'Surabaya,Apparel,300,180,190,4000,2024-01-01'
                }
                templateName="occupancy_template.csv"
                label="Upload Occupancy & Inventory Data"
                description="File Excel dengan kolom: Cabang, Category, On Hand, In, Out, Capacity, Date."
              />
            </GlassCard>
          </div>
          <div className="md:col-span-1">
            <GlassCard className="h-full bg-muted/30">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Info className="w-5 h-5 text-primary" /> Required Schema
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {['Cabang','Category','On Hand (stok awal)','In (masuk)','Out (keluar / penjualan)',
                  'Capacity (total kapasitas warehouse per cabang)','Date'].map(col => (
                  <li key={col} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                    <span className="font-mono text-foreground font-semibold text-xs">{col}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-md">
                <p className="text-xs text-foreground flex items-start gap-2 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-primary" />
                  <span><b>Out</b> akan digunakan sebagai proxy <b>Penjualan</b> untuk analisa ABC-XYZ Inventory.</span>
                </p>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : (
        /* ── Result state ── */
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* ═══ OCCUPANCY SECTION ═══ */}

          {/* KPI Row */}
          <div className="grid md:grid-cols-3 gap-6">
            <KPICard title="Avg Occupancy" value={`${results.kpi_summary.avg_occupancy}%`} icon={<TrendingUp />} />
            <KPICard title="Peak Occupancy" value={`${results.kpi_summary.max_occupancy}%`} icon={<Layers />}
              isAlert={results.kpi_summary.max_occupancy > 100} />
            <KPICard title="Categories at Risk" value={results.kpi_summary.categories_at_risk} icon={<AlertOctagon />}
              isAlert={results.kpi_summary.categories_at_risk > 0} />
          </div>

          {/* Insights Row */}
          {(insights.over.length > 0 || insights.lower.length > 0) && (
            <div className="grid md:grid-cols-2 gap-6">
              {insights.over.length > 0 && (
                <GlassCard className="border-orange-500/30 bg-orange-500/5">
                  <h3 className="text-lg font-bold text-orange-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <AlertTriangle className="w-5 h-5" /> Over Occupancy (&gt; 100%)
                  </h3>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-sm text-left text-muted-foreground">
                      <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Cabang</th>
                          <th className="px-4 py-3">Tanggal</th>
                          <th className="px-4 py-3 text-right">Occupancy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.over.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{a.cabang}</td>
                            <td className="px-4 py-3">{a.date}</td>
                            <td className="px-4 py-3 text-right font-bold text-orange-500">{a.occupancy_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}

              {insights.lower.length > 0 && (
                <GlassCard className="border-blue-500/30 bg-blue-500/5">
                  <h3 className="text-lg font-bold text-blue-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Info className="w-5 h-5" /> Lower Occupancy (&lt; 50%)
                  </h3>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-sm text-left text-muted-foreground">
                      <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Cabang</th>
                          <th className="px-4 py-3">Tanggal</th>
                          <th className="px-4 py-3 text-right">Occupancy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.lower.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{a.cabang}</td>
                            <td className="px-4 py-3">{a.date}</td>
                            <td className="px-4 py-3 text-right font-bold text-blue-500">{a.occupancy_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}
            </div>
          )}

          {/* Chart Card */}
          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4 border-b border-border pb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">
                  Occupancy per Cabang per Tanggal
                </h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  Total On Hand (All Categories) ÷ Kapasitas Cabang
                </p>
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mt-4">
                  <MultiSelect
                    options={cabangs}
                    selected={selectedCabang}
                    onChange={setSelectedCabang}
                    selectAllLabel="Semua Cabang"
                  />
                  <MultiSelect
                    options={dates}
                    selected={selectedDate}
                    onChange={setSelectedDate}
                    selectAllLabel="Semua Tanggal"
                  />
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm flex items-center gap-2 font-medium">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
                <button onClick={() => setResults(null)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition text-sm font-medium">
                  Upload Baru
                </button>
              </div>
            </div>

            {filteredData.length > 0
              ? <OccupancyChart data={filteredData} />
              : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                  Tidak ada data untuk filter yang dipilih.
                </div>
            }
          </GlassCard>

          {/* Shortage Alerts */}
          {results.shortage_alerts?.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2 uppercase tracking-wide">
                <AlertTriangle className="w-5 h-5" /> Shortage Alerts
              </h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm text-left text-muted-foreground">
                  <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Cabang</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3 text-right">Deficit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.shortage_alerts.map((a: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{a.cabang}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{a.category}</td>
                        <td className="px-4 py-3">{a.date}</td>
                        <td className="px-4 py-3 text-right text-destructive font-bold">{Number(a.deficit).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* ═══ INVENTORY INTELLIGENCE SECTION ═══ */}
          {results.inventory_analysis && (
            <>
              <div className="border-t border-border pt-8">
                <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase mb-6">
                  <PackageSearch className="w-7 h-7 text-primary" />
                  Inventory Intelligence (ABC-XYZ)
                </h2>

                {/* Inventory KPI Row */}
                <div className="grid md:grid-cols-4 gap-6 mb-6">
                  <KPICard title="Total Kategori" value={results.inventory_analysis.kpi_summary?.total_categories || 0} icon={<LayoutGrid />} />
                  <KPICard title="Class A (Fast Movers)" value={results.inventory_analysis.kpi_summary?.a_class_count || 0} icon={<CheckCircle />} />
                  <KPICard title="High Volatility (Z)" value={results.inventory_analysis.kpi_summary?.z_class_count || 0} icon={<AlertTriangle />} />
                  <KPICard title="Dead Stock (DOH>90)" value={results.inventory_analysis.kpi_summary?.dead_stock_count || 0}
                    icon={<AlertOctagon />} isAlert={(results.inventory_analysis.kpi_summary?.dead_stock_count || 0) > 0} />
                </div>

                {/* Stockout warning */}
                {(results.inventory_analysis.kpi_summary?.stockout_risk_count ?? 0) > 0 && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-3 mb-6">
                    <AlertOctagon className="w-5 h-5 text-destructive shrink-0" />
                    <span className="text-sm text-foreground">
                      <b>{results.inventory_analysis.kpi_summary.stockout_risk_count}</b> kategori berisiko stockout (DOH &lt; 14 hari).
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
                        {invCategories.length > 1 && (
                          <MultiSelect
                            options={invCategories}
                            selected={selectedCategory}
                            onChange={setSelectedCategory}
                            selectAllLabel="Semua Kategori"
                          />
                        )}
                        {invClasses.length > 1 && (
                          <MultiSelect
                            options={invClasses}
                            selected={selectedClass}
                            onChange={setSelectedClass}
                            selectAllLabel="Semua Class"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {filteredInvData.length > 0
                    ? <InventoryChart data={filteredInvData} />
                    : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                        Tidak ada data untuk filter yang dipilih.
                      </div>
                  }
                </GlassCard>

                {/* Detailed Insights Table */}
                <GlassCard className="mt-6">
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
                        {filteredInvData.map((row: any, idx: number) => {
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
