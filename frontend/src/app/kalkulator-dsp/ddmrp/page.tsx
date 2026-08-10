/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { DDMRPBufferChart } from '@/components/charts/DDMRPBufferChart';
import {
  Layers, Activity, TrendingDown, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, BookOpen, Cpu, Package, Truck,
  Info, ShieldCheck, BarChart3, Calculator, FileSpreadsheet, Cloud } from 'lucide-react';
import { analyzeDDMRPManual, uploadDDMRPFile } from '@/lib/api';
import toast from 'react-hot-toast';
import { FileUploader } from '@/components/ui/FileUploader';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { exportToExcel } from '@/utils/export';
import { supabase } from '@/lib/supabase';

// ═══════════════════════════════════════════════
//  LITERATURE REFERENCE DATA
// ═══════════════════════════════════════════════

const DDMRP_FORMULAS = [
  { title: 'ADU (Average Daily Usage)', formula: 'ADU = Σ(sales) / total_days', desc: 'Rata-rata pemakaian harian sebagai basis perhitungan buffer.' },
  { title: 'CoV (Coefficient of Variation)', formula: 'CoV = σ / μ', desc: 'Rasio standar deviasi terhadap rata-rata — mengukur variabilitas demand.' },
  { title: 'Red Zone', formula: 'Red = (ADU × DLT × LTF) + (ADU × DLT × LTF × VF)', desc: 'Zona safety buffer — terdiri dari Red Base + Red Safety.' },
  { title: 'Yellow Zone', formula: 'Yellow = ADU × DLT', desc: 'Zona normal replenishment — proporsional terhadap lead time.' },
  { title: 'Green Zone', formula: 'Green = max(ADU × DLT × LTF, ADU × OC, MOQ)', desc: 'Zona order quantity minimum — memastikan efisiensi order.' },
  { title: 'Net Flow Position', formula: 'NFP = On-hand + On-order − Qualified Demand', desc: 'Posisi stok bersih — penentu keputusan replenishment.' },
];

const DDMRP_LITERATURE = [
  'Tren 2023–2025: Machine Learning digunakan untuk dynamic buffer sizing — buffer otomatis menyesuaikan berdasarkan pola demand real-time.',
  'Reinforcement Learning untuk replenishment cerdas — menggantikan parameter statis DDMRP klasik dengan keputusan berbasis reward optimization.',
  'CoV dihitung dari standar deviasi permintaan/supply dan menjadi basis Variability Factor dalam penentuan buffer.',
  'Trigger replenishment order pada buffer DDMRP menggunakan Net Flow Equation: On-hand + On-order – Qualified Sales Order Demand = NFP.',
  'Buffer dibagi 3 zona (Red/Yellow/Green) ditentukan oleh ADU, Lead Time Factor, dan Variability Factor.',
];

type ScenarioType = 'actual' | 'surge' | 'disruption';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Evaluasi Buffer Aktual (Net Flow Position)',
    desc: 'Perhitungan status zona Red/Yellow/Green riil berdasarkan posisi stok on-hand, on-order, dan qualified demand saat ini.',
    color: 'from-blue-600 to-indigo-500',
    icon: Layers,
    modifier: 'actual'
  },
  {
    id: 'surge' as ScenarioType,
    title: 'Jalur 2: Simulasi Lonjakan Demand (+30% ADU)',
    desc: 'Uji ketahanan buffer apabila terjadi lonjakan konsumsi harian (ADU) atau pesanan prioritas masif secara tiba-tiba.',
    color: 'from-amber-600 to-orange-500',
    icon: TrendingUp,
    modifier: 'surge'
  },
  {
    id: 'disruption' as ScenarioType,
    title: 'Jalur 3: Simulasi Keterlambatan Suplai (+5 Hari DLT)',
    desc: 'Simulasi dampak keterlambatan kedatangan barang dari vendor atau pengiriman ekspedisi terhadap penetrasi Red Zone.',
    color: 'from-rose-600 to-red-500',
    icon: AlertTriangle,
    modifier: 'disruption'
  }
];

function generateDemoDDMRP() {
  const skus = [
    { label: 'SKU-ELC-001 (Microprocessor)', cabang: 'Jakarta', kategori: 'Electronics', adu: 120, dlt: 14, oh: 1800, oo: 500, qd: 400 },
    { label: 'SKU-APP-009 (Cotton Denim)', cabang: 'Surabaya', kategori: 'Apparel', adu: 85, dlt: 10, oh: 450, oo: 200, qd: 600 },
    { label: 'SKU-AUT-042 (Brake Pad Set)', cabang: 'Bali', kategori: 'Automotive', adu: 40, dlt: 21, oh: 1200, oo: 0, qd: 150 },
    { label: 'SKU-BLD-015 (Ceramic Tiles)', cabang: 'Medan', kategori: 'Building', adu: 210, dlt: 7, oh: 3500, oo: 1500, qd: 800 },
  ];

  const resultsArray = skus.map(s => {
    const red = Math.round(s.adu * s.dlt * 0.5);
    const yellow = Math.round(s.adu * s.dlt);
    const green = Math.round(s.adu * 7);
    const nfp = s.oh + s.oo - s.qd;
    let urgency = 'normal';
    let status = 'YELLOW (Reorder)';
    if (nfp <= red) { urgency = 'high'; status = 'RED (Critical Order)'; }
    else if (nfp >= red + yellow) { urgency = 'low'; status = 'GREEN (Stock OK)'; }

    return {
      label: s.label,
      cabang: s.cabang,
      kategori: s.kategori,
      adu: s.adu,
      on_hand: s.oh,
      on_order: s.oo,
      qualified_demand: s.qd,
      net_flow_position: nfp,
      lead_time: { value: s.dlt },
      zones: { red, yellow, green, red_zone: red, yellow_zone: yellow, green_zone: green, top_of_red: red, top_of_yellow: red + yellow, top_of_green: red + yellow + green },
      buffer_zones: { red, yellow, green, red_zone: red, yellow_zone: yellow, green_zone: green, top_of_red: red, top_of_yellow: red + yellow, top_of_green: red + yellow + green },
      replenishment: { status, urgency, suggested_order_qty: Math.max(0, red + yellow + green - nfp) }
    };
  });

  return {
    processed_at: new Date().toISOString(),
    results: resultsArray,
    summary: { total_skus: 4, critical: 1, reorder: 2, ok: 1 }
  };
}

export default function DDMRPPage() {
  const [results, setResults] = useState<any>(null);
  const [filterCabang, setFilterCabang] = useState<string[]>(['All']);
  const [filterKategori, setFilterKategori] = useState<string[]>(['All']);
  const [filterSku, setFilterSku] = useState<string[]>(['All']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const [showLiterature, setShowLiterature] = useState(false);
  const [activeMode, setActiveMode] = useState<'manual' | 'file'>('file');
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
    sessionStorage.setItem('last_processed_at_ddmrp', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'ddmrp', result_json: JSON.stringify(dataCopy) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = generateDemoDDMRP();
    setResults(demo);
    try { set('last_ddmrp_result', demo); } catch(e){}
    toast.success('🎉 Data Demo DDMRP Klasik Berhasil Dimuat!');
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: dbData, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'ddmrp')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (dbData && dbData.length > 0) {
          const row = dbData[0];
          const parsed = JSON.parse(row.result_json);
          parsed.processed_at = row.created_at;
          setResults(parsed);
        } else {
          setResults(generateDemoDDMRP());
        }
      } catch (err) {
        setResults(generateDemoDDMRP());
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('ddmrp_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.ddmrp' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.processed_at = payload.new.created_at;
            
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_ddmrp');
            if (lastProcessedAt === newData.processed_at) return;

            setResults(newData);
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

  // Form state
  const [form, setForm] = useState({
    adu: 50,
    dlt_days: 14,
    moq: 10,
    order_cycle_days: 7,
    on_hand: 200,
    on_order: 0,
    qualified_demand: 50,
    cov_override: 0.40,
  });

  const updateForm = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleAnalyze = async () => {
    setIsProcessing(true);
    toast.loading('Menghitung buffer DDMRP...', { id: 'ddmrp' });

    try {
      const data = await analyzeDDMRPManual(form);
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      sessionStorage.setItem('last_processed_at_ddmrp', data.processed_at);
      toast.success('Analisis DDMRP selesai!', { id: 'ddmrp' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal menghitung DDMRP.', { id: 'ddmrp' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Memproses file DDMRP...', { id: 'ddmrp' });
    try {
      const { adu, cov_override, ...restParams } = form; // Don't pass manual ADU/CoV
      const data = await uploadDDMRPFile(file, restParams);
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      sessionStorage.setItem('last_processed_at_ddmrp', data.processed_at);
      toast.success('Analisis DDMRP dari file selesai!', { id: 'ddmrp' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal memproses file.', { id: 'ddmrp' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">🚨 URGENT</span>;
      case 'normal':
        return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">📦 ORDER</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✅ OK</span>;
    }
  };

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 sm:p-8 border border-blue-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
              <Layers className="w-3.5 h-3.5" /> Kalkulator DSP • Demand Driven MRP (Phase 1)
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              DDMRP — <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300">Demand Driven MRP</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Buffer positioning & replenishment cerdas berbasis Net Flow Position. Mencegah bullwhip effect melalui penempatan buffer inventaris strategis (Red, Yellow, Green).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & DEMO DATA SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-blue-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-400" /> Panduan Upload & Rumus DDMRP
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <Cpu className="w-4 h-4" /> Gunakan Data Demo
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
              <h4 className="font-semibold text-slate-900 mb-2">📌 Skema Kolom Upload File:</h4>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {['Bulan','Deskripsi','Cabang','Kategori','Penjualan','Lead Time (Hari)','MOQ','Order Cycle (Hari)','On-Hand','On-Order','Qualified Demand'].map(col => (
                  <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span>{col}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">⚙️ Net Flow Position & Buffer Sizing:</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Persamaan Net Flow (<code>On-Hand + On-Order - Qualified Demand</code>) menentukan status pemesanan. Bila turun ke zona Merah atau Kuning, sistem menghasilkan rekomendasi order kuantitas cerdas.
              </p>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-blue-400" />
                <span>Mendukung upload format Excel (XLSX) dengan parser modern.</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Pilih 3 Jalur Evaluasi & Simulasi Stress-Test Buffer:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk memproyeksikan lonjakan ADU atau delay lead time!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-blue-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-blue-400'}`} />
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

      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        <div className="md:col-span-2 flex flex-col">
          <GlassCard className="h-full flex flex-col justify-between">
            <div>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-border">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Parameter & Input Data</h2>
                <div className="flex gap-2 bg-muted/30 p-1 rounded-lg border border-border">
                  <button
                    onClick={() => setActiveMode('manual')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeMode === 'manual' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    Input Manual
                  </button>
                  <button
                    onClick={() => setActiveMode('file')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeMode === 'file' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    Upload File
                  </button>
                </div>
              </div>

              {activeMode === 'manual' ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { key: 'adu', label: 'ADU (unit/hari)', icon: <Activity className="w-3.5 h-3.5" /> },
                      { key: 'dlt_days', label: 'Lead Time (hari)', icon: <Truck className="w-3.5 h-3.5" /> },
                      { key: 'moq', label: 'MOQ (unit)', icon: <Package className="w-3.5 h-3.5" /> },
                      { key: 'order_cycle_days', label: 'Order Cycle (hari)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                      { key: 'on_hand', label: 'On-Hand (unit)', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                      { key: 'on_order', label: 'On-Order (unit)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                      { key: 'qualified_demand', label: 'Qualified Demand', icon: <TrendingDown className="w-3.5 h-3.5" /> },
                      { key: 'cov_override', label: 'CoV (0-1)', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
                    ].map(({ key, label, icon }) => (
                      <div key={key}>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          {icon} {label}
                        </label>
                        <input
                          type="number"
                          step={key === 'cov_override' ? '0.05' : '1'}
                          value={(form as any)[key]}
                          onChange={e => updateForm(key, e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleAnalyze}
                    disabled={isProcessing}
                    className="mt-6 w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        Menghitung...
                      </>
                    ) : (
                      <>
                        <Cpu className="w-4 h-4" />
                        Hitung
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { key: 'dlt_days', label: 'Default Lead Time', icon: <Truck className="w-3.5 h-3.5" /> },
                      { key: 'moq', label: 'Default MOQ', icon: <Package className="w-3.5 h-3.5" /> },
                      { key: 'order_cycle_days', label: 'Default Order Cycle', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                      { key: 'on_hand', label: 'Default On-Hand', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                    ].map(({ key, label, icon }) => (
                      <div key={key}>
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                          {icon} {label}
                        </label>
                        <input
                          type="number"
                          value={(form as any)[key]}
                          onChange={e => updateForm(key, e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="bg-muted/30 p-4 rounded-lg text-sm text-muted-foreground space-y-2 border border-border">
                    <h4 className="font-bold text-foreground flex items-center gap-2">
                      <Info className="w-4 h-4 text-primary" /> Panduan Upload Data DDMRP
                    </h4>
                    <p>File Excel/CSV yang diupload akan dianalisis secara massal menggunakan parameter default di atas apabila kolom parameter tertentu tidak dicantumkan di dalam file.</p>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="md:col-span-1 flex flex-col">
          {activeMode === 'file' ? (
            <GlassCard className="h-full flex items-center justify-center p-3">
              <FileUploader
                onFileUpload={handleFileUpload}
                isLoading={isProcessing}
                label="Upload Riwayat Sales"
                description="CSV/Excel: Bulan, Deskripsi, Cabang, Kategori, Penjualan."
                templateCsv={`Bulan,Deskripsi,Cabang,Kategori,Penjualan,Lead Time (Hari),MOQ,Order Cycle (Hari),On-Hand,On-Order,Qualified Demand
2024-01-01,Januari,Bali,Apparel,44806,14,500,7,12000,5000,2000
2024-01-01,Januari,Bali,Automotive,32476,21,100,14,8000,2000,1000`}
              />
            </GlassCard>
          ) : (
            <GlassCard className="h-full bg-muted/30">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Info className="w-5 h-5 text-primary" />
                Tentang DDMRP
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-none bg-red-500 mt-1.5 shrink-0" />
                  <span><strong className="text-destructive">Red Zone</strong>: Safety buffer untuk fluktuasi demand.</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-none bg-amber-500 mt-1.5 shrink-0" />
                  <span><strong className="text-amber-500">Yellow Zone</strong>: Normal coverage selama lead time.</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-none bg-emerald-500 mt-1.5 shrink-0" />
                  <span><strong className="text-emerald-500">Green Zone</strong>: Order sizing & minimum order quantity.</span>
                </li>
              </ul>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-10">
          
          {/* Summary & Filters (Expanded & Overflow Visible) */}
          <GlassCard allowOverflow={true} className="mb-12 p-6 border-slate-200 bg-white shadow-xl relative z-30">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-200 pb-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-slate-900">
                  <BarChart3 className="w-6 h-6 text-sky-400" />
                  Ringkasan Analisis DDMRP
                </h2>
                <TimestampBadge timestamp={results.processed_at || new Date().toISOString()} />
              </div>
              <button 
                onClick={() => {
                  const dataArray = results.results || [results];
                  const exportData = dataArray.map((res: any) => ({
                    'Cabang': res.cabang || 'N/A',
                    'Kategori': res.kategori || 'N/A',
                    'SKU': res.label,
                    'ADU': res.adu,
                    'Lead Time': res.lead_time?.value,
                    'On-Hand': res.on_hand,
                    'On-Order': res.on_order,
                    'Net Flow Position': res.net_flow_position,
                    'Status': res.replenishment?.status,
                    'Urgency': res.replenishment?.urgency,
                    'Order Qty': res.replenishment?.suggested_order_qty,
                  }));
                  exportToExcel(exportData, 'DDMRP_Buffer', 'Buffer', results?.processed_at || new Date().toISOString());
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-900 px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export to Excel
              </button>
            </div>
            
            {results.results && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🏢 Filter Cabang:</label>
                  <MultiSelect
                    options={['All', ...Array.from(new Set(results.results.map((r: any) => r.cabang || 'All'))).filter(x => x !== 'All') as string[]]}
                    selected={filterCabang}
                    onChange={val => { setFilterCabang(val); setFilterSku(['All']); }}
                    selectAllLabel="Semua Cabang"
                    placeholder="Pilih Cabang..."
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📦 Filter Kategori:</label>
                  <MultiSelect
                    options={['All', ...Array.from(new Set(results.results.map((r: any) => r.kategori || 'All'))).filter(x => x !== 'All') as string[]]}
                    selected={filterKategori}
                    onChange={val => { setFilterKategori(val); setFilterSku(['All']); }}
                    selectAllLabel="Semua Kategori"
                    placeholder="Pilih Kategori..."
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🔍 Cari SKU Item:</label>
                  <MultiSelect
                    options={['All', ...results.results
                      .filter((r: any) => 
                        (filterCabang.includes('All') || filterCabang.includes(r.cabang)) && 
                        (filterKategori.includes('All') || filterKategori.includes(r.kategori))
                      )
                      .map((r: any) => r.label)
                    ]}
                    selected={filterSku}
                    onChange={setFilterSku}
                    selectAllLabel="Semua SKU (Max 20 Tampil)"
                    placeholder="Cari SKU..."
                    className="w-full"
                  />
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-card border border-border">
              {(() => {
                const dataArray = results.results || [results];
                const filteredData = dataArray.filter((res: any) => {
                  if (!filterCabang.includes('All') && !filterCabang.includes(res.cabang)) return false;
                  if (!filterKategori.includes('All') && !filterKategori.includes(res.kategori)) return false;
                  return true;
                });
                const critical = filteredData.filter((r: any) => r.replenishment?.urgency === 'high').length;
                const totalOrder = filteredData.filter((r: any) => r.replenishment?.action === 'ORDER' || r.replenishment?.action === 'URGENT_ORDER').length;
                const totalOrderQty = filteredData.reduce((acc: number, r: any) => acc + (r.replenishment?.suggested_order_qty || 0), 0);
                const overstock = filteredData.filter((r: any) => r.replenishment?.action === 'NO_ORDER').length;
                
                return (
                  <>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total SKU</p>
                      <p className="text-2xl font-bold text-foreground">{filteredData.length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Butuh Order</p>
                      <p className="text-2xl font-bold text-amber-500">{totalOrder} <span className="text-sm text-muted-foreground">({critical} Kritis)</span></p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Qty Pesan</p>
                      <p className="text-2xl font-bold text-primary">{totalOrderQty.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overstock / Aman</p>
                      <p className="text-2xl font-bold text-emerald-500">{overstock}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </GlassCard>

          {(results.results || [results])
            .filter((res: any) => {
              if (!filterCabang.includes('All') && !filterCabang.includes(res.cabang)) return false;
              if (!filterKategori.includes('All') && !filterKategori.includes(res.kategori)) return false;
              if (!filterSku.includes('All') && !filterSku.includes(res.label)) return false;
              return true;
            })
            .slice(0, filterSku.includes('All') ? 20 : filterSku.length) // Batasi tampilan jika All agar tidak lag
            .map((res: any, idx: number) => (
            <div key={idx} className="space-y-6">
              {results.results && (
                <h2 className="text-xl font-bold text-primary mb-4 pb-2 border-b border-border/50">
                  {res.label} {res.cabang ? `(${res.cabang})` : ''}
                </h2>
              )}
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KPICard title="ADU" value={`${Number(res.adu || 0).toFixed(2)} /hari`} icon={<Activity className="w-5 h-5" />} />
                <KPICard title="CoV" value={Number(res.cov || 0).toFixed(3)} icon={<BarChart3 className="w-5 h-5" />} />
                <KPICard
                  title="Variability"
                  value={res.variability?.category || "Normal"}
                  icon={<AlertTriangle className="w-5 h-5" />}
                  trend={`VF: ${res.variability?.factor || 0}`}
                />
                <KPICard
                  title="Lead Time"
                  value={res.lead_time?.category || "Medium"}
                  icon={<Truck className="w-5 h-5" />}
                  trend={`LTF: ${res.lead_time?.factor || 0}`}
                />
                <KPICard
                  title="Net Flow"
                  value={Number(res.net_flow_position || 0).toLocaleString('id-ID')}
                  icon={<TrendingUp className="w-5 h-5" />}
                  isAlert={res.replenishment?.urgency === 'high'}
                />
              </div>

              {/* Buffer Chart */}
              <GlassCard>
                <DDMRPBufferChart
                  bufferZones={res.buffer_zones || res.zones || {}}
                  netFlowPosition={res.net_flow_position}
                />
              </GlassCard>

              {/* Replenishment Decision */}
              <GlassCard>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <Package className="w-5 h-5 text-primary" />
                  Keputusan Replenishment
                </h3>

                <div className="flex items-start gap-6 p-4 rounded-lg bg-card/50 border border-border">
                  <div className="shrink-0">
                    {getUrgencyBadge(res.replenishment?.urgency)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-foreground font-medium">{res.replenishment?.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
                      <div>
                        <span className="text-muted-foreground uppercase tracking-wider">Zone</span>
                        <p className="font-bold text-foreground mt-0.5">{res.replenishment?.zone}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase tracking-wider">Order Qty</span>
                        <p className="font-bold text-foreground mt-0.5">{res.replenishment?.suggested_order_qty?.toLocaleString()} unit</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase tracking-wider">On-Hand</span>
                        <p className="font-bold text-foreground mt-0.5">{res.on_hand?.toLocaleString()} unit</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase tracking-wider">On-Order</span>
                        <p className="font-bold text-foreground mt-0.5">{res.on_order?.toLocaleString()} unit</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Buffer Detail Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="text-left py-2 px-3">Parameter</th>
                        <th className="text-right py-2 px-3">Nilai</th>
                        <th className="text-left py-2 px-3">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {[
                        { label: 'Red Base', value: res.buffer_zones?.red_base, desc: 'ADU × DLT × LTF' },
                        { label: 'Red Safety', value: res.buffer_zones?.red_safety, desc: 'Red Base × VF' },
                        { label: 'Red Zone', value: res.buffer_zones?.red_zone, desc: 'Red Base + Red Safety', color: 'text-red-400' },
                        { label: 'Yellow Zone', value: res.buffer_zones?.yellow_zone, desc: 'ADU × DLT', color: 'text-amber-400' },
                        { label: 'Green Zone', value: res.buffer_zones?.green_zone, desc: 'max(ADU×DLT×LTF, ADU×OC, MOQ)', color: 'text-emerald-400' },
                        { label: 'Top of Red (TOR)', value: res.buffer_zones?.top_of_red, desc: 'Batas atas zona merah' },
                        { label: 'Top of Yellow (TOY)', value: res.buffer_zones?.top_of_yellow, desc: 'Trigger replenishment' },
                        { label: 'Top of Green (TOG)', value: res.buffer_zones?.top_of_green, desc: 'Target order sampai sini' },
                        { label: 'Net Flow Position', value: res.net_flow_position, desc: 'OH + OO − QD', color: 'text-primary font-bold' },
                      ].map((row) => (
                        <tr key={row.label} className="hover:bg-muted/30 transition-colors">
                          <td className={`py-2 px-3 font-bold ${row.color || 'text-foreground'}`}>{row.label}</td>
                          <td className={`py-2 px-3 text-right font-mono font-bold ${row.color || 'text-foreground'}`}>{row.value?.toLocaleString()}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-medium text-xs">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </div>
          ))}

          {/* Formulas Collapsible */}
          <GlassCard>
            <button
              onClick={() => setShowFormulas(!showFormulas)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <Calculator className="w-5 h-5 text-primary" />
                Rumus-Rumus DDMRP
              </h3>
              {showFormulas ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showFormulas && (
              <div className="mt-6 grid md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                {DDMRP_FORMULAS.map((f, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-card/50 border border-border/50">
                    <h4 className="text-sm font-bold text-foreground">{f.title}</h4>
                    <code className="block mt-1.5 text-xs font-mono text-primary bg-primary/10 px-2.5 py-1.5 rounded">{f.formula}</code>
                    <p className="mt-2 text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Literature Insights Collapsible */}
          <GlassCard>
            <button
              onClick={() => setShowLiterature(!showLiterature)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <BookOpen className="w-5 h-5 text-primary" />
                Insight Literatur DDMRP (2023–2025)
              </h3>
              {showLiterature ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showLiterature && (
              <div className="mt-6 space-y-3 animate-in fade-in duration-300">
                {DDMRP_LITERATURE.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                    <span className="text-primary font-bold text-sm shrink-0">{idx + 1}.</span>
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
