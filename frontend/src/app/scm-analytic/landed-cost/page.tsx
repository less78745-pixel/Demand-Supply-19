"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import {
  Ship, Download, AlertTriangle, DollarSign, Clock,
  Package, Info, UploadCloud, FileSpreadsheet, X, Zap, TrendingUp, ShieldAlert
} from 'lucide-react';
import { uploadLandedCostFiles } from '@/lib/api';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { getStandardFilename } from '@/utils/export';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';

type ScenarioType = 'actual' | 'fx_surge' | 'demurrage';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Kurs Aktual & Estimasi Standar (USD/IDR Rp 16.000)',
    desc: 'Kalkulasi HPP per unit (Landed Cost) berdasarkan tarif freight aktual, bea masuk, dan kurs valuta asing berjalan.',
    color: 'from-cyan-600 to-blue-500',
    icon: Ship,
    modifier: 1.0,
    rate: 16000
  },
  {
    id: 'fx_surge' as ScenarioType,
    title: 'Jalur 2: Simulasi Depresiasi Rupiah (Kurs Rp 17.200 / USD)',
    desc: 'Simulasi stress-test jika kurs Rupiah melemah terhadap Dolar AS dan dampaknya terhadap lonjakan Harga Pokok Penjualan (HPP).',
    color: 'from-amber-600 to-orange-500',
    icon: TrendingUp,
    modifier: 1.075,
    rate: 17200
  },
  {
    id: 'demurrage' as ScenarioType,
    title: 'Jalur 3: Simulasi Kongesti & Demurrage (+25% THC & Penalty)',
    desc: 'Simulasi antrean dermaga (port congestion) yang melampaui Free Time container, menimbulkan biaya demurrage dan storage tambahan.',
    color: 'from-rose-600 to-red-500',
    icon: ShieldAlert,
    modifier: 1.25,
    rate: 16000
  }
];

function generateDemoLandedCost() {
  const containers = [
    { no_bl: 'BL-2024-001', no_container: 'TGUU1234567', status: 'On Water', eta_port: '2024-08-15', free_time_end: '2024-08-22', cabang_tujuan: 'Jakarta', total_usd: 6850, total_idr: 109600000, days_to_free_time: 7, is_demurrage_risk: false },
    { no_bl: 'BL-2024-002', no_container: 'MSCU7654321', status: 'Berthing', eta_port: '2024-08-05', free_time_end: '2024-08-12', cabang_tujuan: 'Surabaya', total_usd: 5700, total_idr: 91200000, days_to_free_time: 2, is_demurrage_risk: true },
    { no_bl: 'BL-2024-003', no_container: 'CMAU9876543', status: 'Clearance', eta_port: '2024-08-02', free_time_end: '2024-08-09', cabang_tujuan: 'Medan', total_usd: 8300, total_idr: 132800000, days_to_free_time: 0, is_demurrage_risk: true },
    { no_bl: 'BL-2024-004', no_container: 'HLCU1122334', status: 'On Water', eta_port: '2024-08-20', free_time_end: '2024-08-27', cabang_tujuan: 'Makassar', total_usd: 7480, total_idr: 119680000, days_to_free_time: 12, is_demurrage_risk: false },
  ];

  const sku_costs = [
    { no_bl: 'BL-2024-001', sku: 'FILTER-A100 (Air Filter)', qty: 5000, weight_kg: 2500, weight_ratio: 34.2, freight_alloc_usd: 1539, duty_alloc_usd: 410, thc_alloc_usd: 119, inland_alloc_usd: 273, total_landed_usd: 2341, total_landed_idr: 37456000, cost_per_unit_idr: 7491 },
    { no_bl: 'BL-2024-001', sku: 'FILTER-B200 (Oil Filter)', qty: 3000, weight_kg: 1800, weight_ratio: 24.6, freight_alloc_usd: 1107, duty_alloc_usd: 295, thc_alloc_usd: 86, inland_alloc_usd: 196, total_landed_usd: 1684, total_landed_idr: 26944000, cost_per_unit_idr: 8981 },
    { no_bl: 'BL-2024-002', sku: 'BRAKE-D400 (Brake Pad)', qty: 1500, weight_kg: 2200, weight_ratio: 52.3, freight_alloc_usd: 1987, duty_alloc_usd: 523, thc_alloc_usd: 156, inland_alloc_usd: 313, total_landed_usd: 2979, total_landed_idr: 47664000, cost_per_unit_idr: 31776 },
    { no_bl: 'BL-2024-003', sku: 'OIL-C300 (Synthetic Oil 4L)', qty: 3500, weight_kg: 5250, weight_ratio: 63.6, freight_alloc_usd: 3307, duty_alloc_usd: 954, thc_alloc_usd: 254, inland_alloc_usd: 763, total_landed_usd: 5278, total_landed_idr: 84448000, cost_per_unit_idr: 24128 },
  ];

  const demurrage_alerts = [
    { urgency: 'CRITICAL', no_container: 'CMAU9876543', no_bl: 'BL-2024-003', days_remaining: 0, free_time_end: '2024-08-09', cabang: 'Medan' },
    { urgency: 'WARNING', no_container: 'MSCU7654321', no_bl: 'BL-2024-002', days_remaining: 2, free_time_end: '2024-08-12', cabang: 'Surabaya' }
  ];

  const currency_simulations = [
    { rate: 'Rp 15,500', total_idr: 439115000, is_current: false },
    { rate: 'Rp 16,000', total_idr: 453280000, is_current: true },
    { rate: 'Rp 16,500', total_idr: 467445000, is_current: false },
    { rate: 'Rp 17,000', total_idr: 481610000, is_current: false },
    { rate: 'Rp 17,200', total_idr: 487276000, is_current: false }
  ];

  const monte_carlo = {
    histogram: [
      { bin: '10-14', count: 12 },
      { bin: '15-18', count: 45 },
      { bin: '19-21', count: 85 },
      { bin: '22-25', count: 32 },
      { bin: '> 26', count: 8 }
    ],
    p50: 18, p75: 21, p90: 24, p95: 26, p99: 29,
    recommendation: 'Jadwalkan clearance pelabuhan minimal 4 hari sebelum free time berakhir untuk mencegah biaya demurrage Rp 2.5jt/hari.'
  };

  return {
    processed_at: new Date().toISOString(),
    containers,
    sku_costs,
    demurrage_alerts,
    currency_simulations,
    monte_carlo,
    kpi: {
      total_containers: 4,
      total_cost_usd: 28330,
      demurrage_risk_count: 2,
      avg_cost_per_unit: 18094
    }
  };
}

const TEMPLATE_TRACKING = `No_BL,No_Container,Status,ETA_Port,Free_Time_End,Cabang_Tujuan,Freight_Cost_USD,Duty_USD,THC_USD,Inland_Transport_USD
BL-2024-001,TGUU1234567,On Water,2024-08-15,2024-08-22,Jakarta,4500,1200,350,800
BL-2024-002,MSCU7654321,Berthing,2024-08-05,2024-08-12,Surabaya,3800,1000,300,600
BL-2024-003,CMAU9876543,Clearance,2024-08-02,2024-08-09,Medan,5200,1500,400,1200
BL-2024-004,HLCU1122334,On Water,2024-08-20,2024-08-27,Makassar,4800,1300,380,1000
BL-2024-005,OOLU5566778,Delivered,2024-07-20,2024-07-27,Denpasar,3500,900,280,700`;

const TEMPLATE_ALLOCATION = `No_BL,SKU,Qty,Weight_Kg,Volume_CBM
BL-2024-001,FILTER-A100,5000,2500,4.5
BL-2024-001,FILTER-B200,3000,1800,3.2
BL-2024-001,OIL-C300,2000,3000,2.8
BL-2024-002,FILTER-A100,4000,2000,3.6
BL-2024-002,BRAKE-D400,1500,2200,2.0
BL-2024-003,FILTER-A100,6000,3000,5.4
BL-2024-003,OIL-C300,3500,5250,4.9
BL-2024-004,FILTER-B200,4500,2700,4.8
BL-2024-004,BRAKE-D400,2000,2900,2.6
BL-2024-005,FILTER-A100,3000,1500,2.7
BL-2024-005,OIL-C300,2500,3750,3.5`;

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
          <button type="button" onClick={(e) => {
            e.preventDefault();
            const blob = new Blob(['\ufeff' + templateCsv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a');
            a.href = url; a.download = templateName; a.click(); URL.revokeObjectURL(url);
          }} className="mt-1 px-2 py-1 bg-primary/20 hover:bg-primary/40 text-primary text-xs rounded border border-primary/50 transition">
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
    demurrage_alerts: Array.isArray(data.demurrage_alerts) ? data.demurrage_alerts : [],
    containers: Array.isArray(data.containers) ? data.containers : [],
    sku_costs: Array.isArray(data.sku_costs) ? data.sku_costs : [],
    currency_simulations: Array.isArray(data.currency_simulations) ? data.currency_simulations : [],
    monte_carlo: data.monte_carlo || { histogram: [], p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 },
    kpi: data.kpi || { total_cost_usd: 0, avg_cost_per_unit: 0, demurrage_risk_count: 0, max_delay: 0 },
    processed_at: data.processed_at || new Date().toISOString()
  };
};

export default function LandedCostPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [trackingFile, setTrackingFile] = useState<File | null>(null);
  const [allocationFile, setAllocationFile] = useState<File | null>(null);
  const [exchangeRate, setExchangeRate] = useState(16000);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('actual');
  const [showHowTo, setShowHowTo] = useState(false);

  const handleGenerateDemo = () => {
    const demo = normalizeData(generateDemoLandedCost());
    setResults(demo);
    setExchangeRate(16000);
    try { localStorage.setItem('lastLandedCost', JSON.stringify(demo)); } catch {}
    toast.success('🎉 Data Demo Landed Cost & Demurrage Berhasil Dimuat!');
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastLandedCost');
      if (saved) {
        setResults(normalizeData(JSON.parse(saved)));
      } else {
        setResults(normalizeData(generateDemoLandedCost()));
      }
    } catch {
      setResults(normalizeData(generateDemoLandedCost()));
    }
  }, []);

  const handleAnalyze = async () => {
    if (!trackingFile || !allocationFile) {
      toast.error('Upload kedua file terlebih dahulu.');
      return;
    }
    setIsProcessing(true);
    toast.loading('Menghitung Landed Cost & Demurrage...', { id: 'lc' });
    try {
      const data = normalizeData(await uploadLandedCostFiles(trackingFile, allocationFile, exchangeRate));
      if (data) data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      try { localStorage.setItem('lastLandedCost', JSON.stringify(data)); } catch {}
      toast.success('Analisis Landed Cost selesai!', { id: 'lc' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Gagal memproses.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'lc' });
    } finally {
      setIsProcessing(false);
    }
  };

  const modifiedResults = useMemo(() => {
    if (!results) return null;
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    const mod = sc.modifier;
    const currentRate = activeScenario === 'fx_surge' ? 17200 : exchangeRate;
    const rateRatio = currentRate / 16000;
    const kpi = results.kpi || { total_cost_usd: 0, avg_cost_per_unit: 0, demurrage_risk_count: 0, max_delay: 0 };

    return {
      ...results,
      demurrage_alerts: Array.isArray(results.demurrage_alerts) ? results.demurrage_alerts : [],
      currency_simulations: Array.isArray(results.currency_simulations) ? results.currency_simulations : [],
      monte_carlo: results.monte_carlo || { histogram: [] },
      kpi: {
        ...kpi,
        total_cost_usd: Math.round(Number(kpi.total_cost_usd || 0) * mod),
        avg_cost_per_unit: Math.round(Number(kpi.avg_cost_per_unit || 0) * mod * rateRatio)
      },
      sku_costs: (results.sku_costs || []).map((s: any) => ({
        ...s,
        total_landed_usd: Math.round(Number(s.total_landed_usd) * mod),
        total_landed_idr: Math.round(Number(s.total_landed_usd) * mod * currentRate),
        cost_per_unit_idr: Math.round((Number(s.total_landed_usd) * mod * currentRate) / Number(s.qty || 1))
      })),
      containers: (results.containers || []).map((c: any) => ({
        ...c,
        total_usd: Math.round(Number(c.total_usd) * mod),
        total_idr: Math.round(Number(c.total_usd) * mod * currentRate)
      }))
    };
  }, [results, activeScenario, exchangeRate]);

  const handleExport = () => {
    if (!results?.sku_costs?.length) { toast.error('Tidak ada data'); return; }
    const lines = ['No_BL,SKU,Qty,Weight_Kg,Weight_Ratio_%,Freight_USD,Duty_USD,THC_USD,Inland_USD,Total_Landed_USD,Total_Landed_IDR,Cost_Per_Unit_IDR'];
    for (const s of results.sku_costs) {
      lines.push(`"${s.no_bl}","${s.sku}",${s.qty},${s.weight_kg},${s.weight_ratio},${s.freight_alloc_usd},${s.duty_alloc_usd},${s.thc_alloc_usd},${s.inland_alloc_usd},${s.total_landed_usd},${s.total_landed_idr},${s.cost_per_unit_idr}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = getStandardFilename("Landed_Cost_Intelligence", results?.processed_at || new Date().toISOString(), "csv");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Landed Cost report exported!');
  };

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 p-6 sm:p-8 border border-cyan-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-widest">
              <Ship className="w-3.5 h-3.5" /> SCM Analytic • Import Financial Intelligence
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              Import Landed Cost <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-300">Tracker</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Pantau posisi kontainer impor secara real-time, kalkulasi HPP per unit (Landed Cost) dengan alokasi bobot & kubikasi, serta simulasi dampak kurs valas dan risiko demurrage.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan & File' : 'Panduan & Upload File'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-cyan-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-cyan-400" /> Upload 2 File Impor & Panduan HPP
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Zap className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <FileDropZone label="1. Import Tracking (Container & BL)" file={trackingFile} onFile={setTrackingFile} onClear={() => setTrackingFile(null)}
              templateCsv={TEMPLATE_TRACKING} templateName="template_import_tracking.csv" />
            <FileDropZone label="2. SKU Allocation (Bobot & Kubikasi)" file={allocationFile} onFile={setAllocationFile} onClear={() => setAllocationFile(null)}
              templateCsv={TEMPLATE_ALLOCATION} templateName="template_sku_allocation.csv" />
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-700 font-medium">Kurs USD/IDR (Rp):</label>
              <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))}
                className="w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold text-sm" />
            </div>
            <button onClick={handleAnalyze} disabled={isProcessing || !trackingFile || !allocationFile}
              className="px-8 py-3 bg-cyan-600 text-slate-900 rounded-xl hover:bg-cyan-500 disabled:opacity-50 transition text-sm font-bold uppercase tracking-wide flex items-center gap-2 shadow-lg shadow-cyan-600/20">
              {isProcessing ? 'Memproses...' : <><Ship className="w-4 h-4" /> Hitung Landed Cost dari File</>}
            </button>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Kurs & Risiko Demurrage:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk memproyeksikan depresiasi Rupiah atau antrean dermaga!</span>
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
                  if (sc.id === 'fx_surge') setExchangeRate(17200);
                  else if (sc.id === 'actual' || sc.id === 'demurrage') setExchangeRate(16000);
                  toast.success(`Mengaktifkan ${sc.title}`);
                }}
                className={`relative group p-4 sm:p-5 rounded-2xl transition-all duration-300 text-left border overflow-hidden shadow-lg ${
                  isSelected
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-cyan-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-cyan-400'}`} />
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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-600 font-medium uppercase">Kurs Aktif:</label>
          <input
            type="number"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(Number(e.target.value))}
            className="w-28 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-cyan-400 font-mono font-bold text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {modifiedResults && (
            <button onClick={handleExport} className="px-4 py-2 bg-cyan-600 text-slate-900 rounded-xl hover:bg-cyan-500 transition text-xs sm:text-sm font-bold flex items-center gap-2 uppercase tracking-wide shadow-md">
              <Download className="w-4 h-4" /> Export Report (Excel)
            </button>
          )}
          <button
            onClick={handleGenerateDemo}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-slate-900 font-bold rounded-xl shadow-lg transition flex items-center gap-2 text-xs sm:text-sm"
          >
            <Zap className="w-4 h-4" /> Gunakan Data Demo
          </button>
        </div>
      </div>

      {/* Results */}
      {modifiedResults && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              🚢 Hasil Analisa Landed Cost & Demurrage
            </h2>
            <TimestampBadge timestamp={modifiedResults.processed_at} />
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Total Container" value={modifiedResults.kpi.total_containers} icon={<Package />} />
            <KPICard title="Total Cost" value={`$${Number(modifiedResults.kpi.total_cost_usd).toLocaleString('en-US')}`} icon={<DollarSign />} />
            <KPICard title="Demurrage Risk" value={modifiedResults.kpi.demurrage_risk_count} icon={<AlertTriangle />} isAlert={modifiedResults.kpi.demurrage_risk_count > 0} />
            <KPICard title="Avg HPP/Unit" value={`Rp ${Number(modifiedResults.kpi.avg_cost_per_unit).toLocaleString('id-ID')}`} icon={<DollarSign />} />
          </div>

          {/* Demurrage Alerts */}
          {(modifiedResults.demurrage_alerts || []).length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Demurrage Risk Alert
              </h3>
              {(modifiedResults.demurrage_alerts || []).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-border/30 last:border-0">
                  <div className={`px-3 py-1 rounded text-xs font-bold uppercase ${
                    a.urgency === 'CRITICAL' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-500'
                  }`}>{a.urgency}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {a.urgency === 'CRITICAL' ? '🚨' : '⚠️'} Container {a.no_container} (BL: {a.no_bl})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.days_remaining === 0 ? 'Free time SUDAH HABIS!' : `H-${a.days_remaining} batas free time (${a.free_time_end})`}. Tujuan: {a.cabang}
                    </p>
                  </div>
                </div>
              ))}
            </GlassCard>
          )}

          {/* Container Status */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Status Kontainer Impor</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border font-bold tracking-wider">
                  <tr>
                    <th className="px-3 py-3">No BL</th>
                    <th className="px-3 py-3">Container</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">ETA</th>
                    <th className="px-3 py-3">Tujuan</th>
                    <th className="px-3 py-3 text-right">Free Time</th>
                    <th className="px-3 py-3 text-right">Total USD</th>
                    <th className="px-3 py-3 text-right">Total IDR</th>
                  </tr>
                </thead>
                <tbody>
                  {(modifiedResults.containers || []).map((c: any, i: number) => (
                    <tr key={i} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${c.is_demurrage_risk ? 'bg-destructive/5' : ''}`}>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{c.no_bl}</td>
                      <td className="px-3 py-2.5 font-medium">{c.no_container}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          c.status === 'Delivered' ? 'bg-green-500/20 text-green-400' :
                          c.status === 'Clearance' ? 'bg-yellow-500/20 text-yellow-400' :
                          c.status === 'Berthing' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-cyan-500/20 text-cyan-400'
                        }`}>{c.status}</span>
                      </td>
                      <td className="px-3 py-2.5">{c.eta_port}</td>
                      <td className="px-3 py-2.5">{c.cabang_tujuan}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={c.is_demurrage_risk ? 'text-destructive font-bold' : ''}>
                          {c.days_to_free_time} hari
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">${Number(c.total_usd).toLocaleString('en-US')}</td>
                      <td className="px-3 py-2.5 text-right font-medium">Rp {Number(c.total_idr).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Landed Cost per SKU */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Landed Cost Breakdown per SKU ({(modifiedResults.sku_costs || []).length} items)
            </h3>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider z-10">
                  <tr>
                    <th className="px-3 py-3">BL</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-right">Weight</th>
                    <th className="px-3 py-3 text-right">Ratio%</th>
                    <th className="px-3 py-3 text-right">Landed USD</th>
                    <th className="px-3 py-3 text-right">Landed IDR</th>
                    <th className="px-3 py-3 text-right font-bold">HPP/Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {(modifiedResults.sku_costs || []).map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">{s.no_bl}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{s.sku}</td>
                      <td className="px-3 py-2.5 text-right">{Number(s.qty).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">{s.weight_kg} kg</td>
                      <td className="px-3 py-2.5 text-right">{s.weight_ratio}%</td>
                      <td className="px-3 py-2.5 text-right">${Number(s.total_landed_usd).toLocaleString('en-US')}</td>
                      <td className="px-3 py-2.5 text-right">Rp {Number(s.total_landed_idr).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-primary">Rp {Number(s.cost_per_unit_idr).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Currency Simulation */}
          {(modifiedResults.currency_simulations || []).length > 0 && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Simulasi Dampak Kurs Valas terhadap Total HPP
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modifiedResults.currency_simulations || []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="rate" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`]} />
                    <Bar dataKey="total_idr" name="Total HPP (IDR)" radius={[4, 4, 0, 0]}>
                      {(modifiedResults.currency_simulations || []).map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.is_current ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Bar berwarna = kurs aktif (Rp {exchangeRate.toLocaleString('id-ID')}). Setiap kenaikan Rp 500 berdampak langsung ke HPP semua SKU.
              </p>
            </GlassCard>
          )}

          {/* Monte Carlo */}
          {modifiedResults.monte_carlo?.histogram && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Monte Carlo Simulation — Lead Time Kedatangan Impor
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modifiedResults.monte_carlo.histogram} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="bin" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Hari', position: 'insideBottom', offset: -2 }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                    <Bar dataKey="count" name="Frekuensi" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                {['p50', 'p75', 'p90', 'p95', 'p99'].map((p) => (
                  <div key={p} className="text-center p-2 bg-muted/30 rounded border border-border">
                    <p className="text-xs text-muted-foreground uppercase">{p.toUpperCase()}</p>
                    <p className="text-lg font-bold text-foreground">{modifiedResults.monte_carlo[p]} hr</p>
                  </div>
                ))}
              </div>
              {modifiedResults.monte_carlo.recommendation && (
                <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-foreground">💡 {modifiedResults.monte_carlo.recommendation}</p>
                </div>
              )}
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
