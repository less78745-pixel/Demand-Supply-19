"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  ShieldCheck, AlertTriangle, TrendingUp, Package,
  Download, Activity, Layers, CheckCircle, XCircle, Info, Zap, HelpCircle, FileSpreadsheet, Clock
, Cloud } from 'lucide-react';
import { uploadSafetyStockFile } from '@/lib/api';
import toast from 'react-hot-toast';
import { getStandardFilename } from '@/utils/export';
import { supabase } from '@/lib/supabase';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

type ScenarioType = 'actual' | 'surge' | 'delay';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Evaluasi Safety Stock Aktual & ROP (95% Service Level)',
    desc: 'Kalkulasi safety stock dan reorder point standar berdasarkan variasi demand historis dan lead time pengiriman reguler.',
    color: 'from-indigo-600 to-blue-500',
    icon: ShieldCheck,
    modifier: 1.0
  },
  {
    id: 'surge' as ScenarioType,
    title: 'Jalur 2: Simulasi Lonjakan Demand (+30% Safety Buffer)',
    desc: 'Meningkatkan cadangan pengaman (Safety Stock) untuk mengantisipasi musim puncak atau promosi masif di cabang strategis.',
    color: 'from-amber-600 to-orange-500',
    icon: TrendingUp,
    modifier: 1.3
  },
  {
    id: 'delay' as ScenarioType,
    title: 'Jalur 3: Simulasi Disrupsi Lead Time Vendor (+50% Safety Buffer)',
    desc: 'Simulasi stress-test jika waktu kirim vendor memanjang akibat hambatan impor, kendala pelabuhan, atau cuaca buruk.',
    color: 'from-rose-600 to-red-500',
    icon: Clock,
    modifier: 1.5
  }
];

function generateDemoSafetyStock() {
  const sampleData = [
    { cabang: 'Jakarta', sku: 'SKU-001 (Mainboard)', adu: 150, std_usage: 25, lead_time: 7, safety_stock: 120, rop: 1170, current_stock: 800, net_flow: 950, dos: 6.3, status: 'WARNING', needs_reorder: true },
    { cabang: 'Surabaya', sku: 'SKU-002 (Power Supply)', adu: 120, std_usage: 18, lead_time: 10, safety_stock: 145, rop: 1345, current_stock: 1600, net_flow: 1750, dos: 14.5, status: 'SAFE', needs_reorder: false },
    { cabang: 'Medan', sku: 'SKU-003 (Display Screen)', adu: 100, std_usage: 22, lead_time: 14, safety_stock: 180, rop: 1580, current_stock: 450, net_flow: 650, dos: 6.5, status: 'CRITICAL', needs_reorder: true },
    { cabang: 'Makassar', sku: 'SKU-001 (Mainboard)', adu: 70, std_usage: 15, lead_time: 18, safety_stock: 160, rop: 1420, current_stock: 2200, net_flow: 2300, dos: 32.8, status: 'OVERSTOCK', needs_reorder: false },
    { cabang: 'Bali', sku: 'SKU-004 (Audio Module)', adu: 95, std_usage: 14, lead_time: 8, safety_stock: 90, rop: 850, current_stock: 920, net_flow: 1040, dos: 10.9, status: 'SAFE', needs_reorder: false }
  ];

  const z_data = [
    { cabang: 'Jakarta', red_zone: 450, yellow_zone: 600, green_zone: 400, net_flow: 950 },
    { cabang: 'Surabaya', red_zone: 550, yellow_zone: 800, green_zone: 600, net_flow: 1750 },
    { cabang: 'Medan', red_zone: 620, yellow_zone: 900, green_zone: 500, net_flow: 650 },
    { cabang: 'Makassar', red_zone: 500, yellow_zone: 700, green_zone: 500, net_flow: 2300 },
    { cabang: 'Bali', red_zone: 350, yellow_zone: 500, green_zone: 380, net_flow: 1040 }
  ];

  const lt_matrix = [
    { cabang: 'Makassar', avg_lead_time: 18, max_lead_time: 25 },
    { cabang: 'Medan', avg_lead_time: 14, max_lead_time: 21 },
    { cabang: 'Surabaya', avg_lead_time: 10, max_lead_time: 14 },
    { cabang: 'Bali', avg_lead_time: 8, max_lead_time: 12 },
    { cabang: 'Jakarta', avg_lead_time: 7, max_lead_time: 10 },
  ];

  const sl_sims = [
    { service_level: '90%', total_safety_stock: 510 },
    { service_level: '95%', total_safety_stock: 695 },
    { service_level: '98%', total_safety_stock: 980 },
    { service_level: '99%', total_safety_stock: 1310 },
  ];

  return {
    processed_at: new Date().toISOString(),
    results: sampleData,
    zone_data: z_data,
    lead_time_matrix: lt_matrix,
    service_level_simulations: sl_sims,
    kpi: { total_skus: 5, critical_count: 1, warning_count: 1, safe_count: 2, avg_safety_stock: 139, service_level: '95%' }
  };
}

const STATUS_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  WARNING: '#f59e0b',
  SAFE: '#22c55e',
  OVERSTOCK: '#3b82f6',
};

const TEMPLATE_CSV = `Cabang,SKU,Daily_Usage,Lead_Time_Days,Current_Stock,In_Transit,Backorder,MOQ,Order_Cycle_Days
Jakarta,SKU-001,150,7,800,200,50,100,14
Jakarta,SKU-002,80,7,300,0,0,50,14
Jakarta,SKU-003,200,7,1500,500,100,200,14
Surabaya,SKU-001,120,10,600,150,30,100,14
Surabaya,SKU-002,60,10,200,0,0,50,14
Surabaya,SKU-003,180,10,1200,300,80,200,14
Bandung,SKU-001,90,5,400,100,20,100,14
Bandung,SKU-002,45,5,150,0,0,50,14
Medan,SKU-001,100,14,500,200,40,100,14
Medan,SKU-002,55,14,180,0,0,50,14
Medan,SKU-003,130,14,900,250,60,200,14
Semarang,SKU-001,85,6,350,80,15,100,14
Makassar,SKU-001,70,18,250,100,25,100,14
Makassar,SKU-002,40,18,120,0,0,50,14
Palembang,SKU-001,65,12,280,80,20,100,14
Denpasar,SKU-001,95,8,420,120,30,100,14
Balikpapan,SKU-001,55,15,200,80,15,100,14
Manado,SKU-001,35,21,100,50,10,50,14
Pontianak,SKU-001,45,16,160,60,12,50,14
Banjarmasin,SKU-001,50,14,180,70,14,50,14
Lampung,SKU-001,60,9,260,90,18,100,14
Padang,SKU-001,40,13,140,50,10,50,14
Pekanbaru,SKU-001,48,12,170,55,11,50,14
Jambi,SKU-001,30,13,100,40,8,50,14
Bengkulu,SKU-001,25,15,80,30,6,50,14
Mataram,SKU-001,38,10,130,45,9,50,14
Kupang,SKU-001,20,22,60,20,5,50,14
Ambon,SKU-001,18,25,50,15,4,50,14
Jayapura,SKU-001,15,28,40,10,3,50,14
Sorong,SKU-001,12,26,35,8,2,50,14
Ternate,SKU-001,10,24,30,8,2,50,14
Kendari,SKU-001,28,19,90,35,7,50,14
Palu,SKU-001,32,17,110,40,8,50,14
Gorontalo,SKU-001,22,20,70,25,5,50,14
Cirebon,SKU-001,75,5,320,100,20,100,14
Yogyakarta,SKU-001,88,6,370,110,22,100,14`;

const normalizeData = (data: any) => {
  if (!data) return null;
  return {
    ...data,
    results: Array.isArray(data.results) ? data.results : [],
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    service_level_simulations: Array.isArray(data.service_level_simulations) ? data.service_level_simulations : [],
    zone_data: Array.isArray(data.zone_data) ? data.zone_data : [],
    lead_time_matrix: Array.isArray(data.lead_time_matrix) ? data.lead_time_matrix : [],
    kpi: data.kpi || { total_skus: 0, critical_count: 0, warning_count: 0, safe_count: 0, avg_safety_stock: 0, service_level: '95%' },
    processed_at: data.processed_at || new Date().toISOString(),
  };
};

export default function SafetyStockPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [serviceLevel, setServiceLevel] = useState(0.95);
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['All']);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('actual');
  const [showHowTo, setShowHowTo] = useState(false);

  const handleSaveToGlobal = async () => {
    if (!results) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...results, processed_at: timestamp };
    sessionStorage.setItem('last_processed_at_safety_stock', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'safety_stock', result_json: JSON.stringify(dataCopy) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = normalizeData(generateDemoSafetyStock());
    setResults(demo);
    try { localStorage.setItem('lastSafetyStock', JSON.stringify(demo)); } catch {}
    toast.success('🎉 Data Demo Safety Stock & ROP Berhasil Dimuat!');
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: dbData, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'safety_stock')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (dbData && dbData.length > 0) {
          const row = dbData[0];
          const parsed = JSON.parse(row.result_json);
          parsed.processed_at = row.created_at;
          setResults(normalizeData(parsed));
        } else {
          setResults(normalizeData(generateDemoSafetyStock()));
        }
      } catch (err) {
        setResults(normalizeData(generateDemoSafetyStock()));
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('safety_stock_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.safety_stock' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.processed_at = payload.new.created_at;
            
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_safety_stock');
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
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Menghitung Safety Stock & ROP...', { id: 'ss' });
    try {
      const data = normalizeData(await uploadSafetyStockFile(file));
      if (data) data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      sessionStorage.setItem('last_processed_at_safety_stock', data.processed_at);
      try { localStorage.setItem('lastSafetyStock', JSON.stringify(data)); } catch {}
      toast.success('Analisis Safety Stock selesai!', { id: 'ss' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Gagal memproses file.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'ss' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Filters ──
  const allCabangs = useMemo(() => {
    if (!Array.isArray(results?.results)) return ['All'];
    const s = new Set<string>();
    results.results.forEach((r: any) => s.add(r.cabang));
    return ['All', ...Array.from(s).sort()];
  }, [results]);

  const statusOptions = ['All', 'CRITICAL', 'WARNING', 'SAFE', 'OVERSTOCK'];

  const filtered = useMemo(() => {
    if (!Array.isArray(results?.results)) return [];
    const mod = SCENARIOS.find(s => s.id === activeScenario)?.modifier || 1.0;
    return results.results.filter((r: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(r.cabang)) &&
      (selectedStatus.includes('All') || selectedStatus.includes(r.status))
    ).map((r: any) => ({
      ...r,
      safety_stock: Math.round(Number(r.safety_stock || 0) * mod),
      rop: Math.round((Number(r.rop || 0) - Number(r.safety_stock || 0)) + (Number(r.safety_stock || 0) * mod)),
    }));
  }, [results, selectedCabang, selectedStatus, activeScenario]);

  // ── DDMRP Zone chart data ──
  const zoneChartData = useMemo(() => {
    if (!Array.isArray(results?.zone_data)) return [];
    const cabangMap: Record<string, { red: number; yellow: number; green: number; net_flow: number; count: number }> = {};
    for (const z of results.zone_data) {
      if (!selectedCabang.includes('All') && !selectedCabang.includes(z.cabang)) continue;
      if (!cabangMap[z.cabang]) cabangMap[z.cabang] = { red: 0, yellow: 0, green: 0, net_flow: 0, count: 0 };
      cabangMap[z.cabang].red += (Number(z.red_zone) || Number(z.red) || 0);
      cabangMap[z.cabang].yellow += (Number(z.yellow_zone) || Number(z.yellow) || 0);
      cabangMap[z.cabang].green += (Number(z.green_zone) || Number(z.green) || 0);
      cabangMap[z.cabang].net_flow += (Number(z.net_flow) || 0);
      cabangMap[z.cabang].count++;
    }
    return Object.entries(cabangMap).map(([cab, v]) => ({
      cabang: cab,
      'Red Zone': Math.round(v.red),
      'Yellow Zone': Math.round(v.yellow),
      'Green Zone': Math.round(v.green),
      'Net Flow': Math.round(v.net_flow),
    }));
  }, [results, selectedCabang]);

  // ── Lead Time Matrix chart ──
  const ltChartData = useMemo(() => {
    if (!Array.isArray(results?.lead_time_matrix)) return [];
    return results.lead_time_matrix
      .filter((lt: any) => selectedCabang.includes('All') || selectedCabang.includes(lt.cabang))
      .sort((a: any, b: any) => b.avg_lead_time - a.avg_lead_time);
  }, [results, selectedCabang]);

  // ── CSV Export ──
  const handleExport = () => {
    if (!filtered.length) { toast.error('Tidak ada data untuk di-export'); return; }
    const lines: string[] = [];
    lines.push('Cabang,SKU,ADU,Std_Usage,Lead_Time,Safety_Stock,ROP,Current_Stock,Net_Flow,DoS,Status,Needs_Reorder');
    for (const r of filtered) {
      lines.push(`"${r.cabang}","${r.sku}",${r.adu},${r.std_usage},${r.lead_time},${r.safety_stock},${r.rop},${r.current_stock},${r.net_flow},${r.dos},${r.status},${r.needs_reorder}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getStandardFilename("Safety_Stock", results?.processed_at || new Date().toISOString(), "csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Safety Stock report exported!');
  };

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 border border-indigo-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" /> SCM Analytic • Inventory Protection
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              Dynamic <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-blue-300 to-cyan-300">Safety Stock & ROP</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Kalkulasi cadangan pengaman (Safety Stock) dan titik pemesanan ulang (Reorder Point) secara dinamis memadukan variabilitas demand dan fluktuasi lead time pengiriman per SKU per Cabang.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & DEMO DATA SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-indigo-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Panduan Upload & Parameter Safety Stock
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">📌 Skema Kolom Upload (Excel / CSV):</h4>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {['Cabang','SKU','Daily_Usage','Lead_Time_Days','Current_Stock','In_Transit','Backorder','MOQ','Order_Cycle_Days'].map(col => (
                  <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span>{col}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">⚙️ Z-Score & Net Flow Position:</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Secara default diset untuk Service Level 95% (Z = 1.65). Net Flow Position dihitung melalui rumus <code>Current Stock + In Transit - Backorder</code>. Sistem memberikan alert otomatis jika Net Flow ≤ ROP.
              </p>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-indigo-400" />
                <span>Diproses menggunakan ArrayBuffer parser agar pembacaan Excel (XLSX) 100% stabil.</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Variabilitas Demand & Lead Time:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk memproyeksikan lonjakan permintaan atau keterlambatan suplai!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-indigo-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-indigo-400'}`} />
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

      {/* ─── UPLOAD BOX WHEN RESULTS PRESENT OR HIDDEN ─── */}
      <GlassCard className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isProcessing}
            label="Upload Dataset Safety Stock (Excel / CSV)"
            description="File Excel atau CSV: Cabang, SKU, Daily_Usage, Lead_Time_Days, Current_Stock, In_Transit, Backorder."
            templateCsv={TEMPLATE_CSV}
            templateName="template_safety_stock.csv"
          />
        </div>
        <div className="sm:border-l border-slate-200 sm:pl-4 flex flex-col justify-center items-center shrink-0">
          <button
            onClick={handleGenerateDemo}
            className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-slate-900 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
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
      </GlassCard>

      {/* Results */}
      {results && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              🛡️ Hasil Analisa Safety Stock & DDMRP
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <KPICard title="Total SKU" value={results.kpi.total_skus} icon={<Package />} />
            <KPICard title="Critical" value={results.kpi.critical_count} icon={<XCircle />} isAlert={results.kpi.critical_count > 0} />
            <KPICard title="Warning" value={results.kpi.warning_count} icon={<AlertTriangle />} />
            <KPICard title="Safe" value={results.kpi.safe_count} icon={<CheckCircle />} />
            <KPICard title="Avg Safety Stock" value={results.kpi.avg_safety_stock} icon={<ShieldCheck />} />
          </div>

          {/* Service Level Simulation */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Simulasi Service Level — Dampak terhadap Total Safety Stock
            </h3>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results.service_level_simulations || []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="service_level" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                  <Bar dataKey="total_safety_stock" name="Total Safety Stock" radius={[4, 4, 0, 0]}>
                    {(results.service_level_simulations || []).map((entry: any, idx: number) => (
                      <Cell key={idx} fill={entry.service_level === results.kpi.service_level ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Bar berwarna menunjukkan service level aktif ({results.kpi.service_level}). Semakin tinggi target, semakin besar modal inventori yang dibutuhkan.
            </p>
          </GlassCard>

          {/* DDMRP Zone Chart */}
          {zoneChartData.length > 0 && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                DDMRP Buffer Zones per Cabang
              </h3>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={zoneChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="cabang" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                    <Legend />
                    <Bar dataKey="Red Zone" stackId="zones" fill="#ef4444" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Yellow Zone" stackId="zones" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Green Zone" stackId="zones" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {/* Lead Time Matrix */}
          {ltChartData.length > 0 && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Lead Time Matrix — Central WH ke 28 Cabang
              </h3>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ltChartData} layout="vertical" margin={{ top: 10, right: 20, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={false} unit=" hari" />
                    <YAxis type="category" dataKey="cabang" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} width={75} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                    <Legend />
                    <Bar dataKey="avg_lead_time" name="Avg Lead Time" radius={[0, 4, 4, 0]}>
                      {ltChartData.map((entry: any, idx: number) => (
                        <Cell key={idx} fill={entry.avg_lead_time > 20 ? '#ef4444' : entry.avg_lead_time > 12 ? '#f59e0b' : '#22c55e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {/* Alerts Table */}
          {(results.alerts || []).length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Reorder Alerts — Cabang Butuh Pengisian Segera
              </h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                  <thead className="text-xs text-foreground uppercase bg-destructive/10 border-b border-destructive/20 sticky top-0 font-bold tracking-wider z-10">
                    <tr>
                      <th className="px-4 py-3">Cabang</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">ROP</th>
                      <th className="px-4 py-3 text-right">Defisit</th>
                      <th className="px-4 py-3 text-right">Order Qty</th>
                      <th className="px-4 py-3 text-right">DoS</th>
                      <th className="px-4 py-3">Urgency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(results.alerts || [])
                      .filter((a: any) => selectedCabang.includes('All') || selectedCabang.includes(a.cabang))
                      .map((a: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-destructive/10 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">{a.cabang}</td>
                        <td className="px-4 py-3 font-medium">{a.sku}</td>
                        <td className="px-4 py-3 text-right">{a.current_stock}</td>
                        <td className="px-4 py-3 text-right">{a.rop}</td>
                        <td className="px-4 py-3 text-right text-destructive font-bold">{a.deficit}</td>
                        <td className="px-4 py-3 text-right font-bold text-primary">{a.suggested_order_qty}</td>
                        <td className="px-4 py-3 text-right">{a.days_of_supply}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            a.urgency === 'URGENT' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-500'
                          }`}>
                            {a.urgency}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Detail Results Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Detail Hasil Kalkulasi ({filtered.length} items)
            </h3>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-slate-700 dark:text-slate-300">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider z-10">
                  <tr>
                    <th className="px-3 py-3">Cabang</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3 text-right">ADU</th>
                    <th className="px-3 py-3 text-right">LT</th>
                    <th className="px-3 py-3 text-right">Safety Stock</th>
                    <th className="px-3 py-3 text-right">ROP</th>
                    <th className="px-3 py-3 text-right">Stock</th>
                    <th className="px-3 py-3 text-right">Net Flow</th>
                    <th className="px-3 py-3 text-right">DoS</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-foreground">{r.cabang}</td>
                      <td className="px-3 py-2.5 font-medium">{r.sku}</td>
                      <td className="px-3 py-2.5 text-right">{r.adu}</td>
                      <td className="px-3 py-2.5 text-right">{r.lead_time} hr</td>
                      <td className="px-3 py-2.5 text-right font-medium">{r.safety_stock}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{r.rop}</td>
                      <td className="px-3 py-2.5 text-right">{r.current_stock}</td>
                      <td className="px-3 py-2.5 text-right">{r.net_flow}</td>
                      <td className="px-3 py-2.5 text-right">{r.dos}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase" style={{
                          backgroundColor: `${STATUS_COLORS[r.status]}20`,
                          color: STATUS_COLORS[r.status],
                        }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Re-upload */}
          <div className="flex justify-end pt-4">
            <div className="w-full max-w-sm ml-auto">
              <GlassCard className="p-3">
                <FileUploader
                  onFileUpload={handleFileUpload}
                  isLoading={isProcessing}
                  label="Upload Ulang Data"
                  description="Upload file baru untuk menghitung ulang."
                  templateCsv={TEMPLATE_CSV}
                  templateName="template_safety_stock.csv"
                />
              </GlassCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
