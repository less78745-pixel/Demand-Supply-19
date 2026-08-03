/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  TrendingUp, Info, DollarSign, BarChart3, Download, Sparkles,
  CheckCircle2, AlertCircle, Award, Layers, HelpCircle, FileSpreadsheet, Zap, AlertTriangle, ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899'];

type ScenarioType = 'actual' | 'growth' | 'rebound';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Evaluasi Aktual Sales (Historical Base)',
    desc: 'Pemantauan pencapaian volume penjualan riil dan rasio pesanan tertunggak (outstanding) secara aktual.',
    color: 'from-blue-600 to-indigo-500',
    icon: BarChart3,
    multiplier: 1.0
  },
  {
    id: 'growth' as ScenarioType,
    title: 'Jalur 2: Simulasi Target Growth (+15% Demand)',
    desc: 'Proyeksi peningkatan permintaan kuartal depan untuk perencanaan cadangan pasokan pabrik dan alokasi gudang.',
    color: 'from-emerald-600 to-teal-500',
    icon: TrendingUp,
    multiplier: 1.15
  },
  {
    id: 'rebound' as ScenarioType,
    title: 'Jalur 3: Koreksi Musim Basah / Rebound (-10%)',
    desc: 'Evaluasi risiko akumulasi outstanding pada masa penurunan permintaan seasonal agar terhindar dari overstock.',
    color: 'from-amber-600 to-orange-500',
    icon: Zap,
    multiplier: 0.90
  }
];

function generateDemoHistorySales(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const categories = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const data: any[] = [];

  cabangs.forEach(cab => {
    categories.forEach(cat => {
      const salesMei = Math.round(1800 + Math.random() * 5000);
      const salesJuni = Math.round(2000 + Math.random() * 5200);
      const salesJuli = Math.round(2200 + Math.random() * 5500);
      const avgSales = Math.round((salesMei + salesJuni + salesJuli) / 3);
      const outstanding = Math.round(300 + Math.random() * 1200);
      
      data.push({
        Cabang: cab,
        Grup: cat,
        'Sales Mei': salesMei,
        'Sales Juni': salesJuni,
        'Sales Juli': salesJuli,
        'AVG Sales 3 Bln': avgSales,
        'Outstanding Order': outstanding
      });
    });
  });

  return {
    headers: ['Cabang', 'Grup', 'Sales Mei', 'Sales Juni', 'Sales Juli', 'AVG Sales 3 Bln', 'Outstanding Order'],
    targetColumns: [
      { index: 2, name: 'Sales Mei' },
      { index: 3, name: 'Sales Juni' },
      { index: 4, name: 'Sales Juli' },
      { index: 5, name: 'AVG Sales 3 Bln' },
      { index: 6, name: 'Outstanding Order' }
    ],
    data,
    processed_at: new Date().toISOString()
  };
}

export default function HistorySalesPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartFilter, setChartFilter] = useState<'all' | 'sales' | 'outstanding'>('all');
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('actual');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);

  useEffect(() => {
    get('last_history_sales').then(saved => {
      if (saved && saved.data && saved.data.length > 0) {
        setParsed(saved);
      } else {
        setParsed(generateDemoHistorySales());
      }
    }).catch(err => {
      console.warn('Failed to load History Sales state from IndexDB', err);
      setParsed(generateDemoHistorySales());
    });
  }, []);

  const handleGenerateDemo = () => {
    const demo = generateDemoHistorySales();
    setParsed(demo);
    toast.success('🎉 Data Demo History Sales Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const headers = 'Cabang,Grup,Sales Mei,Sales Juni,Sales Juli,AVG Sales 3 Bln,Outstanding Order';
    const row1 = 'Surabaya,Minyak Goreng Premium,4500,4800,5100,4800,600';
    const row2 = 'Jakarta,Beras Setra Ramos,3200,3400,3600,3400,450';
    const blob = new Blob(['\ufeff' + headers + '\n' + row1 + '\n' + row2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_history_sales.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📁 Template CSV History Sales Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca data History Sales (Excel/CSV)...', { id: 'sales' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      try {
        await set('last_history_sales', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data History Sales Berhasil Diproses!', { id: 'sales' });
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

  // Filtered Data with Scenario Multiplier applied
  const filtered = useMemo(() => {
    if (!parsed) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    return parsed.data
      .filter(d =>
        (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory]))
      )
      .map(row => {
        const copy = { ...row };
        parsed.targetColumns.forEach(tc => {
          copy[tc.name] = Math.round((row[tc.name] || 0) * sc.multiplier);
        });
        return copy;
      });
  }, [parsed, selectedCabang, selectedCategory, colCabang, colCategory, activeScenario]);

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
    const ratioNum = totalSales > 0 ? ((totalOutstanding / totalSales) * 100) : 0;
    const ratio = totalSales > 0 ? ratioNum.toFixed(1) + "%" : "N/A";

    return {
      totalSales,
      totalOutstanding,
      topCabang,
      ratio,
      ratioNum,
      salesCols,
      outstandingCols,
      cabangVol,
      totalRows: filtered.length
    };
  }, [parsed, filtered, colCabang]);

  // Chart data: Grouped by Cabang
  const chartData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};
    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      if (!map[cbg]) {
        map[cbg] = { cabang: cbg };
        parsed.targetColumns.forEach(tc => map[cbg][tc.name] = 0);
      }
      parsed.targetColumns.forEach(tc => {
        map[cbg][tc.name] += (row[tc.name] || 0);
      });
    }
    return Object.values(map);
  }, [parsed, filtered, colCabang, selectedCabangForChart]);

  const displayedChartColumns = useMemo(() => {
    if (!parsed) return [];
    if (!executiveSummary || chartFilter === 'all') return parsed.targetColumns;
    const targetSet = new Set(chartFilter === 'sales' ? executiveSummary.salesCols : executiveSummary.outstandingCols);
    return parsed.targetColumns.filter(tc => targetSet.has(tc.name));
  }, [parsed, executiveSummary, chartFilter]);

  // Table Data grouped per Cabang for cleaner comparison & zonasi
  const tableData = useMemo(() => {
    if (!executiveSummary) return [];
    return Object.entries(executiveSummary.cabangVol).map(([cabang, vals]) => {
      const ratio = vals.sales > 0 ? (vals.outstanding / vals.sales) * 100 : 0;
      return {
        cabang,
        sales: vals.sales,
        outstanding: vals.outstanding,
        total: vals.total,
        ratio
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [executiveSummary]);

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
    link.download = `history_sales_analysis_${activeScenario}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis History Sales Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HERO BANNER HEADER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 sm:p-8 border border-blue-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
              <TrendingUp className="w-3.5 h-3.5" /> Dashboard Data Harian • History Sales
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              History Sales & Outstanding <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-300">(Analytics Engine)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Pemantauan performa penjualan historis terhadap pesanan tertunggak (outstanding). Dilengkapi 3 jalur simulasi growth & koreksi seasonal untuk akurasi pasokan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-blue-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" /> Panduan Upload Data History Sales (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-sky-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">📌 Analisis Sales vs Outstanding:</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Modul ini otomatis mendeteksi kolom metrik berlabel <i>Sales, AVG Sales,</i> atau <i>Jual</i> sebagai Volume Penjualan, dan metrik lainnya sebagai <i>Outstanding Order / Hold Delivery</i>.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">⚙️ Engine Pembacaan Excel (XLSX & CSV):</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Didukung parser XLSX ArrayBuffer, Anda dapat mengunggah file Excel (.xlsx) langsung dari ERP atau Google Sheet tanpa kekhawatiran error karakter binari atau pemisahan desimal yang keliru.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unggah File Data Compile Anda:</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data History Sales (Sheet: Data Compile)"
              description="Drag & drop file Excel/CSV di sini. Sistem otomatis mendeteksi metrik penjualan dan outstanding."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Evaluasi & Proyeksi Sales:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk mengaktifkan simulasi volume permintaan!</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SCENARIOS.map((sc) => {
            const Icon = sc.icon;
            const isSelected = activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => {
                  setActiveScenario(sc.id);
                  toast.success(`Mengaktifkan ${sc.title}`);
                }}
                className={`relative group p-4 sm:p-5 rounded-2xl transition-all duration-300 text-left border overflow-hidden shadow-lg ${
                  isSelected
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-blue-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
                    {sc.title}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-black uppercase tracking-wider">
                      Aktif
                    </span>
                  )}
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS ─── */}
      {executiveSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPICard
            title="Total Volume Sales"
            value={`${executiveSummary.totalSales.toLocaleString('id-ID')} Unit`}
            trend="Akumulasi Penjualan Cabang"
            icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
            className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
          />
          <KPICard
            title="Total Outstanding Order"
            value={`${executiveSummary.totalOutstanding.toLocaleString('id-ID')} Unit`}
            trend="Pesanan Belum Terkirim / Hold"
            icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
            className="border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40 transition"
          />
          <KPICard
            title="Rasio Outstanding / Sales"
            value={executiveSummary.ratio}
            trend={executiveSummary.ratioNum > 25 ? "Rasio Tinggi (>25% Peringatan)" : "Rasio Terkendali (<25%)"}
            isAlert={executiveSummary.ratioNum > 25}
            icon={<AlertTriangle className={`w-5 h-5 ${executiveSummary.ratioNum > 25 ? 'text-rose-400' : 'text-emerald-400'}`} />}
            className={`transition ${executiveSummary.ratioNum > 25 ? 'border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40' : 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40'}`}
          />
          <KPICard
            title="Cabang Kontribusi Tertinggi"
            value={executiveSummary.topCabang ? executiveSummary.topCabang.name : 'N/A'}
            trend={executiveSummary.topCabang ? `${executiveSummary.topCabang.total.toLocaleString('id-ID')} Total Vol` : ''}
            icon={<Award className="w-5 h-5 text-purple-400" />}
            className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
          />
        </div>
      )}

      {/* ─── FILTER CONTROLS & SELECTION ─── */}
      <GlassCard className="p-5 border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Filter Kategori Item:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Sorot Grafik Khusus Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-200 focus:border-blue-500 outline-none transition font-medium"
            >
              <option value="All">📊 Tampilkan Semua Cabang (Gabungan)</option>
              {cabangs.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>📍 Fokus Cabang: {c}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: SALES VS OUTSTANDING ─── */}
      {chartData && chartData.length > 0 && (
        <GlassCard className="p-6 border-blue-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Grafik Komparasi Volume Sales vs Outstanding per Cabang
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 shrink-0">
              <button
                onClick={() => setChartFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'all' ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Semua Metrik
              </button>
              <button
                onClick={() => setChartFilter('sales')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'sales' ? 'bg-emerald-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                📈 Fokus Sales
              </button>
              <button
                onClick={() => setChartFilter('outstanding')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartFilter === 'outstanding' ? 'bg-amber-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                ⚠️ Fokus Outstanding
              </button>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="cabang" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#3b82f6', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                {displayedChartColumns.map((tc, idx) => (
                  <Bar
                    key={tc.name}
                    dataKey={tc.name}
                    fill={COLORS[idx % COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── TABEL COMPLEMENTARY: ANALISIS PERFORMANCE & ZONASI OUTSTANDING ─── */}
      <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" />
              Tabel Analisis Komparatif Sales vs Outstanding ({tableData.length} Cabang)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rincian performa penjualan dengan zonasi status kewaspadaan outstanding secara real-time.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[800px]">
            <thead className="bg-slate-950/90 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang / Wilayah</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-blue-400">📈 Total Volume Sales</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-amber-400">⏳ Outstanding Order</th>
                <th className="py-3.5 px-4 border-l border-slate-800 bg-slate-800 text-white">Total Volume</th>
                <th className="py-3.5 px-4 border-l border-slate-800">Rasio (Out/Sales)</th>
                <th className="py-3.5 px-4 border-l border-slate-800">Zonasi Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center">
              {tableData.map((row) => {
                const isCritical = row.ratio > 30;
                const isWarning = row.ratio > 15 && !isCritical;
                const isPrime = row.ratio <= 15 && row.sales > 5000;

                return (
                  <tr
                    key={row.cabang}
                    className="hover:bg-slate-800/40 transition cursor-pointer font-medium"
                    onClick={() => setSelectedCabangForChart(row.cabang === selectedCabangForChart ? 'All' : row.cabang)}
                  >
                    <td className="py-3.5 px-4 text-left align-middle">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        {row.cabang}
                        {row.cabang === executiveSummary?.topCabang?.name && (
                          <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-bold">🏆 TOP</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Sales & Outstanding Track</div>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 font-extrabold text-blue-400 text-base font-mono">
                      {row.sales.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 font-bold text-amber-400 text-base font-mono">
                      {row.outstanding.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 bg-slate-950/50 font-bold font-mono text-white text-base">
                      {row.total.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 font-mono font-bold text-slate-200">
                      {row.ratio.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider inline-block ${
                        isCritical ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
                        isWarning ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                        isPrime ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' :
                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}>
                        {isCritical ? '🔴 OUTSTANDING KRITIS' : isWarning ? '🟡 WASPADA TUNGGAKAN' : isPrime ? '🔵 PERFORMA PRIMA' : '🟢 STABLE SALES'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
