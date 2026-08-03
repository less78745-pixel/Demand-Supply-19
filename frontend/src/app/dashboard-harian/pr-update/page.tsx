/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  FileBarChart, Info, Calendar, BarChart3, Clock, Table as TableIcon, Download,
  Sparkles, Layers, HelpCircle, FileSpreadsheet, Zap, AlertTriangle, CheckCircle2, TrendingUp, Truck, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';

const COLORS = ['#a855f7', '#3b82f6', '#f97316', '#eab308', '#22c55e', '#ef4444', '#06b6d4', '#ec4899'];

type ScenarioType = 'current' | 'expedite' | 'delay';

const SCENARIOS = [
  {
    id: 'current' as ScenarioType,
    title: 'Jalur 1: Evaluasi Aktual PR & Status Compile',
    desc: 'Pemantauan posisi terkini dari dokumen Purchase Requisition, PO Vendor, dan status bongkar muat secara live.',
    color: 'from-purple-600 to-indigo-500',
    icon: FileBarChart,
    multiplier: 1.0,
    statusModifier: 'normal'
  },
  {
    id: 'expedite' as ScenarioType,
    title: 'Jalur 2: Simulasi Percepatan Lead Time (-7 Hari)',
    desc: 'Estimasi percepatan kedatangan kapal (Vessel) dan konversi status dari Hold menjadi Ready untuk amankan stok.',
    color: 'from-emerald-600 to-teal-500',
    icon: TrendingUp,
    multiplier: 1.1,
    statusModifier: 'expedite'
  },
  {
    id: 'delay' as ScenarioType,
    title: 'Jalur 3: Simulasi Delay Port / Hold Vendor (+15 Hari)',
    desc: 'Uji ketahanan gudang terhadap risiko kemacetan pelabuhan atau penahanan pengiriman dari pihak pabrik/vendor.',
    color: 'from-rose-600 to-orange-500',
    icon: AlertTriangle,
    multiplier: 0.85,
    statusModifier: 'delay'
  }
];

function generateDemoPRUpdate(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const categories = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const statuses = ['ON VESSEL', 'HOLD DELIVERY', 'READY', 'PLAN LOADING', 'IN PROCESS'];
  const etas = ['Week 1 Agu', 'Week 2 Agu', 'Week 3 Agu', 'Week 4 Agu'];
  
  const data: any[] = [];
  let poCounter = 1001;

  cabangs.forEach(cab => {
    categories.forEach((cat, idx) => {
      const stat = statuses[(idx + Math.floor(Math.random() * 5)) % statuses.length];
      const eta = etas[Math.floor(Math.random() * etas.length)];
      const qty = Math.round(500 + Math.random() * 3500);
      
      data.push({
        'PO No': `PO-2026-${poCounter++}`,
        'PR No': `PR-08-${poCounter}`,
        'branch_name': cab,
        'GRUP': cat,
        'DESCRIPTION': `${cat} (Kemasan Karton)`,
        'STATUS Compile': stat,
        'Week ETA': eta,
        'Qty': qty
      });
    });
  });

  return {
    headers: ['PO No', 'PR No', 'branch_name', 'GRUP', 'DESCRIPTION', 'STATUS Compile', 'Week ETA', 'Qty'],
    targetColumns: [
      { index: 7, name: 'Qty' }
    ],
    data,
    processed_at: new Date().toISOString()
  };
}

export default function PRUpdatePage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('current');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedEta, setSelectedEta] = useState<string[]>(['All']);

  useEffect(() => {
    get('last_pr_update').then(saved => {
      if (saved && saved.data && saved.data.length > 0) {
        setParsed(saved);
      } else {
        setParsed(generateDemoPRUpdate());
      }
    }).catch(err => {
      console.warn('Failed to load PR Update state from IndexDB', err);
      setParsed(generateDemoPRUpdate());
    });
  }, []);

  const handleGenerateDemo = () => {
    const demo = generateDemoPRUpdate();
    setParsed(demo);
    toast.success('🎉 Data Demo PR Update Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const headers = 'PO No,PR No,branch_name,GRUP,DESCRIPTION,STATUS Compile,Week ETA,Qty';
    const row1 = 'PO-2026-101,PR-08-01,Surabaya,Minyak Goreng Premium,Minyak Goreng 2L,ON VESSEL,Week 1 Agu,2500';
    const row2 = 'PO-2026-102,PR-08-02,Jakarta,Beras Setra Ramos,Beras Premium 5kg,HOLD DELIVERY,Week 2 Agu,1800';
    const blob = new Blob(['\ufeff' + headers + '\n' + row1 + '\n' + row2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_pr_update.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📁 Template CSV PR Update Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca file PR Update (Excel/CSV)...', { id: 'pr' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      try {
        await set('last_pr_update', parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data PR Update Berhasil Diproses!', { id: 'pr' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'pr' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['cabang', 'branch_name', 'branch', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['item category', 'grup', 'category', 'kategori']) : undefined, [parsed]);
  const colEta = useMemo(() => parsed ? findColumn(parsed.headers, ['week eta', 'eta fix', 'tanggal eta', 'eta']) : undefined, [parsed]);
  const colStatus = useMemo(() => parsed ? findColumn(parsed.headers, ['status compile', 'status', 'state']) : undefined, [parsed]);
  const colQty = useMemo(() => parsed ? findColumn(parsed.headers, ['qty', 'quantity', 'jumlah']) : undefined, [parsed]);

  // Linked Filter options
  const cabangs = useMemo(() => {
    if (!parsed || !colCabang) return [];
    const source = parsed.data.filter(d =>
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()];
  }, [parsed, colCabang, selectedCategory, selectedEta, colCategory, colEta]);

  const categories = useMemo(() => {
    if (!parsed || !colCategory) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCategory]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()];
  }, [parsed, colCategory, selectedCabang, selectedEta, colCabang, colEta]);

  const etas = useMemo(() => {
    if (!parsed || !colEta) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colEta]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua eta'))).sort()];
  }, [parsed, colEta, selectedCabang, selectedCategory, colCabang, colCategory]);

  // Filtered Data with Scenario adjustments
  const filtered = useMemo(() => {
    if (!parsed) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    return parsed.data
      .filter(d =>
        (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
        (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
      )
      .map(row => {
        const copy = { ...row };
        if (colQty && copy[colQty] != null) {
          copy[colQty] = Math.round(Number(copy[colQty]) * sc.multiplier || 0);
        }
        if (colStatus && sc.statusModifier === 'expedite' && String(copy[colStatus]).toUpperCase().includes('HOLD')) {
          copy[colStatus] = 'READY / EXPEDITED';
        }
        if (colStatus && sc.statusModifier === 'delay' && String(copy[colStatus]).toUpperCase().includes('VESSEL')) {
          copy[colStatus] = 'HOLD DELIVERY (DELAY)';
        }
        return copy;
      });
  }, [parsed, selectedCabang, selectedCategory, selectedEta, colCabang, colCategory, colEta, colQty, colStatus, activeScenario]);

  // Chart data: Grouped by Cabang, Count by STATUS Compile
  const { chartData, statusList, totalQty, holdCount } = useMemo(() => {
    if (!parsed || filtered.length === 0) return { chartData: [], statusList: [], totalQty: 0, holdCount: 0 };
    const map: Record<string, any> = {};
    const statuses = new Set<string>();
    let qtySum = 0;
    let holdSum = 0;

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      const stat = colStatus ? (String(row[colStatus] || 'Unknown').toUpperCase()) : 'TOTAL';
      const q = colQty ? Number(row[colQty]) || 0 : 1;
      
      statuses.add(stat);
      qtySum += q;
      if (stat.includes('HOLD') || stat.includes('DELAY') || stat.includes('TUNDA')) {
        holdSum += 1;
      }

      if (!map[cbg]) {
        map[cbg] = { cabang: cbg };
      }
      map[cbg][stat] = (map[cbg][stat] || 0) + q;
    }

    return { chartData: Object.values(map), statusList: Array.from(statuses), totalQty: qtySum, holdCount: holdSum };
  }, [parsed, filtered, colCabang, colStatus, colQty, selectedCabangForChart]);

  // Pivot Table Data
  const pivotData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};
    const colDesc = findColumn(parsed.headers, ['description', 'deskripsi', 'nama barang', 'item']);

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const stat = colStatus ? (String(row[colStatus] || 'Unknown').toUpperCase()) : 'UNKNOWN';
      const eta = colEta ? (row[colEta] || 'Unknown') : 'Unknown';
      const cat = colCategory ? (row[colCategory] || 'Unknown') : 'Unknown';
      const desc = colDesc ? (row[colDesc] || 'Unknown') : 'Unknown';
      const q = colQty ? Number(row[colQty]) || 0 : 0;

      const key = `${cbg}_${stat}_${eta}_${cat}_${desc}`;
      if (!map[key]) {
        map[key] = {
          'Cabang': cbg,
          'Status': stat,
          'ETA': eta,
          'Kategori Produk': cat,
          'Deskripsi': desc,
          'Total Qty': 0,
          'Jumlah Dokumen': 0
        };
      }
      map[key]['Total Qty'] += q;
      map[key]['Jumlah Dokumen'] += 1;
    }
    return Object.values(map).sort((a: any, b: any) => b['Total Qty'] - a['Total Qty']);
  }, [parsed, filtered, colCabang, colStatus, colEta, colCategory, colQty]);

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
    link.download = getStandardFilename(`PR_Update_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis PR Update Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HERO BANNER HEADER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-6 sm:p-8 border border-purple-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#a855f7_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
              <FileBarChart className="w-3.5 h-3.5" /> Dashboard Data Harian • PR Update
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              PR Update & Status Compile <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300">(Supply Tracker)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Pemantauan pengadaan Purchase Requisition dan konversi status pesanan vendor (On Vessel, Ready, Hold). Dilengkapi 3 jalur simulasi percepatan lead time.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-purple-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" /> Panduan Upload Data PR Update (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">📌 Pelacakan Status Pengadaan:</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Modul ini memantau kolom <i>STATUS Compile</i> seperti <i>ON VESSEL, HOLD DELIVERY, READY,</i> atau <i>PLAN LOADING</i> untuk mendeteksi bottleneck per cabang dan minggu ETA.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">⚙️ Engine Pembacaan Excel (XLSX & CSV):</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Dilengkapi parsing XLSX ArrayBuffer, Anda dapat mengunggah file Excel (.xlsx) maupun CSV hasil ekstraksi sistem procurement tanpa kendala kerusakan karakter atau format numerik.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unggah File PR Update Anda:</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data PR Update (Excel / CSV)"
              description="Drag & drop file di sini. Sistem otomatis merekap total Qty dan dokumen per status."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Rantai Pasok PR/PO:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk memproyeksikan percepatan atau delay lead time!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-purple-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-purple-400'}`} />
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
          title="Total Qty Pesanan PR"
          value={`${totalQty.toLocaleString('id-ID')} Qty`}
          trend="Total Kuantitas Order Masuk"
          icon={<Truck className="w-5 h-5 text-purple-400" />}
          className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
        />
        <KPICard
          title="Total Dokumen PO/PR"
          value={`${filtered.length.toLocaleString('id-ID')} Dokumen`}
          trend="Berdasarkan Filter Aktif"
          icon={<FileBarChart className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
        <KPICard
          title="Item Hold Delivery / Delay"
          value={`${holdCount} Dokumen`}
          trend={holdCount === 0 ? "Aliran Pasokan Lancar" : "Perlu Tindak Lanjut ke Vendor"}
          isAlert={holdCount > 0}
          icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
          className="border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40 transition"
        />
        <KPICard
          title="Variasi Status Compile"
          value={`${statusList.length} Status`}
          trend={statusList.join(', ').slice(0, 25) + (statusList.join(', ').length > 25 ? '...' : '')}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
      </div>

      {/* ─── FILTER CONTROLS & SELECTION ─── */}
      <GlassCard className="p-5 border-slate-800 bg-slate-900/60 backdrop-blur-xl">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Filter Week ETA:</label>
            <MultiSelect
              options={etas}
              selected={selectedEta}
              onChange={setSelectedEta}
              selectAllLabel="Semua ETA"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-2 block uppercase tracking-wider">Sorot Grafik Khusus Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-slate-200 focus:border-purple-500 outline-none transition font-medium"
            >
              <option value="All">📊 Tampilkan Semua Cabang (Gabungan)</option>
              {cabangs.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>📍 Fokus Cabang: {c}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: STATUS COMPILE PER CABANG ─── */}
      {chartData && chartData.length > 0 && (
        <GlassCard className="p-6 border-purple-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                Grafik Distribusi Status Compile (Total Qty) per Cabang
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b>
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700">
              <span>📊 Menampilkan {statusList.length} status pada {chartData.length} cabang</span>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="cabang" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#a855f7', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                {statusList.map((stat, idx) => (
                  <Bar
                    key={stat}
                    dataKey={stat}
                    name={stat}
                    fill={COLORS[idx % COLORS.length]}
                    stackId="pr"
                    radius={idx === statusList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={55}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── TABEL COMPLEMENTARY: ANALISIS PIVOT & ZONASI STATUS ─── */}
      <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" />
              Tabel Analisis Komparatif PR & Status Compile ({pivotData.length} Kombinasi Item)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rincian kuota pengadaan barang per status dengan zonasi tindakan supply chain secara real-time.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[900px]">
            <thead className="bg-slate-950/90 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang & Kategori</th>
                <th className="py-3.5 px-4 border-l border-slate-800">Deskripsi Barang</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-cyan-400">Week ETA</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-purple-400">Status Compile</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-emerald-400">Total Qty</th>
                <th className="py-3.5 px-4 border-l border-slate-800 bg-slate-800 text-white">Jumlah Dokumen</th>
                <th className="py-3.5 px-4 border-l border-slate-800">Zonasi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center">
              {pivotData.slice(0, 150).map((row: any, idx: number) => {
                const stat = String(row['Status']).toUpperCase();
                const isHold = stat.includes('HOLD') || stat.includes('DELAY');
                const isVessel = stat.includes('VESSEL') || stat.includes('SHIP');
                const isReady = stat.includes('READY') || stat.includes('DONE');
                
                return (
                  <tr
                    key={idx}
                    className="hover:bg-slate-800/40 transition cursor-pointer font-medium"
                    onClick={() => setSelectedCabangForChart(row['Cabang'] === selectedCabangForChart ? 'All' : row['Cabang'])}
                  >
                    <td className="py-3.5 px-4 text-left align-middle">
                      <div className="font-bold text-white text-sm">{row['Cabang']}</div>
                      <div className="text-[11px] text-purple-300 mt-0.5">{row['Kategori Produk']}</div>
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 text-left text-slate-300 max-w-[200px] truncate" title={row['Deskripsi']}>
                      {row['Deskripsi']}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 font-mono font-bold text-cyan-300">
                      {row['ETA']}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 font-extrabold text-slate-200">
                      {row['Status']}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 font-mono font-black text-emerald-400 text-base">
                      {Number(row['Total Qty']).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800 bg-slate-950/50 font-bold font-mono text-white text-base">
                      {Number(row['Jumlah Dokumen']).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 border-l border-slate-800">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider inline-block ${
                        isHold ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
                        isVessel ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' :
                        isReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                        'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}>
                        {isHold ? '🔴 HOLD (ESKALASI VENDOR)' : isVessel ? '🔵 ON VESSEL (PANTAU PORT)' : isReady ? '🟢 READY (SIAP BONGKAR)' : '🟡 IN PROCESS (FOLLOW UP)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pivotData.length > 150 && (
          <p className="text-xs text-slate-400 mt-4 italic text-center">
            *Menampilkan 150 baris pertama dengan Qty terbesar dari total {pivotData.length} kombinasi item...
          </p>
        )}
      </GlassCard>
    </div>
  );
}
