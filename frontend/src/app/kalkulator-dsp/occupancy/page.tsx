"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { OccupancyChart } from '@/components/charts/OccupancyChart';
import { InventoryChart } from '@/components/charts/InventoryChart';
import { Activity, AlertTriangle, Info, TrendingUp, TrendingDown, AlertOctagon, Layers, Download, PackageSearch, LayoutGrid, CheckCircle } from 'lucide-react';
import { uploadOccupancyFile } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';

export default function OccupancyPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults]           = useState<any>(null);

  // ── Restore previous results from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastOccupancy');
      if (saved) {
        setResults(JSON.parse(saved));
      }
    } catch { /* ignore corrupt data */ }
  }, []);

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
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      try {
        localStorage.setItem('lastOccupancy', JSON.stringify(data));
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di memori browser');
      }
      // Also save inventory data separately for dashboard compatibility
      if (data.inventory_analysis) {
        try {
          localStorage.setItem('lastInventory', JSON.stringify(data.inventory_analysis));
        } catch(e) {}
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

    // Over Occupancy Insights
    if (results.over_occupancy_insights?.length) {
      lines.push('');
      lines.push('--- WARNING: RAWAN PENUH (>90%) ---');
      results.over_occupancy_insights.forEach((ins: string) => {
        lines.push(`"${ins}"`);
      });
    }

    const blob = new Blob(['sep=,\r\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
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

  const filteredShortageAlerts = useMemo(() => {
    if (!results?.shortage_alerts) return [];
    return results.shortage_alerts.filter((a: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(a.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(a.date)) &&
      (selectedCategory.includes('All') || selectedCategory.includes(a.category))
    );
  }, [results, selectedCabang, selectedDate, selectedCategory]);

  const kpiMetrics = useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return {
        avg: 0,
        peak: 0,
        top3Peak: [] as Array<{ cabang: string; date: string; val: string }>,
        min: 0,
        bottom3Min: [] as Array<{ cabang: string; date: string; val: string }>,
        riskCount: 0,
        top5RiskCategories: [] as Array<{ category: string; cabang: string; reason: string }>,
      };
    }

    // Avg Occupancy from active filtered data
    const totalOccupancy = filteredData.reduce((acc: number, item: any) => acc + Number(item.occupancy_pct || 0), 0);
    const avg = Number((totalOccupancy / filteredData.length).toFixed(1));

    // Sorted by occupancy_pct descending (Peak Occupancy)
    const sortedDesc = [...filteredData].sort((a: any, b: any) => Number(b.occupancy_pct || 0) - Number(a.occupancy_pct || 0));
    const peak = sortedDesc[0] ? Number(sortedDesc[0].occupancy_pct || 0).toFixed(1) : 0;
    const top3Peak = sortedDesc.slice(0, 3).map((item: any) => ({
      cabang: item.cabang,
      date: item.date,
      val: Number(item.occupancy_pct || 0).toFixed(1)
    }));

    // Sorted by occupancy_pct ascending (Min Occupancy)
    const sortedAsc = [...filteredData].sort((a: any, b: any) => Number(a.occupancy_pct || 0) - Number(b.occupancy_pct || 0));
    const min = sortedAsc[0] ? Number(sortedAsc[0].occupancy_pct || 0).toFixed(1) : 0;
    const bottom3Min = sortedAsc.slice(0, 3).map((item: any) => ({
      cabang: item.cabang,
      date: item.date,
      val: Number(item.occupancy_pct || 0).toFixed(1)
    }));

    // Categories at Risk: combines shortage alerts and inventory analysis risks
    const riskMap = new Map<string, { category: string; cabang: string; reason: string; score: number }>();
    
    if (filteredShortageAlerts && filteredShortageAlerts.length > 0) {
      filteredShortageAlerts.forEach((item: any) => {
        const key = `${item.cabang}-${item.category}`;
        riskMap.set(key, {
          category: item.category,
          cabang: item.cabang,
          reason: `Defisit: ${item.deficit}`,
          score: 1000 + Number(item.deficit || 0)
        });
      });
    }

    if (filteredInvData && filteredInvData.length > 0) {
      filteredInvData.forEach((item: any) => {
        if (item.stockout_risk || item.xyz === 'Z' || item.doh > 90) {
          const key = `${item.cabang}-${item.category}`;
          if (!riskMap.has(key)) {
            const reason = item.stockout_risk ? `Stockout Risk (DOH: ${item.doh})` : item.doh > 90 ? `Dead Stock (DOH: ${item.doh})` : `High Volatility (${item.class})`;
            const score = item.stockout_risk ? 500 : item.doh > 90 ? 300 : 100;
            riskMap.set(key, { category: item.category, cabang: item.cabang, reason, score });
          }
        }
      });
    }

    const riskList = Array.from(riskMap.values()).sort((a, b) => b.score - a.score);
    const top5RiskCategories = riskList.slice(0, 5);
    const riskCount = riskList.length || results?.kpi_summary?.categories_at_risk || 0;

    return {
      avg,
      peak,
      top3Peak,
      min,
      bottom3Min,
      riskCount,
      top5RiskCategories,
    };
  }, [filteredData, filteredShortageAlerts, filteredInvData, results]);

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

      <div className="grid md:grid-cols-3 gap-6 mb-8 items-stretch">
        <div className="md:col-span-2">
          <GlassCard className="h-full bg-muted/30 flex flex-col justify-center">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-5 h-5 text-primary" /> Required Schema
            </h3>
            <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
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
        <div className="md:col-span-1 flex flex-col">
          <GlassCard className="h-full flex items-center justify-center p-3">
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv={
                'Cabang,Category,On Hand,In,Out,Capacity,Date\n' +
                'Jakarta,Electronics,200,150,120,5000,2024-01-01\n' +
                'Surabaya,Apparel,300,180,190,4000,2024-01-01'
              }
              templateName="occupancy_template.csv"
              label="Upload Occupancy Data"
              description="File Excel dengan kolom: Cabang, Category, On Hand, In, Out, Capacity, Date."
            />
          </GlassCard>
        </div>
      </div>

      {results && (
        /* ── Result state ── */
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              📈 Hasil Analisa Occupancy & Shortage
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>

          {/* ═══ OCCUPANCY SECTION ═══ */}

          {/* KPI Row & Deep Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Avg Occupancy */}
            <GlassCard className="flex flex-col justify-between p-5 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Occupancy</span>
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="my-4">
                <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.avg}%</div>
                <p className="text-xs text-muted-foreground mt-1">Rerata dari filter aktif</p>
              </div>
            </GlassCard>

            {/* Peak Occupancy (Top 3) */}
            <GlassCard className="flex flex-col justify-between p-5 border-orange-500/30 bg-orange-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">Peak Occupancy</span>
                  <Layers className="w-5 h-5 text-orange-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.peak}%</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Top 3 Maksimum (Cabang & Periode):</p>
                </div>
                <div className="space-y-1.5 mt-2">
                  {kpiMetrics.top3Peak.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[120px]">#{idx+1} {p.cabang} <span className="text-[10px] text-muted-foreground">({p.date})</span></span>
                      <span className="font-bold text-orange-500 ml-2">{p.val}%</span>
                    </div>
                  ))}
                  {kpiMetrics.top3Peak.length === 0 && <p className="text-xs text-muted-foreground italic">Tidak ada data</p>}
                </div>
              </div>
            </GlassCard>

            {/* Min Occupancy (Bottom 3) */}
            <GlassCard className="flex flex-col justify-between p-5 border-blue-500/30 bg-blue-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Min Occupancy</span>
                  <TrendingDown className="w-5 h-5 text-blue-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.min}%</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Bottom 3 Minimum (Cabang & Periode):</p>
                </div>
                <div className="space-y-1.5 mt-2">
                  {kpiMetrics.bottom3Min.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[120px]">#{idx+1} {m.cabang} <span className="text-[10px] text-muted-foreground">({m.date})</span></span>
                      <span className="font-bold text-blue-500 ml-2">{m.val}%</span>
                    </div>
                  ))}
                  {kpiMetrics.bottom3Min.length === 0 && <p className="text-xs text-muted-foreground italic">Tidak ada data</p>}
                </div>
              </div>
            </GlassCard>

            {/* Categories at Risk (Top 5) */}
            <GlassCard className="flex flex-col justify-between p-5 border-destructive/30 bg-destructive/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-destructive uppercase tracking-wider">Categories at Risk</span>
                  <AlertOctagon className="w-5 h-5 text-destructive" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.riskCount}</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Top 5 Kategori Berbahaya:</p>
                </div>
                <div className="space-y-1.5 mt-2 max-h-[140px] overflow-y-auto">
                  {kpiMetrics.top5RiskCategories.map((r, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px] py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[110px]">#{idx+1} {r.category} <span className="text-[9px] text-muted-foreground">({r.cabang})</span></span>
                      <span className="font-bold text-destructive ml-1">{r.reason}</span>
                    </div>
                  ))}
                  {kpiMetrics.top5RiskCategories.length === 0 && <p className="text-xs text-muted-foreground italic">Aman (Tidak ada risiko)</p>}
                </div>
              </div>
            </GlassCard>
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
          {filteredShortageAlerts.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2 uppercase tracking-wide">
                <AlertTriangle className="w-5 h-5" /> Shortage Alerts (Mengikuti Filter)
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
                    {filteredShortageAlerts.map((a: any, i: number) => (
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
                        <MultiSelect
                          options={cabangs}
                          selected={selectedCabang}
                          onChange={setSelectedCabang}
                          selectAllLabel="Semua Cabang"
                        />
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
