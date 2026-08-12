"use client";
import LZString from 'lz-string';

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import {
  ArrowLeftRight, Download, Truck, DollarSign, AlertTriangle,
  Package, CheckCircle, Info, UploadCloud, Cloud, FileSpreadsheet, X, Zap, HelpCircle, FastForward, ShieldAlert
} from 'lucide-react';
import { uploadRebalancingFiles } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { getStandardFilename } from '@/utils/export';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';

type ScenarioType = 'cost' | 'speed' | 'shortage';

const SCENARIOS = [
  {
    id: 'cost' as ScenarioType,
    title: 'Jalur 1: Prioritas Biaya Terendah (Lowest Cost Freight)',
    desc: 'Alokasi transfer antar-cabang diprioritaskan pada jalur laut & darat ekonomis untuk meminimalkan total biaya pengiriman logistik.',
    color: 'from-emerald-600 to-teal-500',
    icon: DollarSign,
    modifier: 'cost'
  },
  {
    id: 'speed' as ScenarioType,
    title: 'Jalur 2: Prioritas Kecepatan (Express Air Cargo)',
    desc: 'Simulasi alokasi darurat menggunakan jalur kargo udara/express untuk menekan lead time pengiriman drastis ke bawah 3 hari.',
    color: 'from-blue-600 to-indigo-500',
    icon: FastForward,
    modifier: 'speed'
  },
  {
    id: 'shortage' as ScenarioType,
    title: 'Jalur 3: Simulasi Kelangkaan Stok (+40% Deficit Demand)',
    desc: 'Simulasi tekanan tinggi jika terjadi defisit stok mendadak di cabang Indonesia Timur, memicu transfer silang intensif dari gudang regional.',
    color: 'from-amber-600 to-red-500',
    icon: ShieldAlert,
    modifier: 'shortage'
  }
];

function generateDemoRebalancing() {
  const recs = [
    { origin: 'Jakarta (Central)', destination: 'Manado', entity: 'PT Alpha', sku: 'SKU-001 (Mainboard)', qty: 500, mode: 'Laut (Pelni)', cost_per_ton: 8500, total_cost: 4250000, lead_time: 12, cost_if_central: 4250000, savings: 0 },
    { origin: 'Surabaya', destination: 'Kupang', entity: 'PT Alpha', sku: 'SKU-001 (Mainboard)', qty: 200, mode: 'Laut (Roro)', cost_per_ton: 7500, total_cost: 1500000, lead_time: 15, cost_if_central: 1800000, savings: 300000 },
    { origin: 'Makassar', destination: 'Palu', entity: 'PT Beta', sku: 'SKU-001 (Mainboard)', qty: 250, mode: 'Darat (Trucking)', cost_per_ton: 3500, total_cost: 875000, lead_time: 2, cost_if_central: 2000000, savings: 1125000 },
    { origin: 'Denpasar', destination: 'Mataram', entity: 'PT Beta', sku: 'SKU-002 (Power Supply)', qty: 300, mode: 'Roro Ferry', cost_per_ton: 3000, total_cost: 900000, lead_time: 1, cost_if_central: 1500000, savings: 600000 },
    { origin: 'Surabaya', destination: 'Kendari', entity: 'PT Alpha', sku: 'SKU-003 (Display Screen)', qty: 400, mode: 'Laut (Container)', cost_per_ton: 6500, total_cost: 2600000, lead_time: 8, cost_if_central: 3400000, savings: 800000 },
  ];

  return {
    processed_at: new Date().toISOString(),
    recommendations: recs,
    infeasible: [],
    kpi: {
      total_transfers: 5,
      total_cost: 10125000,
      total_cost_central: 12950000,
      savings: 2825000,
      savings_pct: 21.8,
      infeasible_count: 0
    }
  };
}

const TEMPLATE_STOCK = `Cabang,SKU,Qty_Available
Jakarta,SKU-001,5000
Jakarta,SKU-002,3000
Jakarta,SKU-003,8000
Surabaya,SKU-001,2000
Surabaya,SKU-002,1500
Surabaya,SKU-003,4000
Bandung,SKU-001,800
Denpasar,SKU-001,1200
Denpasar,SKU-002,600
Makassar,SKU-001,300
Makassar,SKU-003,2500
Semarang,SKU-001,900
Medan,SKU-001,400
Balikpapan,SKU-001,350`;

const TEMPLATE_DEMAND = `Cabang,Entity,SKU,Qty_Needed,Max_Lead_Time_Days
Manado,PT Alpha,SKU-001,500,14
Kupang,PT Alpha,SKU-001,200,21
Jayapura,PT Alpha,SKU-001,150,28
Ambon,PT Beta,SKU-001,100,25
Mataram,PT Beta,SKU-002,300,10
Kendari,PT Alpha,SKU-003,400,18
Palu,PT Beta,SKU-001,250,15
Pontianak,PT Alpha,SKU-002,350,12
Makassar,PT Alpha,SKU-001,800,7
Lampung,PT Beta,SKU-001,600,5
Padang,PT Alpha,SKU-001,300,10`;

const TEMPLATE_FREIGHT = `Origin,Destination,Mode,Cost_Per_Ton,Capacity_Max,Lead_Time_Est
Jakarta,Manado,Laut,8500,1000,12
Jakarta,Manado,Udara,25000,200,2
Surabaya,Manado,Laut,7000,800,10
Jakarta,Kupang,Laut,9000,500,18
Surabaya,Kupang,Laut,7500,500,15
Jakarta,Jayapura,Laut,12000,300,25
Jakarta,Jayapura,Udara,35000,100,3
Jakarta,Ambon,Laut,10000,400,20
Denpasar,Mataram,Roro,3000,600,1
Surabaya,Mataram,Laut,4500,500,3
Surabaya,Kendari,Laut,6500,500,8
Makassar,Kendari,Darat,4000,300,2
Jakarta,Palu,Laut,8000,500,12
Makassar,Palu,Darat,3500,400,2
Jakarta,Pontianak,Laut,5500,800,5
Jakarta,Makassar,Laut,7000,1000,7
Jakarta,Makassar,Udara,22000,200,1
Surabaya,Makassar,Laut,5500,800,5
Jakarta,Lampung,Darat,2000,1000,1
Jakarta,Padang,Laut,5000,600,4
Jakarta,Padang,Darat,6000,300,3`;

function FileDropZone({ label, file, onFile, onClear, templateCsv, templateName }: {
  label: string; file: File | null; onFile: (f: File) => void; onClear: () => void;
  templateCsv: string; templateName: string;
}) {
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-all">
      {!file ? (
        <label className="cursor-pointer flex flex-col items-center gap-2">
          <UploadCloud className="w-8 h-8 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <input type="file" className="hidden" accept=".csv,.xlsx,.xls"
            onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              const blob = new Blob(['\ufeff' + templateCsv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = templateName; a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-1 px-2 py-1 bg-primary/20 hover:bg-primary/40 text-primary text-xs rounded border border-primary/50 transition"
          >
            Download Template
          </button>
        </label>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-primary" />
          <span className="text-sm font-medium text-foreground truncate max-w-[150px]">{file.name}</span>
          <button onClick={onClear} className="text-destructive hover:text-destructive/80"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}

const normalizeData = (data: any) => {
  if (!data) return null;
  return {
    ...data,
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
    infeasible: Array.isArray(data.infeasible) ? data.infeasible : [],
    route_summary: Array.isArray(data.route_summary) ? data.route_summary : [],
    kpi: data.kpi || { total_transfers: 0, total_cost: 0, savings: 0, savings_pct: 0, infeasible_count: 0, total_cost_central: 0 },
    processed_at: data.processed_at || new Date().toISOString()
  };
};

export default function RebalancingPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [demandFile, setDemandFile] = useState<File | null>(null);
  const [freightFile, setFreightFile] = useState<File | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string[]>(['All']);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('cost');
  const [showHowTo, setShowHowTo] = useState(false);

  const handleSaveToGlobal = async () => {
    if (!results) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...results, processed_at: timestamp };
    sessionStorage.setItem('last_processed_at_rebalancing', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'rebalancing', result_json: JSON.stringify({ compressed: true, data: LZString.compressToBase64(JSON.stringify(dataCopy)) }) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = normalizeData(generateDemoRebalancing());
    setResults(demo);
    toast.success('🎉 Data Demo Stock Rebalancing Berhasil Dimuat!');
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'rebalancing')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (data && data.length > 0) {
          const row = data[0];
          const parsed = JSON.parse(row.result_json);
          parsed.processed_at = row.created_at;
          setResults(normalizeData(parsed));
        } else {
          if (!results) setResults(normalizeData(generateDemoRebalancing()));
        }
      } catch (err) {
        if (!results) setResults(normalizeData(generateDemoRebalancing()));
      }
    };
    
    // 1. Initial fetch directly from Supabase
    fetchInitialData();
    
    // 2. Real-time Subscription (WebSockets)
    const channel = supabase
      .channel('rebalancing_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.rebalancing' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.processed_at = payload.new.created_at;
            
            // Filter Realtime: abaikan notifikasi jika data ini berasal dari tab/device kita sendiri
            const lastProcessedAt = sessionStorage.getItem('last_processed_at');
            if (lastProcessedAt === newData.processed_at) return;

            setResults(normalizeData(newData));
            toast.success('Pembaruan data dari pengguna lain diterima!', { 
              icon: '🔄',
              duration: 5000,
              style: { background: '#22c55e', color: '#fff', fontWeight: 'bold' } 
            });
          } catch (e) {
            console.error("Failed parsing realtime data", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = async () => {
    if (!stockFile || !demandFile || !freightFile) {
      toast.error('Upload ketiga file terlebih dahulu.');
      return;
    }
    setIsProcessing(true);
    toast.loading('Mengoptimasi distribusi stok antar-cabang...', { id: 'rb' });
    try {
      const data = normalizeData(await uploadRebalancingFiles(stockFile, demandFile, freightFile));
      if (data) data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      sessionStorage.setItem('last_processed_at', data.processed_at);
      toast.success('Optimasi selesai & Tersimpan secara Global!', { id: 'rb' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Gagal memproses.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'rb' });
    } finally {
      setIsProcessing(false);
    }
  };

  const entityOptions = useMemo(() => {
    if (!Array.isArray(results?.recommendations)) return ['All'];
    const s = new Set<string>();
    results.recommendations.forEach((r: any) => s.add(r.entity));
    return ['All', ...Array.from(s).sort()];
  }, [results]);

  const filtered = useMemo(() => {
    if (!Array.isArray(results?.recommendations)) return [];
    const base = results.recommendations.filter((r: any) =>
      selectedEntity.includes('All') || selectedEntity.includes(r.entity)
    );
    if (activeScenario === 'speed') {
      return base.map((r: any) => ({ ...r, mode: 'Udara (Express Air Cargo)', lead_time: Math.min(2, r.lead_time), total_cost: Math.round(r.total_cost * 1.8) }));
    }
    if (activeScenario === 'shortage') {
      return base.map((r: any) => ({ ...r, qty: Math.round(r.qty * 1.4), total_cost: Math.round(r.total_cost * 1.35) }));
    }
    return base;
  }, [results, selectedEntity, activeScenario]);

  const handleExportSTO = () => {
    if (!filtered.length) { toast.error('Tidak ada data untuk di-export'); return; }
    const lines = ['Origin,Destination,Entity,SKU,Qty,Mode,Cost_Per_Ton,Total_Cost,Lead_Time'];
    for (const r of filtered) {
      lines.push(`"${r.origin}","${r.destination}","${r.entity}","${r.sku}",${r.qty},"${r.mode}",${r.cost_per_ton},${r.total_cost},${r.lead_time}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getStandardFilename("Inventory_Rebalancing", results?.processed_at || new Date().toISOString(), "csv");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Draft STO exported!');
  };

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-6 sm:p-8 border border-emerald-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
              <ArrowLeftRight className="w-3.5 h-3.5" /> SCM Analytic • Multi-Echelon Logistics
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              Stock Rebalancing <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300">Optimizer</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Optimasi pemindahan stok silang antar-cabang dengan biaya logistik terendah dan waktu kirim tercepat. Perhitungan dipartisi ketat per entitas perusahaan tujuan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan & File' : 'Panduan & Upload File'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-emerald-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Upload 3 File Matriks & Panduan Rebalancing
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Zap className="w-4 h-4" /> Gunakan Data Demo
              </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!results}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <FileDropZone label="1. Stock Saat Ini" file={stockFile} onFile={setStockFile} onClear={() => setStockFile(null)}
              templateCsv={TEMPLATE_STOCK} templateName="template_stock_current.csv" />
            <FileDropZone label="2. Demand / Defisit" file={demandFile} onFile={setDemandFile} onClear={() => setDemandFile(null)}
              templateCsv={TEMPLATE_DEMAND} templateName="template_demand_target.csv" />
            <FileDropZone label="3. Matriks Tarif Freight" file={freightFile} onFile={setFreightFile} onClear={() => setFreightFile(null)}
              templateCsv={TEMPLATE_FREIGHT} templateName="template_freight_matrix.csv" />
          </div>
          <div className="flex justify-center">
            <button onClick={handleAnalyze} disabled={isProcessing || !stockFile || !demandFile || !freightFile}
              className="px-8 py-3 bg-emerald-600 text-slate-900 rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition text-sm font-bold uppercase tracking-wide flex items-center gap-2 shadow-lg shadow-emerald-600/20">
              {isProcessing ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Memproses...</>
              ) : (
                <><ArrowLeftRight className="w-4 h-4" /> Hitung</>
              )}
            </button>
          </div>
          <div className="mt-6 p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-xs text-slate-700">
            <p><strong>💡 Catatan Sistem:</strong> Pembatasan hak entitas dipatuhi secara ketat (stok PT Alpha hanya dialokasikan untuk demand PT Alpha). Opsi pengiriman yang melebihi Max Lead Time otomatis tereliminasi.</p>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Alokasi & Mode Logistik:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk membandingkan ongkir termurah vs kecepatan kargo udara!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-emerald-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-emerald-400'}`} />
                    {sc.title}
                  </span>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-slate-900 text-xs font-black uppercase tracking-wider">
                      Aktif
                    </span>
                  )}
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── ACTION BAR KETIKA RESULTS ADA ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xl relative z-30 overflow-visible mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
          <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider whitespace-nowrap">🏢 Filter Entity / Cabang:</span>
          <div className="w-full max-w-xs">
            <MultiSelect options={entityOptions} selected={selectedEntity} onChange={setSelectedEntity} selectAllLabel="Semua Entity" placeholder="Pilih Entity..." />
          </div>
          <button onClick={handleExportSTO} className="px-5 py-2.5 bg-emerald-600 text-slate-900 rounded-xl hover:bg-emerald-500 transition text-xs sm:text-sm font-bold flex items-center justify-center gap-2 uppercase tracking-wide shadow-lg">
            <Download className="w-4 h-4" /> Download Draft STO
          </button>
        </div>
        <button
          onClick={handleGenerateDemo}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-900 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs sm:text-sm"
        >
          <Zap className="w-4 h-4" /> Gunakan Data Demo
        </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!results}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              ⚖️ Hasil Optimasi Stock Rebalancing
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Total Transfer" value={results.kpi.total_transfers} icon={<Truck />} />
            <KPICard title="Total Biaya" value={`Rp ${Number(results.kpi.total_cost).toLocaleString('id-ID')}`} icon={<DollarSign />} />
            <KPICard title="Hemat vs Central" value={`Rp ${Number(results.kpi.savings).toLocaleString('id-ID')}`} icon={<CheckCircle />} />
            <KPICard title="Infeasible" value={results.kpi.infeasible_count} icon={<AlertTriangle />} isAlert={results.kpi.infeasible_count > 0} />
          </div>

          {/* Savings indicator */}
          {results.kpi.savings > 0 && (
            <GlassCard className="border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <div>
                  <p className="text-sm font-bold text-green-500">
                    Penghematan {results.kpi.savings_pct}% — Rp {Number(results.kpi.savings).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dibandingkan dengan pengiriman seluruhnya dari Central Warehouse (Rp {Number(results.kpi.total_cost_central).toLocaleString('id-ID')}).
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Route Summary Chart */}
          {(results.route_summary || []).length > 0 && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Ringkasan Biaya per Rute Distribusi
              </h3>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.route_summary || []} layout="vertical" margin={{ top: 10, right: 20, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="route" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} width={95} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`]} />
                    <Bar dataKey="total_cost" name="Total Biaya" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {/* Recommendations Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Rekomendasi Transfer ({filtered.length} items)
            </h3>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-muted-foreground">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider z-10">
                  <tr>
                    <th className="px-3 py-3">Entity</th>
                    <th className="px-3 py-3">Origin</th>
                    <th className="px-3 py-3">→ Destination</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3 text-right">Rp/Ton</th>
                    <th className="px-3 py-3 text-right">Total Cost</th>
                    <th className="px-3 py-3 text-right">LT (hari)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-primary">{r.entity}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{r.origin}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{r.destination}</td>
                      <td className="px-3 py-2.5">{r.sku}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{r.qty}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          r.mode === 'Udara' ? 'bg-blue-500/20 text-blue-400' :
                          r.mode === 'Laut' ? 'bg-cyan-500/20 text-cyan-400' :
                          r.mode === 'Darat' ? 'bg-green-500/20 text-green-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{r.mode}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{Number(r.cost_per_ton).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right font-medium">Rp {Number(r.total_cost).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right">{r.lead_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Infeasible */}
          {(results.infeasible || []).length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Infeasible — Tidak Dapat Dipenuhi
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-muted-foreground">
                  <thead className="text-xs text-foreground uppercase bg-destructive/10 border-b border-destructive/20 font-bold">
                    <tr>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Destination</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3 text-right">Unfulfilled</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(results.infeasible || []).map((inf: any, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-4 py-3 font-medium text-primary">{inf.entity}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{inf.destination}</td>
                        <td className="px-4 py-3">{inf.sku}</td>
                        <td className="px-4 py-3 text-right text-destructive font-bold">{inf.qty_unfulfilled}</td>
                        <td className="px-4 py-3 text-xs">{inf.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Re-upload */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Upload Ulang</h3>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <FileDropZone label="1. Stock Saat Ini" file={stockFile} onFile={setStockFile} onClear={() => setStockFile(null)}
                templateCsv={TEMPLATE_STOCK} templateName="template_stock_current.csv" />
              <FileDropZone label="2. Demand / Defisit" file={demandFile} onFile={setDemandFile} onClear={() => setDemandFile(null)}
                templateCsv={TEMPLATE_DEMAND} templateName="template_demand_target.csv" />
              <FileDropZone label="3. Matriks Tarif Freight" file={freightFile} onFile={setFreightFile} onClear={() => setFreightFile(null)}
                templateCsv={TEMPLATE_FREIGHT} templateName="template_freight_matrix.csv" />
            </div>
            <div className="flex justify-center">
              <button onClick={handleAnalyze} disabled={isProcessing || !stockFile || !demandFile || !freightFile}
                className="px-8 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition text-sm font-bold uppercase tracking-wide flex items-center gap-2">
                {isProcessing ? 'Memproses...' : 'Hitung'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
