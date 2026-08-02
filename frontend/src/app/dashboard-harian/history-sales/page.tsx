"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { TrendingUp, Info, DollarSign, BarChart3, Table as TableIcon, Download, Sparkles, CheckCircle2, AlertCircle, Award, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308'];

const DISTINCT_PALETTE = [
  '#10B981', '#3B82F6', '#F97316', '#A855F7', '#06B6D4', '#EC4899', '#EAB308', '#EF4444', 
  '#84CC16', '#6366F1', '#14B8A6', '#D97706', '#8B5CF6', '#F43F5E', '#0EA5E9', '#1E40AF', 
  '#991B1B', '#065F46', '#4C1D95', '#854D0E', '#34D399', '#FBBF24', '#F87171', '#60A5FA'
];

export default function HistorySalesPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartFilter, setChartFilter] = useState<'all' | 'sales' | 'outstanding'>('all');

  useEffect(() => {
    get('last_history_sales').then(saved => {
      if (saved) setParsed(saved);
    }).catch(err => console.warn('Failed to load History Sales state from IndexDB', err));
  }, []);
  
  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca data History Sales...', { id: 'sales' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      try {
        await set('last_history_sales', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('Data History Sales berhasil di-load!', { id: 'history' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'sales' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['cabang', 'branch_name', 'branch', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['category', 'grup', 'kategori item', 'kategori']) : undefined, [parsed]);

  // Linked Filter options
  const cabangs = useMemo(() => {
    if (!parsed || !colCabang) return [];
    const source = parsed.data.filter(d =>
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()];
  }, [parsed, colCabang, selectedCategory, colCategory]);

  const categories = useMemo(() => {
    if (!parsed || !colCategory) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()];
  }, [parsed, colCategory, selectedCabang, colCabang]);

  // Handle Export
  const handleExport = () => {
    if (!parsed || !parsed.data) return;
    const header = parsed.headers.map(h => `"${h}"`).join(',');
    const lines = [header];
    
    filtered.forEach(row => {
      const line = parsed.headers.map(h => {
        let val = row[h];
        if (val === undefined || val === null) val = '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(',');
      lines.push(line);
    });
    
    // Force Excel to use semicolon separator for Indonesian locale
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'history_sales_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Data
  const filtered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory]))
    );
  }, [parsed, selectedCabang, selectedCategory, colCabang, colCategory]);

  // KPIs
  const kpis = useMemo(() => {
    if (!parsed) return [];
    return parsed.targetColumns.slice(0, 4).map(tc => {
      const total = filtered.reduce((a, d) => a + (d[tc.name] || 0), 0);
      return { name: tc.name, total };
    });
  }, [parsed, filtered]);

  // Chart data: Grouped by Cabang
  const chartData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};
    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (!map[cbg]) {
        map[cbg] = { cabang: cbg };
        parsed.targetColumns.forEach(tc => map[cbg][tc.name] = 0);
      }
      parsed.targetColumns.forEach(tc => {
        map[cbg][tc.name] += (row[tc.name] || 0);
      });
    }
    return Object.values(map);
  }, [parsed, filtered, colCabang]);

  // Executive Summary Insights Computation
  const executiveSummary = useMemo(() => {
    if (!parsed || filtered.length === 0) return null;

    let totalSales = 0;
    let totalOutstanding = 0;
    const salesCols: string[] = [];
    const outstandingCols: string[] = [];

    parsed.targetColumns.forEach(tc => {
      const lower = tc.name.toLowerCase();
      if (lower.includes('sales') || lower.includes('jual') || lower.includes('avg')) {
        salesCols.push(tc.name);
      } else {
        outstandingCols.push(tc.name);
      }
    });

    const cabangVol: Record<string, { sales: number; outstanding: number; total: number }> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (String(row[colCabang] || 'Unknown')) : 'All';
      if (!cabangVol[cbg]) cabangVol[cbg] = { sales: 0, outstanding: 0, total: 0 };

      salesCols.forEach(col => {
        const val = Number(row[col]) || 0;
        totalSales += val;
        cabangVol[cbg].sales += val;
        cabangVol[cbg].total += val;
      });

      outstandingCols.forEach(col => {
        const val = Number(row[col]) || 0;
        totalOutstanding += val;
        cabangVol[cbg].outstanding += val;
        cabangVol[cbg].total += val;
      });
    }

    const sortedCabang = Object.entries(cabangVol).sort((a, b) => b[1].total - a[1].total);
    const topCabang = sortedCabang.length > 0 ? { name: sortedCabang[0][0], ...sortedCabang[0][1] } : null;
    const ratio = totalSales > 0 ? ((totalOutstanding / totalSales) * 100).toFixed(1) : "N/A";

    return {
      totalSales,
      totalOutstanding,
      topCabang,
      ratio,
      salesCols,
      outstandingCols,
      totalRows: filtered.length
    };
  }, [parsed, filtered, colCabang]);

  const displayedChartColumns = useMemo(() => {
    if (!parsed) return [];
    if (!executiveSummary || chartFilter === 'all') return parsed.targetColumns;
    const targetSet = new Set(chartFilter === 'sales' ? executiveSummary.salesCols : executiveSummary.outstandingCols);
    return parsed.targetColumns.filter(tc => targetSet.has(tc.name));
  }, [parsed, executiveSummary, chartFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <TrendingUp className="w-8 h-8 text-primary" />
          History Sales & Outstanding
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Dashboard dari sheet Data Compile. Menganalisa metrik otomatis seperti Sales, Outstanding, dll.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6 mb-8 items-stretch">
        <div className="md:col-span-2">
          <GlassCard className="h-full bg-muted/30 flex flex-col justify-center">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-5 h-5 text-primary" /> Executive Insights
            </h3>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-3">
              <li><strong>Pencapaian Kinerja (Sales Performance):</strong> Visualisasi ini mempermudah evaluasi tren <em>AVG Sales</em> historis terhadap pencapaian target penjualan tiap kuartal secara instan.</li>
              <li><strong>Fokus Kategori & Insentif:</strong> Pantau kategori produk yang berkontribusi paling tinggi vs terendah. Data ini krusial untuk mengevaluasi efektivitas <em>Category Insentif</em> dalam memotivasi penjualan di masing-masing Cabang (Kota).</li>
            </ul>
          </GlassCard>
        </div>
        <div className="md:col-span-1 flex flex-col">
          <GlassCard className="h-full flex items-center justify-center p-3">
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv="Cabang,Region,Item,NAMA BARANG,CATEGORY,GRUP,CATEGORY ITEM,Sub item,STATUS DOI,SOH,Sales Agus,Sales Sept,Sales Okt,Sales Nov,Sales Des,Sales Januari,Sales Februari,Sales Maret,Sales April,Sales Mei,Sales Juni,Sales Juli,AVG Sales 3 Bln,On Vessel,Hold Delivery,SPJM,Load,Plan Loading,Ready,TO,Category Insentif"
              templateName="history_sales_template.csv"
              label="Upload Data History Sales (Sheet: Data Compile)"
              description="Upload CSV hasil export (sistem otomatis membaca kolom metrik tanpa perlu tanda X)."
            />
          </GlassCard>
        </div>
      </div>

      {parsed && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters */}
          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-start mb-6 gap-4 border-b border-border pb-6">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">Filter Dashboard</h3>
                  <TimestampBadge timestamp={parsed.processed_at || new Date().toISOString()} />
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  {colCabang && <MultiSelect options={cabangs} selected={selectedCabang} onChange={setSelectedCabang} selectAllLabel="Semua Cabang" />}
                  {colCategory && <MultiSelect options={categories} selected={selectedCategory} onChange={setSelectedCategory} selectAllLabel="Semua Kategori" />}
                </div>
              </div>
              <div className="flex gap-3 shrink-0 mt-4 md:mt-0">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm flex items-center gap-2 font-medium">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>

            {/* Dynamic KPIs */}
            <div className="grid md:grid-cols-4 gap-4 mt-6">
              {kpis.map((kpi, idx) => (
                <KPICard 
                  key={idx} 
                  title={`Total ${kpi.name}`} 
                  value={kpi.total.toLocaleString('id-ID')} 
                  icon={<DollarSign />} 
                />
              ))}
              <KPICard title="Total Rows" value={filtered.length.toLocaleString()} icon={<BarChart3 />} />
            </div>
          </GlassCard>

          {/* ═══ EXECUTIVE SUMMARY BANNER & KPI INSIGHTS ═══ */}
          {executiveSummary && (
            <div className="space-y-6">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-card via-card/95 to-card border border-primary/40 p-6 sm:p-8 shadow-2xl text-foreground">
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-gradient-to-bl from-primary/20 via-sky-500/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-border/80">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-black uppercase tracking-wider mb-3 border border-primary/30 shadow-xs">
                      <Sparkles className="w-3.5 h-3.5" /> Executive Summary & Analytics
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground uppercase">
                      Ringkasan <span className="text-primary">Performa & Outstanding</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">
                      Intisari analitis tingkat tinggi untuk percepat pemantauan suplai barang dan pencapaian target penjualan cabang.
                    </p>
                  </div>

                  {executiveSummary.topCabang && (
                    <div className="bg-background/80 backdrop-blur border border-amber-500/40 rounded-xl p-4 shrink-0 flex items-center gap-4 shadow-md max-w-sm w-full md:w-auto">
                      <div className="p-3 bg-amber-500/15 text-amber-500 rounded-xl border border-amber-500/30">
                        <Award className="w-7 h-7 animate-pulse" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">Cabang Dominan (Terbesar)</span>
                        <h3 className="text-lg font-black text-foreground font-mono">{executiveSummary.topCabang.name}</h3>
                        <p className="text-[11px] text-muted-foreground font-medium">
                          Kontribusi: <b>{executiveSummary.topCabang.total.toLocaleString('id-ID')}</b> unit
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                  <div className="p-5 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs">
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-muted-foreground font-extrabold uppercase tracking-wider">Total Volume Sales</span>
                      <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
                    </div>
                    <div className="mt-4">
                      <span className="text-2xl sm:text-3xl font-black text-emerald-500 font-mono">
                        {executiveSummary.totalSales.toLocaleString('id-ID')}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1 font-medium">Akumulasi seluruh kolom penjualan</p>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs">
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-muted-foreground font-extrabold uppercase tracking-wider">Total Outstanding & SOH</span>
                      <AlertCircle className="w-5 h-5 text-sky-500 shrink-0" />
                    </div>
                    <div className="mt-4">
                      <span className="text-2xl sm:text-3xl font-black text-sky-500 font-mono">
                        {executiveSummary.totalOutstanding.toLocaleString('id-ID')}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1 font-medium">Akumulasi SOH, Vessel, TO, & Plan Loading</p>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs">
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-muted-foreground font-extrabold uppercase tracking-wider">Rasio Stok vs Sales</span>
                      <CheckCircle2 className="w-5 h-5 text-purple-500 shrink-0" />
                    </div>
                    <div className="mt-4">
                      <span className="text-2xl sm:text-3xl font-black text-purple-500 font-mono">
                        {executiveSummary.ratio}%
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1 font-medium">Proporsi persediaan berbanding volume sales</p>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs">
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-muted-foreground font-extrabold uppercase tracking-wider">Total Baris Aktif</span>
                      <BarChart3 className="w-5 h-5 text-amber-500 shrink-0" />
                    </div>
                    <div className="mt-4">
                      <span className="text-2xl sm:text-3xl font-black text-foreground font-mono">
                        {executiveSummary.totalRows.toLocaleString('id-ID')}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-1 font-medium">Jumlah SKU / rekor sesuai filter</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3.5 shadow-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-ping shrink-0" />
                  <p className="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                    <b>💡 Rekomendasi Strategis Eksekutif:</b> Cabang <span className="text-primary font-extrabold underline">{executiveSummary.topCabang?.name || "Utama"}</span> memiliki volume aktivitas terpadat. Disarankan memantau ketat pergerakan TO dan bongkar muat On Vessel di cabang ini agar suplai barang tidak mengalami bottleneck dan target sales tercapai maksimal.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Bar Chart per Cabang */}
          <GlassCard>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Summary Metrik per Cabang
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Visualisasi komparasi metrik di tiap kantor cabang secara terpusat.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 bg-muted/50 p-1.5 rounded-xl border border-border shrink-0">
                <button
                  onClick={() => setChartFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartFilter === 'all' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Semua Metrik
                </button>
                <button
                  onClick={() => setChartFilter('sales')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartFilter === 'sales' ? 'bg-emerald-600 text-white shadow-md' : 'text-muted-foreground hover:text-emerald-500'
                  }`}
                >
                  📈 Fokus Sales
                </button>
                <button
                  onClick={() => setChartFilter('outstanding')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartFilter === 'outstanding' ? 'bg-sky-600 text-white shadow-md' : 'text-muted-foreground hover:text-sky-500'
                  }`}
                >
                  📦 Fokus Outstanding & SOH
                </button>
              </div>
            </div>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))', borderRadius: '8px' }} />
                  <Legend verticalAlign="top" height={36} />
                  {displayedChartColumns.map((tc, idx) => (
                    <Bar key={tc.name} dataKey={tc.name} fill={DISTINCT_PALETTE[idx % DISTINCT_PALETTE.length]} radius={[3, 3, 0, 0]} maxBarSize={35} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Full Data Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-primary" /> Data Detail (Semua Kolom)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                  <tr>
                    {parsed.headers.map(h => (
                      <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      {parsed.headers.map(h => (
                        <td key={h} className="px-4 py-3 whitespace-nowrap">
                          {typeof row[h] === 'number' ? row[h].toLocaleString('id-ID') : (row[h] || '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 50 && (
              <p className="text-xs text-muted-foreground mt-4 italic">
                Menampilkan 50 baris pertama dari {filtered.length} baris...
              </p>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
