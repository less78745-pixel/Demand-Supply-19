"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import {
  Box, Activity, PackageSearch, ArrowRight, LayoutDashboard, DatabaseZap, Download
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const BRANCH_COLORS = [
  'hsl(var(--primary))', '#4f46e5', '#059669', '#ea580c',
  '#2563eb', '#db2777', '#65a30d', '#d97706',
];

export default function DashboardOverview() {
  const [data, setData] = useState<any>({ occupancy: null, forecast: null, inventory: null });
  const [globalCabang, setGlobalCabang] = useState<string[]>(['All']);
  const [globalCategory, setGlobalCategory] = useState<string[]>(['All']);
  const [globalDate, setGlobalDate] = useState<string[]>(['All']);

  useEffect(() => {
    try {
      const occData = JSON.parse(localStorage.getItem('lastOccupancy') || 'null');
      // Inventory is now merged into occupancy, but also check standalone for backward compat
      const invData = occData?.inventory_analysis || JSON.parse(localStorage.getItem('lastInventory') || 'null');
      setData({
        occupancy: occData,
        forecast:  JSON.parse(localStorage.getItem('lastForecast')  || 'null'),
        inventory: invData,
      });
    } catch { /* silent */ }
  }, []);

  const hasAnyData = data.occupancy || data.forecast || data.inventory;

  const allCabangs = useMemo(() => {
    const s = new Set<string>();
    data.occupancy?.daily_data?.forEach((d: any) => s.add(d.cabang));
    data.forecast?.forecast_data?.forEach((d: any) => s.add(d.cabang));
    data.inventory?.matrix_data?.forEach((d: any) => s.add(d.cabang));
    return ['All', ...Array.from(s)];
  }, [data]);

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    data.forecast?.forecast_data?.forEach((d: any) => { if(d.category) s.add(d.category); });
    data.inventory?.matrix_data?.forEach((d: any) => { if(d.category) s.add(d.category); });
    return ['All', ...Array.from(s)];
  }, [data]);

  const allDates = useMemo(() => {
    const s = new Set<string>();
    data.occupancy?.daily_data?.forEach((d: any) => { if(d.date) s.add(d.date); });
    data.forecast?.forecast_data?.forEach((d: any) => { if(d.date) s.add(d.date); });
    return ['All', ...Array.from(s).sort()];
  }, [data]);

  const occSnapshot = useMemo(() => {
    if (!data.occupancy?.daily_data) return null;
    const filtered = data.occupancy.daily_data.filter(
      (d: any) => 
        (globalCabang.includes('All') || globalCabang.includes(d.cabang)) &&
        (globalDate.includes('All') || globalDate.includes(d.date))
    );
    if (!filtered.length) return { avg: 0, max: 0 };
    const avg = filtered.reduce((a: number, c: any) => a + c.occupancy_pct, 0) / filtered.length;
    const max = Math.max(...filtered.map((d: any) => d.occupancy_pct));
    return { avg: avg.toFixed(1), max: max.toFixed(1) };
  }, [data.occupancy, globalCabang, globalDate]);

  const occChartData = useMemo(() => {
    const summary: any[] = data.occupancy?.branch_date_summary;
    if (!summary?.length) return { chartRows: [], branches: [] };

    const filtered = summary.filter((d: any) => 
      (globalCabang.includes('All') || globalCabang.includes(d.cabang)) &&
      (globalDate.includes('All') || globalDate.includes(d.date))
    );

    const dateMap: Record<string, any> = {};
    const branchSet = new Set<string>();
    for (const row of filtered) {
      if (!dateMap[row.date]) dateMap[row.date] = { date: row.date };
      dateMap[row.date][row.cabang] = row.total_occupancy_pct || row.occupancy_pct;
      branchSet.add(row.cabang);
    }
    return {
      chartRows: Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)),
      branches:  Array.from(branchSet),
    };
  }, [data.occupancy, globalCabang, globalDate]);

  const invSnapshot = useMemo(() => {
    if (!data.inventory?.matrix_data) return null;
    const filtered = data.inventory.matrix_data.filter(
      (d: any) => 
        (globalCabang.includes('All') || globalCabang.includes(d.cabang)) &&
        (globalCategory.includes('All') || !d.category || globalCategory.includes(d.category))
    );
    return {
      total: filtered.length,
      aClass: filtered.filter((d: any) => d.abc === 'A').length,
      dead:   filtered.filter((d: any) => d.doh > 90).length,
    };
  }, [data.inventory, globalCabang, globalCategory]);

  const handleExport = () => {
    const lines: string[] = [];
    lines.push('--- EXECUTIVE DASHBOARD REPORT ---');
    lines.push(`Export Date,${new Date().toLocaleString()}`);
    lines.push('');

    // Occupancy Snapshot
    if (occSnapshot) {
      lines.push('--- OCCUPANCY SNAPSHOT ---');
      lines.push(`Avg Occupancy,${occSnapshot.avg}%`);
      lines.push(`Max Occupancy Hit,${occSnapshot.max}%`);
      lines.push('');
      
      const alerts = data.occupancy?.shortage_alerts || [];
      const filteredAlerts = alerts.filter((a: any) =>
        (globalCabang.includes('All') || globalCabang.includes(a.cabang)) &&
        (globalDate.includes('All') || globalDate.includes(a.date)) &&
        (globalCategory.includes('All') || globalCategory.includes(a.category))
      );
      if (filteredAlerts.length > 0) {
        lines.push('--- ALARM PEMENUHAN STOCK SEGERA (DEFISIT) ---');
        lines.push('Cabang,Kategori,Tanggal,Defisit');
        filteredAlerts.forEach((a: any) => {
          lines.push(`"${a.cabang}","${a.category}","${a.date}",${Number(a.deficit).toFixed(0)}`);
        });
        lines.push('');
      }
    }

    // Forecast Snapshot
    if (data.forecast) {
      lines.push('--- DSP FORECAST SNAPSHOT ---');
      lines.push(`Best Model,${data.forecast.best_model || 'SMA-3'}`);
      lines.push(`Avg Safety Stock,${data.forecast.inventory_kpis?.avg_safety_stock || 0}`);
      lines.push(`Avg Reorder Point,${data.forecast.inventory_kpis?.avg_reorder_point || 0}`);
      
      const tally = data.forecast.model_tally || {};
      lines.push(`Kombinasi DSP,${Object.values(tally).reduce((a: any, b: any) => a + b, 0)}`);
      lines.push('');
      
      const insights = data.forecast.ai_insights || [];
      if (insights.length > 0) {
        lines.push('--- FORECAST DSP INSIGHTS ---');
        insights.forEach((ins: string) => lines.push(`"${ins}"`));
        lines.push('');
      }
    }

    // Inventory Snapshot
    if (invSnapshot) {
      lines.push('--- INVENTORY HEALTH SNAPSHOT ---');
      lines.push(`Total Kategori,${invSnapshot.total}`);
      lines.push(`Fast Movers (Kelas A),${invSnapshot.aClass}`);
      lines.push(`Dead Stock Warning,${invSnapshot.dead}`);
      lines.push('');
      
      const inv = (data.inventory?.matrix_data || []).filter(
        (d: any) => 
          (globalCabang.includes('All') || globalCabang.includes(d.cabang)) &&
          (globalCategory.includes('All') || !d.category || globalCategory.includes(d.category))
      );
      if (inv.length > 0) {
        lines.push('--- INVENTORY DETAILS ---');
        lines.push('Cabang,Kategori,Kelas,DOH,Trend,Risk,Strategy');
        inv.forEach((d: any) => {
          const risk = d.stockout_risk ? 'STOCKOUT' : d.overstock ? 'OVERSTOCK' : 'OK';
          lines.push(`"${d.cabang}","${d.category}","${d.abc}${d.xyz}",${d.doh},${d.trend_pct},"${risk}","${d.strategy}"`);
        });
        lines.push('');
      }
    }

    if (lines.length <= 3) {
      toast.error('Tidak ada data untuk diexport.');
      return;
    }

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `Dashboard_Report_${dateStr}_DSP.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Dashboard report exported!');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">

      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <LayoutDashboard className="w-8 h-8 text-primary" />
            Executive Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">Overview of your latest Supply Chain Analytics.</p>
        </div>
        {hasAnyData && (
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelect
              options={allCabangs}
              selected={globalCabang}
              onChange={setGlobalCabang}
              selectAllLabel="Semua Cabang"
            />
            {allCategories.length > 1 && (
              <MultiSelect
                options={allCategories}
                selected={globalCategory}
                onChange={setGlobalCategory}
                selectAllLabel="Semua Kategori"
              />
            )}
            {allDates.length > 1 && (
              <MultiSelect
                options={allDates}
                selected={globalDate}
                onChange={setGlobalDate}
                selectAllLabel="Semua Tanggal"
              />
            )}
            <button onClick={handleExport} className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Export Dashboard
            </button>
          </div>
        )}
      </header>

      {!hasAnyData ? (
        <GlassCard className="text-center py-24 border-dashed border-2 flex flex-col items-center justify-center">
          <DatabaseZap className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Belum Ada Analisa</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Jalankan analisa di salah satu modul agar ringkasan muncul di sini.
          </p>
          <div className="flex gap-4">
            <Link href="/occupancy" className="px-5 py-2.5 bg-background border border-border hover:border-primary text-sm font-medium transition flex items-center gap-2 rounded-none">
              <Box className="w-4 h-4 text-primary" /> Run Occupancy
            </Link>
            <Link href="/forecast" className="px-5 py-2.5 bg-background border border-border hover:border-primary text-sm font-medium transition flex items-center gap-2 rounded-none">
              <Activity className="w-4 h-4 text-primary" /> Run Forecast
            </Link>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-12 animate-in fade-in duration-700">

          {/* ═══ OCCUPANCY SECTION (Asymmetric Layout) ═══ */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 uppercase tracking-wide">
                Occupancy Snapshot
              </h2>
              <Link href="/occupancy" className="text-xs text-primary hover:underline flex items-center gap-1 transition font-bold uppercase tracking-wider">
                Lihat Modul Lengkap <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {occSnapshot ? (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <KPICard title="Avg Occupancy" value={`${occSnapshot.avg}%`} icon={<Box />} />
                  <KPICard title="Max Occupancy Hit" value={`${occSnapshot.max}%`} icon={<Activity />}
                    isAlert={Number(occSnapshot.max) > 90} />
                  <GlassCard className="p-5 flex-1 bg-muted/30">
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                      Grafik menampilkan total occupancy warehouse per cabang per tanggal. Pastikan occupancy tidak melebihi 90% untuk menghindari bottleneck operasional.
                    </p>
                  </GlassCard>
                </div>

                <div className="lg:col-span-2 flex flex-col gap-6">
                  {occChartData.chartRows.length > 0 ? (
                    <GlassCard className="flex-1 min-h-[350px] flex flex-col">
                      <h3 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wide">
                        Total Occupancy per Cabang per Tanggal
                      </h3>
                      <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={occChartData.chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                              formatter={(value: any) => [`${Number(value).toFixed(2)}%`]}
                            />
                            <Legend />
                            <ReferenceLine y={100} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />
                            <ReferenceLine y={80}  stroke="#f59e0b" strokeDasharray="4 2" />
                            {occChartData.branches.map((branch: string, idx: number) => (
                              <Bar
                                key={branch}
                                dataKey={branch}
                                name={branch}
                                fill={BRANCH_COLORS[idx % BRANCH_COLORS.length]}
                                radius={[2, 2, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </GlassCard>
                  ) : (
                    <GlassCard className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Data cabang tidak tersedia untuk filter ini.
                    </GlassCard>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 border border-border bg-muted/10 text-muted-foreground text-sm rounded-md">
                Belum ada data occupancy.
              </div>
            )}

            {/* Alarm Pemenuhan Stock Segera */}
            {(() => {
              const alerts = data.occupancy?.shortage_alerts || [];
              const filteredAlerts = alerts.filter((a: any) =>
                (globalCabang.includes('All') || globalCabang.includes(a.cabang)) &&
                (globalDate.includes('All') || globalDate.includes(a.date)) &&
                (globalCategory.includes('All') || globalCategory.includes(a.category))
              );
              
              if (filteredAlerts.length === 0) return null;
              
              return (
                <div className="mt-6 animate-in fade-in slide-in-from-bottom-2">
                  <GlassCard className="border-destructive/30 bg-destructive/5 overflow-hidden">
                    <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                      <DatabaseZap className="w-4 h-4" /> Alarm Pemenuhan Stock Segera (Deficit)
                    </h3>
                    <div className="overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-sm text-left text-muted-foreground">
                        <thead className="text-xs text-foreground uppercase bg-destructive/10 border-b border-destructive/20 sticky top-0 font-bold tracking-wider z-10">
                          <tr>
                            <th className="px-4 py-3">Cabang</th>
                            <th className="px-4 py-3">Kategori</th>
                            <th className="px-4 py-3">Tanggal</th>
                            <th className="px-4 py-3 text-right">Defisit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAlerts.map((a: any, i: number) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-destructive/10 transition-colors">
                              <td className="px-4 py-3 font-semibold text-foreground">{a.cabang}</td>
                              <td className="px-4 py-3 font-semibold text-foreground">{a.category}</td>
                              <td className="px-4 py-3 font-medium">{a.date}</td>
                              <td className="px-4 py-3 text-right text-destructive font-bold">{Number(a.deficit).toFixed(0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </GlassCard>
                </div>
              );
            })()}
          </section>

          {/* ═══ FORECAST SECTION ═══ */}
          <section>
            <div className="flex items-center justify-between mb-4 border-t border-border pt-8">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 uppercase tracking-wide">
                DSP Forecast Snapshot
              </h2>
              <Link href="/forecast" className="text-xs text-primary hover:underline flex items-center gap-1 transition font-bold uppercase tracking-wider">
                Lihat Modul Lengkap <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {data.forecast ? (() => {
              const fcData = data.forecast.forecast_data || [];
              const bestModel = data.forecast.best_model || 'SMA-3';
              const tally: Record<string, number> = data.forecast.model_tally || {};

              const cabangMap: Record<string, { actuals: number[], preds: number[] }> = {};
              for (const row of fcData) {
                if (!globalCabang.includes('All') && !globalCabang.includes(row.cabang)) continue;
                if (!globalCategory.includes('All') && !globalCategory.includes(row.category)) continue;
                if (!globalDate.includes('All') && !globalDate.includes(row.date)) continue;

                if (!cabangMap[row.cabang]) cabangMap[row.cabang] = { actuals: [], preds: [] };
                cabangMap[row.cabang].actuals.push(row.actual);
                const pred = row.forecasts?.[bestModel];
                if (pred != null) cabangMap[row.cabang].preds.push(pred);
              }
              const fcChartRows = Object.entries(cabangMap).map(([cab, v]) => ({
                cabang: cab,
                'Avg Actual': Math.round(v.actuals.reduce((a, b) => a + b, 0) / (v.actuals.length || 1)),
                [`Forecast (${bestModel})`]: Math.round(v.preds.reduce((a, b) => a + b, 0) / (v.preds.length || 1)),
              }));

              const insights: string[] = data.forecast.ai_insights || [];

              return (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-4 gap-6">
                    <KPICard title="Best Model" value={bestModel} icon={<Activity />} />
                    <KPICard title="Avg Safety Stock" value={data.forecast.inventory_kpis?.avg_safety_stock || 0} icon={<Box />} />
                    <KPICard title="Avg Reorder Point" value={data.forecast.inventory_kpis?.avg_reorder_point || 0} icon={<PackageSearch />} />
                    <KPICard title="Kombinasi DSP" value={Object.values(tally).reduce((a: any, b: any) => a + b, 0)} icon={<DatabaseZap />} />
                  </div>

                  <div className="grid lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      {fcChartRows.length > 0 && (
                        <GlassCard className="h-full min-h-[300px] flex flex-col">
                          <h3 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wide">
                            Rata-rata Actual vs Forecast per Cabang
                          </h3>
                          <div className="flex-1 min-h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={fcChartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                                />
                                <Legend />
                                <Bar dataKey="Avg Actual" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
                                <Bar dataKey={`Forecast (${bestModel})`} fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </GlassCard>
                      )}
                    </div>
                    
                    <div className="lg:col-span-1 flex flex-col gap-6">
                      {Object.keys(tally).length > 0 && (
                        <GlassCard className="flex-1">
                          <p className="text-xs text-muted-foreground mb-3 font-bold uppercase tracking-wider">Distribusi Best Model</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(tally).map(([model, count]) => (
                              <span key={model} className="px-3 py-1 bg-muted border border-border text-foreground text-xs font-semibold uppercase tracking-wider">
                                {model}: {count}
                              </span>
                            ))}
                          </div>
                        </GlassCard>
                      )}

                      {insights.length > 0 && (
                        <GlassCard className="flex-1 bg-primary/5 border-primary/20">
                          <p className="text-xs text-primary mb-3 font-bold uppercase tracking-wider">DSP Insights</p>
                          <ul className="space-y-3">
                            {insights.map((ins, i) => (
                              <li key={i} className="text-sm text-foreground flex items-start gap-2 leading-relaxed">
                                <span className="text-primary mt-1 text-xs">■</span> {ins}
                              </li>
                            ))}
                          </ul>
                        </GlassCard>
                      )}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="p-6 border border-border bg-muted/10 text-muted-foreground text-sm rounded-md">
                Belum ada data forecast.
              </div>
            )}
          </section>

          {/* ═══ INVENTORY SECTION ═══ */}
          <section>
            <div className="flex items-center justify-between mb-4 border-t border-border pt-8">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 uppercase tracking-wide">
                Inventory Health Snapshot
              </h2>
              <Link href="/occupancy" className="text-xs text-primary hover:underline flex items-center gap-1 transition font-bold uppercase tracking-wider">
                Lihat Modul Lengkap <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {invSnapshot ? (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <KPICard title="Total Kategori" value={invSnapshot.total} icon={<Box />} />
                  <KPICard title="Fast Movers (Kelas A)" value={invSnapshot.aClass} icon={<Activity />} />
                  <KPICard title="Dead Stock Warning" value={invSnapshot.dead} icon={<PackageSearch />}
                    isAlert={invSnapshot.dead > 0} />
                </div>
                
                <div className="lg:col-span-2">
                  {(() => {
                    const inv = (data.inventory?.matrix_data || []).filter(
                      (d: any) => 
                        (globalCabang.includes('All') || globalCabang.includes(d.cabang)) &&
                        (globalCategory.includes('All') || !d.category || globalCategory.includes(d.category))
                    );
                    const cabMap: Record<string, { A: number, B: number, C: number }> = {};
                    for (const r of inv) {
                      if (!cabMap[r.cabang]) cabMap[r.cabang] = { A: 0, B: 0, C: 0 };
                      if (r.abc === 'A') cabMap[r.cabang].A++;
                      else if (r.abc === 'B') cabMap[r.cabang].B++;
                      else cabMap[r.cabang].C++;
                    }
                    const rows = Object.entries(cabMap).map(([cab, v]) => ({ cabang: cab, ...v }));
                    if (!rows.length) return (
                      <GlassCard className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        Data distribusi tidak tersedia.
                      </GlassCard>
                    );
                    return (
                      <GlassCard className="h-full min-h-[300px] flex flex-col">
                        <h3 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wide">Distribusi ABC per Cabang</h3>
                        <div className="flex-1 min-h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                              <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                              <Legend />
                              <Bar dataKey="A" name="Kelas A (Fast)" fill="#059669" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="B" name="Kelas B (Medium)" fill="#ea580c" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="C" name="Kelas C (Slow)" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </GlassCard>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="p-6 border border-border bg-muted/10 text-muted-foreground text-sm rounded-md">
                Belum ada data inventory.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
