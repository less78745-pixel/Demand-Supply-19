"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { ClipboardList, Download, Info, Package, BarChart3, Table as TableIcon, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899'];

const DISTINCT_PALETTE = [
  '#10B981', '#3B82F6', '#F97316', '#A855F7', '#06B6D4', '#EC4899', '#EAB308', '#EF4444', 
  '#84CC16', '#6366F1', '#14B8A6', '#D97706', '#8B5CF6', '#F43F5E', '#0EA5E9', '#1E40AF', 
  '#991B1B', '#065F46', '#4C1D95', '#854D0E', '#34D399', '#FBBF24', '#F87171', '#60A5FA', 
  '#C084FC', '#2DD4BF', '#F472B6', '#A3E635', '#38BDF8', '#FB923C'
];

const getPillarCategory = (colName: string): 'On Hand' | 'VESSEL' | 'TO' | 'PLAN LOADING' | 'READY' | 'Lainnya' => {
  const lower = colName.toLowerCase().trim();
  if (lower.includes('on hand') || lower === 'soh' || lower.includes('stock on hand')) return 'On Hand';
  if (lower.includes('vessel') || lower.includes('kapal') || lower.includes('on vessel')) return 'VESSEL';
  if (lower.includes('to ') || lower.startsWith('to') || lower.includes('transfer order')) return 'TO';
  if (lower.includes('plan loading') || lower.includes('loading') || lower.includes('load')) return 'PLAN LOADING';
  if (lower.includes('ready')) return 'READY';
  return 'Lainnya';
};

const PILLAR_COLORS: Record<string, string> = {
  'On Hand': '#10b981',      // Emerald Green
  'VESSEL': '#3b82f6',       // Blue
  'TO': '#f97316',           // Orange
  'PLAN LOADING': '#a855f7', // Purple
  'READY': '#06b6d4',        // Cyan
  'Lainnya': '#64748b'       // Slate Gray
};

const PILLAR_ORDER = ['On Hand', 'VESSEL', 'TO', 'PLAN LOADING', 'READY'];

export default function SOHAnalysisPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartMode, setChartMode] = useState<'summary' | 'stock' | 'to' | 'vessel' | 'all_detail'>('summary');
  const [expandedPivot, setExpandedPivot] = useState(false);
  
  useEffect(() => {
    get('last_soh_data').then(saved => {
      if (saved) setParsed(saved);
    }).catch(err => console.warn('Failed to load SOH state from IndexDB', err));
  }, []);

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedInsentif, setSelectedInsentif] = useState<string[]>(['All']);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca data SOH & TO...', { id: 'soh' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      
      if (parsedData && parsedData.targetColumns) {
        setSelectedMetrics(['All']);
      }
      
      try {
        await set('last_soh_data', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('Data SOH berhasil di-load!', { id: 'soh' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'soh' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['cabang', 'branch_name', 'branch', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'category', 'kategori item', 'kategori']) : undefined, [parsed]);
  const colInsentif = useMemo(() => parsed ? findColumn(parsed.headers, ['insentif', 'kategori insentif']) : undefined, [parsed]);

  // Filter options
  const cabangs = useMemo(() => parsed && colCabang ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()] : [], [parsed, colCabang]);
  const categories = useMemo(() => parsed && colCategory ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()] : [], [parsed, colCategory]);
  const insentifs = useMemo(() => parsed && colInsentif ? ['All', ...Array.from(new Set(parsed.data.map(d => d[colInsentif]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua insentif'))).sort()] : [], [parsed, colInsentif]);
  
  const metricOptions = useMemo(() => parsed ? ['All', ...parsed.targetColumns.map(t => t.name)] : [], [parsed]);

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
    
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'soh_to_pivot_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Data
  const filtered = useMemo(() => {
    if (!parsed) return [];
    return parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colInsentif || selectedInsentif.includes('All') || selectedInsentif.includes(d[colInsentif]))
    );
  }, [parsed, selectedCabang, selectedCategory, selectedInsentif, colCabang, colCategory, colInsentif]);

  // Pillar mapping
  const pillarColumnsMap = useMemo(() => {
    if (!parsed) return { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'READY': [], 'Lainnya': [] };
    const map: Record<string, string[]> = { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'READY': [], 'Lainnya': [] };
    parsed.targetColumns.forEach(tc => {
      const cat = getPillarCategory(tc.name);
      map[cat].push(tc.name);
    });
    return map;
  }, [parsed]);

  // Grouped Pivot Data per Cabang
  const pivotData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (!map[cbg]) {
        map[cbg] = { cabang: cbg, 'On Hand': 0, 'VESSEL': 0, 'TO': 0, 'PLAN LOADING': 0, 'READY': 0, 'Lainnya': 0, total: 0, details: {} };
        parsed.targetColumns.forEach(tc => { map[cbg].details[tc.name] = 0; });
      }
      parsed.targetColumns.forEach(tc => {
        const val = row[tc.name] || 0;
        const cat = getPillarCategory(tc.name);
        map[cbg][cat] += val;
        map[cbg].details[tc.name] += val;
        if (cat !== 'Lainnya') {
          map[cbg].total += val;
        }
      });
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [parsed, filtered, colCabang]);

  // Pillar KPIs
  const pillarKpis = useMemo(() => {
    if (!pivotData || pivotData.length === 0) return [];
    return PILLAR_ORDER.map(pillar => {
      const total = pivotData.reduce((a, r) => a + (r[pillar] || 0), 0);
      const cols = pillarColumnsMap[pillar]?.length || 0;
      return { name: pillar, total, cols, color: PILLAR_COLORS[pillar] };
    });
  }, [pivotData, pillarColumnsMap]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <ClipboardList className="w-8 h-8 text-primary" />
            SOH & TO Analysis (Pivot Mode)
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Analisis persediaan terstruktur berdasarkan 5 pilar utama: On Hand ➔ Vessel ➔ TO ➔ Plan Loading ➔ Ready.
          </p>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-6 mb-8 items-stretch">
        <div className="md:col-span-2">
          <GlassCard className="h-full bg-muted/30 flex flex-col justify-center">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-5 h-5 text-primary" /> Executive Insights
            </h3>
            <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-3">
              <li><strong>Struktur 5 Pilar:</strong> Data kini dikelompokkan dari persediaan fisik (<em>On Hand</em>) hingga pasokan dalam perjalanan (<em>Vessel</em>, <em>TO</em>, <em>Plan Loading</em>, <em>Ready</em>).</li>
              <li><strong>Monitoring Inbound:</strong> Klik tombol detail mingguan pada tabel pivot untuk melihat distribusi pasokan antar minggu tanpa mengaburkan ringkasannya.</li>
            </ul>
          </GlassCard>
        </div>
        <div className="md:col-span-1 flex flex-col">
          <GlassCard className="h-full flex items-center justify-center p-3">
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv="Cabang,Grup,On Hand,TO WEEK 1 JULI,TO WEEK 2 JULI,TO WEEK 3 JULI,TO WEEK 4 JULI,TO WEEK 5 JULI,VESSEL WEEK 2 JULI,VESSEL WEEK 3 JULI,VESSEL WEEK 4 JULI,VESSEL WEEK 5 JULI,VESSEL WEEK 1 AGT,VESSEL WEEK 2 AGT,PLAN LOADING,READY"
              templateName="soh_template.csv"
              label="Upload Data SOH (Sheet: On Hand)"
              description="Upload CSV hasil export dari Google Sheet. Sistem otomatis memetakan kolom mingguan (Weeks) ke 5 grup pivot SOH & TO."
            />
          </GlassCard>
        </div>
      </div>

      {parsed && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Filters & Header */}
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
                  {colInsentif && <MultiSelect options={insentifs} selected={selectedInsentif} onChange={setSelectedInsentif} selectAllLabel="Semua Insentif" />}
                </div>
              </div>
              <div className="flex gap-3 shrink-0 mt-4 md:mt-0">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm flex items-center gap-2 font-medium">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>

            {/* Dynamic Pillar KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6">
              {pillarKpis.map((kpi, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-background/60 border border-border flex flex-col justify-between" style={{ borderLeft: `4px solid ${kpi.color}` }}>
                  <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">{idx + 1}. {kpi.name}</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-lg font-mono font-black text-foreground">{kpi.total.toLocaleString('id-ID')}</span>
                    <span className="text-[10px] text-muted-foreground">{kpi.cols} kol</span>
                  </div>
                </div>
              ))}
              <KPICard title="Total Baris" value={filtered.length.toLocaleString('id-ID')} icon={<BarChart3 />} />
            </div>
          </GlassCard>

          {/* Structured Pivot Bar Chart per Cabang */}
          <GlassCard>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Grafik Pivot per Cabang
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Menampilkan perbandingan 5 pilar inbound (On Hand, Vessel, TO, Plan Loading, Ready) di tiap cabang.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 bg-muted/50 p-1.5 rounded-xl border border-border shrink-0">
                <button
                  onClick={() => setChartMode('summary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartMode === 'summary' ? 'bg-primary text-primary-foreground shadow-md scale-105' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> 5 Pilar Utama
                </button>
                <button
                  onClick={() => setChartMode('stock')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartMode === 'stock' ? 'bg-emerald-600 text-white shadow-md scale-105' : 'text-muted-foreground hover:text-emerald-500'
                  }`}
                >
                  📦 On Hand & Produksi
                </button>
                <button
                  onClick={() => setChartMode('to')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartMode === 'to' ? 'bg-orange-600 text-white shadow-md scale-105' : 'text-muted-foreground hover:text-orange-500'
                  }`}
                >
                  🚚 Transfer Order (TO)
                </button>
                <button
                  onClick={() => setChartMode('vessel')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartMode === 'vessel' ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-muted-foreground hover:text-blue-500'
                  }`}
                >
                  🚢 On Vessel
                </button>
                <button
                  onClick={() => setChartMode('all_detail')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    chartMode === 'all_detail' ? 'bg-purple-600 text-white shadow-md scale-105' : 'text-muted-foreground hover:text-purple-500'
                  }`}
                >
                  🌟 Semua Detail Week
                </button>
              </div>
            </div>

            <div className="h-[450px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pivotData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))', borderRadius: '8px' }} />
                  <Legend verticalAlign="top" height={36} />
                  {chartMode === 'summary' ? (
                    PILLAR_ORDER.map((pillar, idx) => (
                      <Bar key={pillar} dataKey={pillar} name={`${idx + 1}. ${pillar}`} fill={PILLAR_COLORS[pillar]} radius={[3, 3, 0, 0]} maxBarSize={45} />
                    ))
                  ) : (
                    (() => {
                      const activePillars = 
                        chartMode === 'stock' ? ['On Hand', 'PLAN LOADING', 'READY'] :
                        chartMode === 'to' ? ['TO'] :
                        chartMode === 'vessel' ? ['VESSEL'] :
                        PILLAR_ORDER;

                      let globalColorIndex = 0;
                      return activePillars.flatMap((pillar) => (pillarColumnsMap[pillar] || []).map((colName) => {
                        const assignedColor = DISTINCT_PALETTE[globalColorIndex % DISTINCT_PALETTE.length];
                        globalColorIndex++;
                        return (
                          <Bar
                            key={colName}
                            dataKey={`details.${colName}`}
                            name={`[${pillar}] ${colName.replace(/to |vessel |on hand |plan loading |ready /gi, '').trim() || colName}`}
                            fill={assignedColor}
                            radius={[3, 3, 0, 0]}
                            maxBarSize={30}
                          />
                        );
                      }));
                    })()
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Interactive Pivot Table */}
          <GlassCard>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
                  <TableIcon className="w-5 h-5 text-primary" />
                  Tabel Pivot Analisis SOH & TO per Cabang
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dikelompokkan secara teratur berdasarkan urutan rantai pasok inbound.
                </p>
              </div>
              <button
                onClick={() => setExpandedPivot(!expandedPivot)}
                className="px-3.5 py-1.5 bg-muted/60 hover:bg-muted text-foreground rounded-md text-xs font-bold uppercase tracking-wider transition-colors border border-border flex items-center gap-2 shrink-0 shadow-xs"
              >
                <Layers className="w-3.5 h-3.5 text-primary" />
                {expandedPivot ? 'Sembunyikan Sub-Kolom (Weeks)' : 'Tampilkan Sub-Kolom (Weeks)'}
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-muted/80 text-muted-foreground uppercase tracking-wider border-b border-border">
                    <th className="px-4 py-3.5 font-black text-foreground sticky left-0 bg-muted z-10 min-w-[160px]">
                      Cabang
                    </th>
                    {PILLAR_ORDER.map((pillar, pIdx) => {
                      const cols = pillarColumnsMap[pillar] || [];
                      const showSubs = expandedPivot && cols.length > 1;
                      return (
                        <th
                          key={pillar}
                          colSpan={showSubs ? cols.length + 1 : 1}
                          className="px-4 py-3.5 text-center border-x border-border/60 font-black tracking-wide"
                          style={{ color: PILLAR_COLORS[pillar], backgroundColor: `${PILLAR_COLORS[pillar]}15` }}
                        >
                          {pIdx + 1}. {pillar} {cols.length > 1 && !showSubs ? `(${cols.length} W)` : ''}
                        </th>
                      );
                    })}
                    <th className="px-4 py-3.5 text-right font-black text-foreground bg-primary/15 min-w-[120px]">
                      Total Inbound
                    </th>
                  </tr>
                  {expandedPivot && (
                    <tr className="bg-muted/40 text-muted-foreground border-b border-border text-[11px] font-bold">
                      <th className="px-4 py-2 sticky left-0 bg-muted/90 z-10 text-foreground">Sub-kolom / Minggu</th>
                      {PILLAR_ORDER.map(pillar => {
                        const cols = pillarColumnsMap[pillar] || [];
                        const showSubs = cols.length > 1;
                        if (!showSubs) {
                          return (
                            <th key={pillar} className="px-3 py-2 text-center text-foreground font-bold border-x border-border/40">
                              Total
                            </th>
                          );
                        }
                        return (
                          <React.Fragment key={pillar}>
                            <th className="px-3 py-2 text-right font-extrabold text-foreground bg-muted/40 border-l border-border/60" style={{ color: PILLAR_COLORS[pillar] }}>
                              TOTAL
                            </th>
                            {cols.map(c => (
                              <th key={c} className="px-2.5 py-2 text-right text-muted-foreground border-r border-border/30 truncate max-w-[120px]" title={c}>
                                {c.replace(/to |vessel |week |w /gi, 'W').trim()}
                              </th>
                            ))}
                          </React.Fragment>
                        );
                      })}
                      <th className="px-4 py-2 bg-primary/10"></th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-border/50 font-mono text-xs">
                  {pivotData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-sans font-bold text-foreground sticky left-0 bg-background/95 z-10 truncate border-r border-border/20">
                        {row.cabang}
                      </td>
                      {PILLAR_ORDER.map(pillar => {
                        const cols = pillarColumnsMap[pillar] || [];
                        const showSubs = expandedPivot && cols.length > 1;
                        const totalVal = row[pillar] || 0;
                        if (!showSubs) {
                          return (
                            <td key={pillar} className="px-4 py-3 text-right font-semibold border-x border-border/40 text-foreground">
                              {totalVal > 0 ? totalVal.toLocaleString('id-ID') : '-'}
                            </td>
                          );
                        }
                        return (
                          <React.Fragment key={pillar}>
                            <td className="px-3 py-2.5 text-right font-bold text-foreground bg-muted/20 border-l border-border/50" style={{ color: PILLAR_COLORS[pillar] }}>
                              {totalVal > 0 ? totalVal.toLocaleString('id-ID') : '-'}
                            </td>
                            {cols.map(c => {
                              const v = row.details[c] || 0;
                              return (
                                <td key={c} className="px-2.5 py-2.5 text-right text-muted-foreground border-r border-border/20">
                                  {v > 0 ? v.toLocaleString('id-ID') : '-'}
                                </td>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      <td className="px-4 py-3 text-right font-extrabold text-primary bg-primary/10">
                        {row.total > 0 ? row.total.toLocaleString('id-ID') : '-'}
                      </td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="bg-muted/80 font-bold border-t-2 border-border text-foreground">
                    <td className="px-4 py-3.5 font-sans font-black sticky left-0 bg-muted z-10 text-sm">
                      TOTAL KESELURUHAN
                    </td>
                    {PILLAR_ORDER.map(pillar => {
                      const cols = pillarColumnsMap[pillar] || [];
                      const showSubs = expandedPivot && cols.length > 1;
                      const pillarSum = pivotData.reduce((a, r) => a + (r[pillar] || 0), 0);
                      if (!showSubs) {
                        return (
                          <td key={pillar} className="px-4 py-3.5 text-right font-black border-x border-border/60 text-sm" style={{ color: PILLAR_COLORS[pillar] }}>
                            {pillarSum > 0 ? pillarSum.toLocaleString('id-ID') : '-'}
                          </td>
                        );
                      }
                      return (
                        <React.Fragment key={pillar}>
                          <td className="px-3 py-3.5 text-right font-black bg-muted/50 border-l border-border/60 text-sm" style={{ color: PILLAR_COLORS[pillar] }}>
                            {pillarSum > 0 ? pillarSum.toLocaleString('id-ID') : '-'}
                          </td>
                          {cols.map(c => {
                            const colSum = pivotData.reduce((a, r) => a + (r.details[c] || 0), 0);
                            return (
                              <td key={c} className="px-2.5 py-3.5 text-right text-muted-foreground border-r border-border/30 font-bold">
                                {colSum > 0 ? colSum.toLocaleString('id-ID') : '-'}
                              </td>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                    <td className="px-4 py-3.5 text-right font-black text-primary bg-primary/20 text-sm">
                      {pivotData.reduce((a, r) => a + r.total, 0).toLocaleString('id-ID')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Full Raw Data Table (Collapsible/Preview) */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-muted-foreground" /> Data Mentah SOH (Semua Kolom CSV)
            </h3>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] uppercase bg-muted/70 text-muted-foreground sticky top-0 z-10">
                  <tr>
                    {parsed.headers.map(h => (
                      <th key={h} className="px-3 py-2.5 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {filtered.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      {parsed.headers.map(h => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap">
                          {typeof row[h] === 'number' ? row[h].toLocaleString('id-ID') : (row[h] || '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 50 && (
              <p className="text-xs text-muted-foreground mt-3 italic">
                * Menampilkan 50 baris pertama dari total {filtered.length.toLocaleString('id-ID')} baris...
              </p>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}

