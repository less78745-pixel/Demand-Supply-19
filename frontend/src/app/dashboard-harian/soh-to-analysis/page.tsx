/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  ClipboardList, Download, Info, Package, BarChart3,
  Layers, HelpCircle, Sparkles, FileSpreadsheet, Zap, AlertTriangle, CheckCircle2, TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4', '#ec4899'];

const getPillarCategory = (colName: string): 'On Hand' | 'VESSEL' | 'TO' | 'PLAN LOADING' | 'Lainnya' => {
  const lower = colName.toLowerCase().trim();
  if (lower.includes('on hand') || lower === 'soh' || lower.includes('stock on hand')) return 'On Hand';
  if (lower.includes('vessel') || lower.includes('kapal') || lower.includes('on vessel')) return 'VESSEL';
  if (lower.includes('to ') || lower.startsWith('to') || lower.includes('transfer order')) return 'TO';
  if (lower.includes('plan loading') || lower.includes('loading') || lower.includes('load')) return 'PLAN LOADING';
  return 'Lainnya';
};

const PILLAR_COLORS: Record<string, string> = {
  'On Hand': '#10b981',      // Emerald Green
  'VESSEL': '#3b82f6',       // Blue
  'TO': '#f97316',           // Orange
  'PLAN LOADING': '#a855f7', // Purple
  'Lainnya': '#64748b'       // Slate Gray
};

const PILLAR_ORDER = ['On Hand', 'VESSEL', 'TO', 'PLAN LOADING'];

type ScenarioType = 'base' | 'fast' | 'buffer';

const SCENARIOS = [
  {
    id: 'base' as ScenarioType,
    title: 'Jalur 1: Evaluasi Stok Current (Base SOH)',
    desc: 'Analisis ketersediaan stok fisik harian terhadap rata-rata pemakaian (ADU) berjalan secara real-time.',
    color: 'from-emerald-600 to-teal-500',
    icon: BarChart3,
    multiplier: 1.0
  },
  {
    id: 'fast' as ScenarioType,
    title: 'Jalur 2: Simulasi Fast-Moving (Turnover 30 Hari)',
    desc: 'Percepatan target perputaran persediaan untuk menekan biaya penyimpanan (Holding Cost) dan optimasi ruang.',
    color: 'from-blue-600 to-cyan-500',
    icon: TrendingUp,
    multiplier: 1.15
  },
  {
    id: 'buffer' as ScenarioType,
    title: 'Jalur 3: Proteksi Buffer Seasonality (+20%)',
    desc: 'Simulasi ketahanan stok terhadap lonjakan permintaan dadakan pada musim puncak (Peak Season / Hari Raya).',
    color: 'from-purple-600 to-indigo-500',
    icon: Zap,
    multiplier: 0.85
  }
];

function generateDemoSOH(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const categories = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const data: any[] = [];

  cabangs.forEach(cab => {
    categories.forEach(cat => {
      const onHand = Math.round(1500 + Math.random() * 4500);
      const to1 = Math.round(100 + Math.random() * 300);
      const to2 = Math.round(150 + Math.random() * 350);
      const to3 = Math.round(120 + Math.random() * 300);
      const to4 = Math.round(180 + Math.random() * 400);
      const v1 = Math.round(200 + Math.random() * 500);
      const v2 = Math.round(180 + Math.random() * 450);
      const v3 = Math.round(220 + Math.random() * 480);
      const v4 = Math.round(150 + Math.random() * 420);
      const planLoading = Math.round(500 + Math.random() * 1200);
      data.push({
        cabang: cab,
        Category: cat,
        'On Hand': onHand,
        'TO Week 1': to1,
        'TO Week 2': to2,
        'TO Week 3': to3,
        'TO Week 4': to4,
        'Vessel Week 1': v1,
        'Vessel Week 2': v2,
        'Vessel Week 3': v3,
        'Vessel Week 4': v4,
        'Plan Loading': planLoading
      });
    });
  });

  return {
    headers: ['cabang', 'Category', 'On Hand', 'TO Week 1', 'TO Week 2', 'TO Week 3', 'TO Week 4', 'Vessel Week 1', 'Vessel Week 2', 'Vessel Week 3', 'Vessel Week 4', 'Plan Loading'],
    targetColumns: [
      { index: 2, name: 'On Hand' },
      { index: 3, name: 'TO Week 1' },
      { index: 4, name: 'TO Week 2' },
      { index: 5, name: 'TO Week 3' },
      { index: 6, name: 'TO Week 4' },
      { index: 7, name: 'Vessel Week 1' },
      { index: 8, name: 'Vessel Week 2' },
      { index: 9, name: 'Vessel Week 3' },
      { index: 10, name: 'Vessel Week 4' },
      { index: 11, name: 'Plan Loading' }
    ],
    data,
    processed_at: new Date().toISOString()
  };
}

export default function SOHAnalysisPage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chartMode, setChartMode] = useState<'weekly' | 'summary' | 'stock' | 'to' | 'vessel'>('weekly');
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('base');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedInsentif, setSelectedInsentif] = useState<string[]>(['All']);

  useEffect(() => {
    get('last_soh_data').then(saved => {
      if (saved && saved.data && saved.data.length > 0) {
        setParsed(saved);
      } else {
        setParsed(generateDemoSOH());
      }
    }).catch(err => {
      console.warn('Failed to load SOH state from IndexDB', err);
      setParsed(generateDemoSOH());
    });
  }, []);

  const handleGenerateDemo = () => {
    const demo = generateDemoSOH();
    setParsed(demo);
    toast.success('🎉 Data Demo SOH-TO-Vessel Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const headers = 'cabang,Category,On Hand,TO Week 1,TO Week 2,TO Week 3,TO Week 4,Vessel Week 1,Vessel Week 2,Vessel Week 3,Vessel Week 4,Plan Loading';
    const row1 = 'Surabaya,Minyak Goreng Premium,4500,250,300,280,320,500,450,480,520,900';
    const row2 = 'Jakarta,Beras Setra Ramos,2800,200,220,210,230,400,380,410,390,1100';
    const blob = new Blob(['\ufeff' + headers + '\n' + row1 + '\n' + row2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_soh_to_vessel.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📁 Template CSV SOH-TO-Vessel Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca file SOH & TO (Excel/CSV)...', { id: 'soh' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      try {
        await set('last_soh_data', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data SOH & TO Berhasil Diproses!', { id: 'soh' });
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

  // Filtered Data with Scenario Multiplier applied to numerical metrics
  const filtered = useMemo(() => {
    if (!parsed) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    return parsed.data
      .filter(d =>
        (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
        (!colInsentif || selectedInsentif.includes('All') || selectedInsentif.includes(d[colInsentif]))
      )
      .map(row => {
        const copy = { ...row };
        parsed.targetColumns.forEach(tc => {
          copy[tc.name] = Math.round((row[tc.name] || 0) * sc.multiplier);
        });
        return copy;
      });
  }, [parsed, selectedCabang, selectedCategory, selectedInsentif, colCabang, colCategory, colInsentif, activeScenario]);

  // Pillar mapping
  const pillarColumnsMap = useMemo(() => {
    if (!parsed) return { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'Lainnya': [] };
    const map: Record<string, string[]> = { 'On Hand': [], 'VESSEL': [], 'TO': [], 'PLAN LOADING': [], 'Lainnya': [] };
    parsed.targetColumns.forEach(tc => {
      const cat = getPillarCategory(tc.name);
      if (map[cat]) map[cat].push(tc.name);
    });
    return map;
  }, [parsed]);

  // Grouped Pivot Data per Cabang
  const pivotData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      if (!map[cbg]) {
        map[cbg] = { cabang: cbg, 'On Hand': 0, 'VESSEL': 0, 'TO': 0, 'PLAN LOADING': 0, 'Lainnya': 0, total: 0, details: {} };
        parsed.targetColumns.forEach(tc => { map[cbg].details[tc.name] = 0; });
      }
      parsed.targetColumns.forEach(tc => {
        const val = Math.round(Number(row[tc.name]) || 0);
        const cat = getPillarCategory(tc.name);
        if (map[cbg][cat] !== undefined) {
          map[cbg][cat] += val;
        }
        map[cbg].details[tc.name] += val;
        if (cat !== 'Lainnya') {
          map[cbg].total += val;
        }
      });
    }
    return Object.values(map).map(item => {
      item['On Hand'] = Math.round(item['On Hand']);
      item['VESSEL'] = Math.round(item['VESSEL']);
      item['TO'] = Math.round(item['TO']);
      item['PLAN LOADING'] = Math.round(item['PLAN LOADING']);
      item.total = Math.round(item.total);
      return item;
    }).sort((a, b) => b.total - a.total);
  }, [parsed, filtered, colCabang, selectedCabangForChart]);

  // Weekly Grouped Data for Bar Chart (Trend TO vs Vessel W1-W4)
  const weeklyGroupedData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const weeks = [1, 2, 3, 4];
    return weeks.map(w => {
      let totalTO = 0;
      let totalVessel = 0;
      for (const row of filtered) {
        const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
        if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;
        
        parsed.targetColumns.forEach(tc => {
          const name = tc.name.toLowerCase();
          if (name.includes(`week ${w}`) || name.endsWith(`w${w}`) || name.includes(`wk ${w}`) || name.includes(`minggu ${w}`)) {
            if (name.includes('to') || name.startsWith('to')) {
              totalTO += Math.round(Number(row[tc.name]) || 0);
            } else if (name.includes('vessel') || name.includes('kapal')) {
              totalVessel += Math.round(Number(row[tc.name]) || 0);
            }
          }
        });
      }
      return { week: `Week ${w}`, 'Transfer Order (TO)': totalTO, 'On Vessel': totalVessel };
    });
  }, [parsed, filtered, colCabang, selectedCabangForChart]);

  // Pillar KPIs
  const pillarKpis = useMemo(() => {
    if (!pivotData || pivotData.length === 0) return [];
    return PILLAR_ORDER.map(pillar => {
      const total = pivotData.reduce((a, r) => a + (r[pillar] || 0), 0);
      const cols = pillarColumnsMap[pillar]?.length || 0;
      return { name: pillar, total, cols, color: PILLAR_COLORS[pillar] };
    });
  }, [pivotData, pillarColumnsMap]);

  const totalOnHand = useMemo(() => {
    return pivotData.reduce((a, r) => a + (r['On Hand'] || 0), 0);
  }, [pivotData]);

  const totalInbound = useMemo(() => {
    return pivotData.reduce((a, r) => a + (r['VESSEL'] || 0) + (r['TO'] || 0) + (r['PLAN LOADING'] || 0), 0);
  }, [pivotData]);

  const criticalCount = useMemo(() => {
    return pivotData.filter(r => (r['On Hand'] || 0) < 2000).length;
  }, [pivotData]);

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
    link.download = getStandardFilename(`SOH_TO_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis SOH & TO Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HEADER SECTION ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 sm:p-8 border border-emerald-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
              <ClipboardList className="w-3.5 h-3.5" /> Dashboard Data Harian • SOH-TO-Vessel
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              SOH-TO-Vessel <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-300">(Weekly Grouping Analytics)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Analisis persediaan terstruktur dengan pengelompokan mingguan: <b>On Hand ➔ TO Week 1-4 ➔ Vessel Week 1-4 ➔ Plan Loading</b>.
              Dilengkapi evaluasi ketahanan stok dan grafik perbandingan TO vs Vessel.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-emerald-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Panduan Raw Data & Upload SOH (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo 5-Pilar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">📌 Pengelompakan 5 Pilar Inbound:</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-400">
                <li><b>On Hand:</b> Stok fisik siap jual di gudang masing-masing cabang.</li>
                <li><b>Vessel (Kapal):</b> Stok yang sedang dalam perjalanan muat laut/kapal barang.</li>
                <li><b>TO (Transfer Order):</b> Stok dalam pengiriman darat antar cabang atau gudang pusat.</li>
                <li><b>Plan Loading & Ready:</b> Stok dalam tahap konfirmasi dan perencanaan bongkar muat.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">⚙️ Fitur Pembacaan Excel Pintar (XLSX):</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Modul ini kini dilengkapi engine parsing <b>XLSX & CSV ArrayBuffer</b>. Anda bebas mengunggah file Excel (.xlsx) maupun CSV hasil unduhan ERP/Google Sheet tanpa keraguan error karakter atau salah baca angka!
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unggah File Data SOH Anda (Excel / CSV):</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data SOH (Sheet: On Hand)"
              description="Drag & drop file Excel/CSV di sini. Sistem otomatis memetakan kolom mingguan ke 5 grup pilar SOH."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Evaluasi & Simulasi SOH:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk menguji ketahanan stok fisik secara instan!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-emerald-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-emerald-400'}`} />
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total On Hand Fisik"
          value={`${totalOnHand.toLocaleString('id-ID')} Qty`}
          trend="Siap Jual Gudang Cabang"
          icon={<Package className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
        <KPICard
          title="Total Inbound (On Order)"
          value={`${totalInbound.toLocaleString('id-ID')} Qty`}
          trend="Gabungan Vessel + TO + Loading"
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
        <KPICard
          title="Cabang Stok Kritis (<2K)"
          value={`${criticalCount} Cabang`}
          trend={criticalCount === 0 ? "Seluruh Cabang Optimal!" : "Perlu percepatan bongkar Vessel/TO"}
          isAlert={criticalCount > 0}
          icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
          className="border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40 transition"
        />
        <KPICard
          title="Total Baris Terolah"
          value={`${filtered.length.toLocaleString('id-ID')} Item`}
          trend="Dari Database SOH Terverifikasi"
          icon={<CheckCircle2 className="w-5 h-5 text-purple-400" />}
          className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
        />
      </div>

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
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Filter Kategori:</label>
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
              className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-200 focus:border-emerald-500 outline-none transition font-medium"
            >
              <option value="All">📊 Tampilkan Semua Cabang (Gabungan)</option>
              {cabangs.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>📍 Fokus Cabang: {c}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: WEEKLY & PIVOT PER CABANG ─── */}
      {pivotData && pivotData.length > 0 && (
        <GlassCard className="p-6 border-emerald-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                {chartMode === 'weekly' ? 'Grafik Grouping Mingguan: Transfer Order (TO) vs On Vessel (W1 - W4)' : 'Grafik Komparasi Pilar SOH & Inbound per Cabang'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 shrink-0">
              <button
                onClick={() => setChartMode('weekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'weekly' ? 'bg-gradient-to-r from-orange-500 to-blue-600 text-white shadow-md scale-105' : 'text-slate-300 hover:text-white'
                }`}
              >
                📅 Grouping per Week (W1-W4)
              </button>
              <button
                onClick={() => setChartMode('summary')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'summary' ? 'bg-emerald-500 text-white shadow-md scale-105' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Summary Cabang
              </button>
              <button
                onClick={() => setChartMode('stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'stock' ? 'bg-emerald-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                📦 On Hand
              </button>
              <button
                onClick={() => setChartMode('to')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'to' ? 'bg-orange-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-orange-400'
                }`}
              >
                🚚 TO
              </button>
              <button
                onClick={() => setChartMode('vessel')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  chartMode === 'vessel' ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-slate-400 hover:text-blue-400'
                }`}
              >
                🚢 Vessel
              </button>
            </div>
          </div>

          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'weekly' ? (
                <BarChart data={weeklyGroupedData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="week" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 13, fontWeight: 700 }} height={40} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#f97316', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px', fontWeight: 'bold' }} />
                  <Bar dataKey="Transfer Order (TO)" name="Transfer Order (TO)" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={50} />
                  <Bar dataKey="On Vessel" name="On Vessel (Kapal)" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              ) : (
                <BarChart data={pivotData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="cabang" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#10b981', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                    labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                  {chartMode === 'summary' && (
                    <>
                      <Bar dataKey="On Hand" name="On Hand (Fisik)" fill="#10b981" stackId="a" />
                      <Bar dataKey="VESSEL" name="Total Vessel (W1-W4)" fill="#3b82f6" stackId="a" />
                      <Bar dataKey="TO" name="Total TO (W1-W4)" fill="#f97316" stackId="a" />
                      <Bar dataKey="PLAN LOADING" name="Plan Loading" fill="#a855f7" stackId="a" radius={[4, 4, 0, 0]} />
                    </>
                  )}
                  {chartMode === 'stock' && <Bar dataKey="On Hand" name="On Hand (Fisik)" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={60} />}
                  {chartMode === 'to' && <Bar dataKey="TO" name="Total Transfer Order (W1-W4)" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={60} />}
                  {chartMode === 'vessel' && <Bar dataKey="VESSEL" name="Total Vessel (W1-W4)" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={60} />}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── TABEL COMPLEMENTARY: ANALISIS PIVOT & ZONASI STOK ─── */}
      <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Tabel Analisis Komparatif SOH & TO ({pivotData.length} Cabang Terfilter)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rincian kuota persediaan per cabang dengan zonasi status ketersediaan gudang secara real-time.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[900px]">
            <thead className="bg-slate-950/90 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang & Lokasi</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 text-emerald-400">📦 On Hand (Fisik)</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 text-orange-400">🚚 TO (Week 1-4)</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 text-blue-400">🚢 Vessel (Week 1-4)</th>
                <th className="py-3.5 px-3.5 border-l border-slate-800 text-purple-400">⚙️ Plan Loading</th>
                <th className="py-3.5 px-4 border-l border-slate-800 bg-slate-800 text-white">Total Inbound</th>
                <th className="py-3.5 px-4 border-l border-slate-800">Zonasi Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center">
              {pivotData.map((row) => {
                const totalInboundRow = Math.round((row['VESSEL'] || 0) + (row['TO'] || 0) + (row['PLAN LOADING'] || 0));
                const isCritical = (row['On Hand'] || 0) < 2000;
                const isWarning = (row['On Hand'] || 0) < 4000 && !isCritical;
                const isOver = (row['On Hand'] || 0) > 8000;
                
                return (
                  <tr
                    key={row.cabang}
                    className="hover:bg-slate-800/40 transition cursor-pointer font-medium"
                    onClick={() => setSelectedCabangForChart(row.cabang === selectedCabangForChart ? 'All' : row.cabang)}
                  >
                    <td className="py-3.5 px-4 text-left align-middle">
                      <div className="font-bold text-white text-sm">{row.cabang}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">SOH & TO Monitoring</div>
                    </td>
                    <td className="py-3.5 px-3.5 border-l border-slate-800 font-extrabold text-emerald-400 text-base font-mono">
                      {Math.round(row['On Hand'] || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3.5 border-l border-slate-800 font-mono text-orange-300">
                      {Math.round(row['TO'] || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3.5 border-l border-slate-800 font-mono text-blue-300">
                      {Math.round(row['VESSEL'] || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3.5 border-l border-slate-800 font-mono text-purple-300">
                      {Math.round(row['PLAN LOADING'] || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 bg-slate-950/50 font-bold font-mono text-white text-base">
                      {totalInboundRow.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider inline-block ${
                        isCritical ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
                        isWarning ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                        isOver ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' :
                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}>
                        {isCritical ? '🔴 KRITIS (PERCEPAT TO)' : isWarning ? '🟡 RE-ORDER AREA' : isOver ? '🔵 SURPLUS STOK' : '🟢 STOK OPTIMAL'}
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
