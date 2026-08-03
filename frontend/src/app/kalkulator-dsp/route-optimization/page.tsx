/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { RouteMapChart } from '@/components/charts/RouteMapChart';
import { SensitivityChart } from '@/components/charts/SensitivityChart';
import {
  Route, TrendingDown, Truck, DollarSign, Fuel,
  ChevronDown, ChevronUp, BookOpen, Cpu, Map,
  Info, Zap, BarChart3, Users, Clock, FileSpreadsheet,
} from 'lucide-react';
import { analyzeRouteOptimization, uploadRouteOptimizationFile } from '@/lib/api';
import toast from 'react-hot-toast';
import { FileUploader } from '@/components/ui/FileUploader';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { exportToExcel } from '@/utils/export';
import { get, set } from 'idb-keyval';

// ═══════════════════════════════════════════════
//  LITERATURE REFERENCE DATA
// ═══════════════════════════════════════════════

const ROUTE_BENCHMARK = [
  { method: 'Exact (MILP)', characteristic: 'Optimal pasti, skala kecil-menengah', evidence: 'Penghematan >10% saat korelasi demand dipertimbangkan', source: 'ScienceDirect' },
  { method: 'Clarke-Wright Savings', characteristic: 'Tercepat, paling luas di industri', evidence: 'Optimal pada 81% dari 84 instance (deviasi 0,14%)', source: 'Academia.edu' },
  { method: 'Hybrid ACO', characteristic: 'Metaheuristik koloni semut', evidence: '62,07% lebih baik vs pembanding, 88,89% saat pelanggan terkonsentrasi', source: 'Springer' },
  { method: 'Deep RL + GNN', characteristic: 'ML untuk kondisi dinamis', evidence: '1,73% cost reduction vs ACO', source: 'arXiv' },
  { method: 'Saving Matrix + Tabu + ACO', characteristic: 'Hybrid milk-run', evidence: 'Kapasitas tak terpakai 49% → 3%', source: 'ResearchGate' },
];

const FORMULAS = [
  { title: 'Haversine Distance', formula: 'd = R · 2 · atan2(√a, √(1−a))  ;  a = sin²(Δφ/2) + cos(φ₁)cos(φ₂)sin²(Δλ/2)', desc: 'Jarak great-circle antara dua titik GPS (R = 6371 km).' },
  { title: 'Clarke-Wright Savings', formula: 'S(i,j) = d(0,i) + d(0,j) − d(i,j)', desc: 'Savings positif → menggabungkan rute i & j lebih efisien.' },
  { title: 'Total Cost', formula: 'Cost = Fuel + Driver + Fixed + Maintenance + Emission', desc: 'Fuel = jarak × (harga BBM / efisiensi), Driver = n_kendaraan × upah/hari.' },
];

const FACTOR_4M1E = [
  { factor: 'Man', desc: 'Keahlian sopir, kelelahan, kepatuhan SOP, human error saat pilih rute manual', icon: <Users className="w-4 h-4" /> },
  { factor: 'Machine', desc: 'Kapasitas & kondisi armada, efisiensi BBM, biaya perawatan', icon: <Truck className="w-4 h-4" /> },
  { factor: 'Method', desc: 'Algoritma routing — manual vs heuristik vs metaheuristik vs ML', icon: <Cpu className="w-4 h-4" /> },
  { factor: 'Material', desc: 'Jenis/berat/sifat barang yang menentukan jenis kendaraan', icon: <BarChart3 className="w-4 h-4" /> },
  { factor: 'Environment', desc: 'Kondisi infrastruktur, cuaca, regulasi emisi, kondisi geografis', icon: <Map className="w-4 h-4" /> },
];

type ScenarioType = 'normal' | 'peak' | 'eco';

const SCENARIOS = [
  {
    id: 'normal' as ScenarioType,
    title: 'Jalur 1: Evaluasi Rute Standar & Traffic Normal',
    desc: 'Optimalisasi rute distribusi dengan kondisi lalu lintas normal dan parameter waktu tempuh serta biaya standar.',
    color: 'from-teal-600 to-emerald-500',
    icon: Route,
    modifier: 1.0
  },
  {
    id: 'peak' as ScenarioType,
    title: 'Jalur 2: Simulasi Jam Sibuk & Kepadatan (+35% BBM & Waktu)',
    desc: 'Simulasi ketahanan biaya rute saat peak hours atau cuaca buruk yang meningkatkan konsumsi BBM dan durasi tempuh.',
    color: 'from-amber-600 to-orange-500',
    icon: Clock,
    modifier: 1.35
  },
  {
    id: 'eco' as ScenarioType,
    title: 'Jalur 3: Simulasi Green Eco-Driving (-20% Emisi & Konsolidasi)',
    desc: 'Prioritas penghematan emisi karbon (CO2) dan konsolidasi muatan armada untuk menekan Fixed Cost & Carbon Footprint.',
    color: 'from-blue-600 to-indigo-500',
    icon: Fuel,
    modifier: 0.8
  }
];

function generateDemoRoute() {
  const sampleRoutes = [
    { vehicle_id: 1, type: 'Dedicated Rute', stops: 5, distance_km: 45.8, cost_idr: 420000, duration_mins: 120, load_percent: 92, path: ['Gudang Pusat (Jakarta)', 'Kelapa Gading', 'Sunter', 'Kemayoran', 'Ancol'] },
    { vehicle_id: 2, type: 'Milk-Run Rute', stops: 8, distance_km: 68.2, cost_idr: 580000, duration_mins: 185, load_percent: 88, path: ['Gudang Pusat (Jakarta)', 'Slipi', 'Kebon Jeruk', 'Puri Indah', 'Cengkareng', 'Kalideres'] },
    { vehicle_id: 3, type: 'Dynamic VRP', stops: 6, distance_km: 52.1, cost_idr: 485000, duration_mins: 140, load_percent: 95, path: ['Gudang Pusat (Jakarta)', 'Tebet', 'Pancoran', 'Pasar Minggu', 'Lenteng Agung'] },
  ];

  const methods = [
    { method: 'Clarke-Wright Savings', total_distance: 166.1, total_cost: 1485000, avg_load_utilization: 91.6, vehicles_used: 3, carbon_emission_kg: 42.5, routes: sampleRoutes },
    { method: 'Hybrid ACO (Ant Colony)', total_distance: 158.4, total_cost: 1410000, avg_load_utilization: 94.2, vehicles_used: 3, carbon_emission_kg: 39.1, routes: sampleRoutes.map(r => ({ ...r, distance_km: r.distance_km * 0.95, cost_idr: Math.round(r.cost_idr * 0.95) })) },
    { method: 'Genetic Algorithm (GA)', total_distance: 162.0, total_cost: 1440000, avg_load_utilization: 92.8, vehicles_used: 3, carbon_emission_kg: 40.8, routes: sampleRoutes.map(r => ({ ...r, distance_km: r.distance_km * 0.97, cost_idr: Math.round(r.cost_idr * 0.97) })) },
  ];

  return [{
    label: 'Demo Dataset (Jabodetabek)',
    processed_at: new Date().toISOString(),
    methods: methods,
    summary: { best_method: 'Hybrid ACO (Ant Colony)', savings_pct: 12.8, total_customers: 19 }
  }];
}

export default function RouteOptimizationPage() {
  const [results, setResults] = useState<any[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [showFormulas, setShowFormulas] = useState(false);
  const [showLiterature, setShowLiterature] = useState(false);
  const [show4M1E, setShow4M1E] = useState(false);
  const [activeMode, setActiveMode] = useState<'demo' | 'file'>('file');
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('normal');
  const [showHowTo, setShowHowTo] = useState(false);
  
  const [filterTipeRute, setFilterTipeRute] = useState<string[]>(['All']);
  const [filterSearchStop, setFilterSearchStop] = useState<string[]>(['All']);

  const handleGenerateDemo = () => {
    const demo = generateDemoRoute();
    setResults(demo);
    try { set('last_route_optimization_result', demo); } catch(e){}
    toast.success('🎉 Data Demo Optimasi Rute Berhasil Dimuat!');
  };

  useEffect(() => {
    get('last_route_optimization_result').then(saved => {
      if (saved && Array.isArray(saved) && saved.length > 0) {
        setResults(saved);
      } else {
        setResults(generateDemoRoute());
      }
    }).catch(err => {
      console.warn('Failed to load Route Optimization state from IndexDB', err);
      setResults(generateDemoRoute());
    });
  }, []);

  // Form state
  const [form, setForm] = useState({
    n_customers: 20,
    vehicle_capacity: 100,
    num_vehicles: 8,
    num_dedicated_vehicles: 2,
    fuel_price: 13500,
    fuel_efficiency: 8,
    driver_cost: 250000,
    fixed_cost: 150000,
    maintenance_per_km: 500,
    traffic_factor: 1.0,
    ga_generations: 100,
  });

  const updateForm = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const handleAnalyze = async () => {
    setIsProcessing(true);
    toast.loading('Menjalankan 3 algoritma optimasi rute...', { id: 'route' });

    try {
      const data = await analyzeRouteOptimization({
        use_demo_data: true,
        vehicle_capacity: form.vehicle_capacity,
        num_vehicles: form.num_vehicles,
        num_dedicated_vehicles: form.num_dedicated_vehicles,
        cost_params: {
          fuel_price_per_liter: form.fuel_price,
          fuel_efficiency_km_per_liter: form.fuel_efficiency,
          driver_cost_per_day: form.driver_cost,
          fixed_cost_per_vehicle: form.fixed_cost,
          maintenance_per_km: form.maintenance_per_km,
          traffic_factor: form.traffic_factor,
        },
        ga_generations: form.ga_generations,
        ga_pop_size: 50,
      });

      const rawRes = data.results ? data.results : [{ ...data, label: 'Demo Data' }];
      const now = new Date().toISOString();
      const updatedRes = rawRes.map((r: any) => ({ ...r, processed_at: r.processed_at || now }));
      setResults(updatedRes);
      try { await set('last_route_optimization_result', updatedRes); } catch (e) { console.warn('Failed to save state to IndexDB', e); }
      setSelectedGroup(0);
      setSelectedMethod(0);
      toast.success('Optimasi rute selesai!', { id: 'route' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal mengoptimasi rute.', { id: 'route' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Memproses file & optimasi...', { id: 'route' });
    try {
      const data = await uploadRouteOptimizationFile(file, {
        vehicle_capacity: form.vehicle_capacity,
        num_vehicles: form.num_vehicles,
        num_dedicated_vehicles: form.num_dedicated_vehicles,
        cost_params: {
          fuel_price_per_liter: form.fuel_price,
          fuel_efficiency_km_per_liter: form.fuel_efficiency,
          driver_cost_per_day: form.driver_cost,
          fixed_cost_per_vehicle: form.fixed_cost,
          maintenance_per_km: form.maintenance_per_km,
          traffic_factor: form.traffic_factor,
        },
        ga_generations: form.ga_generations,
        ga_pop_size: 50,
      });
      const rawRes = data.results ? data.results : [{ ...data, label: 'File Upload' }];
      const now = new Date().toISOString();
      const updatedRes = rawRes.map((r: any) => ({ ...r, processed_at: r.processed_at || now }));
      setResults(updatedRes);
      try { await set('last_route_optimization_result', updatedRes); } catch (e) { console.warn('Failed to save state to IndexDB', e); }
      setSelectedGroup(0);
      setSelectedMethod(0);
      toast.success('Optimasi rute dari file selesai!', { id: 'route' });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Gagal memproses file.', { id: 'route' });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatRp = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">
      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 p-6 sm:p-8 border border-teal-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase tracking-widest">
              <Route className="w-3.5 h-3.5" /> Kalkulator DSP • VRP Solver & Milk-Run
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Route Optimization <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-emerald-300 to-cyan-300">(VRP Solver)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Vehicle Routing Problem solver memadukan jarak Haversine dengan algoritma Clarke-Wright Savings, Genetic Algorithm, dan Hybrid Ant Colony Optimization (ACO).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.[0]?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & DEMO DATA SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-teal-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-400" /> Panduan Upload & Skema Koordinat Pelanggan
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-teal-500/20"
              >
                <Zap className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
            <div>
              <h4 className="font-semibold text-white mb-2">📌 Skema Kolom File VRP (Excel / CSV):</h4>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                {['Customer ID','Nama Pelanggan','Latitude','Longitude','Demand (Unit)','Time Window Start','Time Window End','Service Duration (Mins)'].map(col => (
                  <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    <span>{col}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-white">⚙️ Clarke-Wright & Hybrid ACO Metaheuristic:</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Algoritma menguji ribuan kemungkinan rute untuk meminimalkan jarak tempuh total, menurunkan biaya operasional armada, dan menekan emisi CO2 sekaligus memaksimalkan utilisasi muatan (Load Utilization).
              </p>
              <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-teal-400" />
                <span>Mendukung pengindeksan koordinat GPS real dengan pembawa Excel (XLSX) yang tangguh.</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Kondisi Rute & Lalu Lintas:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk menguji kemacetan peak-hours atau rute Eco-Driving!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-teal-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-teal-400'}`} />
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

      {/* Input Form & 4M1E Panel */}
      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        <div className="md:col-span-2 flex flex-col">
          <GlassCard className="h-full flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 border-b border-border pb-4">
                <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                  <Zap className="w-5 h-5 text-primary" />
                  Parameter Optimasi
                </h3>
                <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
                  <button
                    onClick={() => setActiveMode('demo')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                      activeMode === 'demo' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Demo Mode
                  </button>
                  <button
                    onClick={() => setActiveMode('file')}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                      activeMode === 'file' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Upload File
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {[
                  ...(activeMode === 'demo' ? [{ key: 'n_customers', label: 'Jumlah Pelanggan', step: 1 }] : []),
                  { key: 'num_vehicles', label: 'Total Jumlah Kendaraan', step: 1 },
                  { key: 'num_dedicated_vehicles', label: 'Kendaraan Rute Dedicated', step: 1 },
                  { key: 'vehicle_capacity', label: 'Kapasitas / Kendaraan (unit)', step: 10 },
                  { key: 'fuel_price', label: 'Harga BBM (Rp/L)', step: 500 },
                  { key: 'fuel_efficiency', label: 'Efisiensi BBM (km/L)', step: 1 },
                  { key: 'driver_cost', label: 'Upah Sopir (Rp/hari)', step: 25000 },
                  { key: 'fixed_cost', label: 'Fixed Cost (Rp/trip)', step: 25000 },
                  { key: 'maintenance_per_km', label: 'Maintenance (Rp/km)', step: 100 },
                  { key: 'traffic_factor', label: 'Traffic Factor (1.0-1.5)', step: 0.1 },
                  { key: 'ga_generations', label: 'GA Generasi', step: 10 },
                ].map(({ key, label, step }) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      {label}
                    </label>
                    <input
                      type="number"
                      step={step}
                      value={(form as any)[key]}
                      onChange={e => updateForm(key, e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    />
                  </div>
                ))}
              </div>

              {activeMode === 'demo' ? (
                <button
                  onClick={handleAnalyze}
                  disabled={isProcessing}
                  className="mt-4 w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Mengoptimasi...
                    </>
                  ) : (
                    <>
                      <Cpu className="w-4 h-4" />
                      Jalankan Optimasi (Demo Data Jakarta)
                    </>
                  )}
                </button>
              ) : (
                <div className="bg-muted/30 p-3.5 rounded-lg text-xs text-muted-foreground border border-border flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-foreground">Catatan Rute Dedicated vs Optimasi:</strong> Kendaraan dedicated akan mengangkut rute yang sudah ditentukan duluan, dan sisa pelanggan kemudian akan dioptimalkan dengan kendaraan reguler yang tersisa.
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right Column: FileUploader when in file mode, or 4M1E Info when Demo */}
        <div className="md:col-span-1 flex flex-col">
          {activeMode === 'file' ? (
            <GlassCard className="h-full flex items-center justify-center p-3">
              <FileUploader
                onFileUpload={handleFileUpload}
                isLoading={isProcessing}
                label="Upload Data Rute"
                description="CSV/Excel: Tipe Lokasi, Nama Lokasi, Latitude, Longitude, Demand."
                templateCsv={`Tipe Lokasi,Nama Lokasi,Latitude,Longitude,Demand (Unit),Time Windows,Service Time (Menit)
Depot,Pusat Distribusi,-6.200000,106.816666,0,08:00-17:00,0
Pelanggan,Toko A,-6.210000,106.820000,15,08:00-12:00,30`}
              />
            </GlassCard>
          ) : (
            <GlassCard className="h-full bg-muted/30">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Info className="w-5 h-5 text-primary" />
                Faktor 4M1E
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {FACTOR_4M1E.map(({ factor, desc, icon }) => (
                  <li key={factor} className="flex items-start gap-2">
                    <div className="shrink-0 mt-0.5 text-primary">{icon}</div>
                    <span><strong className="text-foreground">{factor}</strong>: {desc}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Results */}
      {results && results.length > 0 && results[selectedGroup] && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-8 border-b border-border pb-4 gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Hasil Optimasi Rute</h2>
              <div className="mt-1">
                <TimestampBadge timestamp={results[selectedGroup]?.processed_at || new Date().toISOString()} />
              </div>
            </div>
            <button
              onClick={() => {
                let allExportData: any[] = [];
                
                results.forEach((groupData: any, groupIdx: number) => {
                  const bestMethod = groupData.best_method;
                  if (!bestMethod) return;
                  
                  const methodData = groupData.methods?.find((m: any) => m.method === bestMethod);
                  if (!methodData || !methodData.routes) return;
                  
                  const groupExport = methodData.routes.flatMap((route: any, routeIdx: number) => 
                    route.stops.map((stop: any, stopIdx: number) => ({
                      'Cabang': groupData.label || `Grup ${groupIdx + 1}`,
                      'Metode': methodData.method,
                      'Vehicle': `Kendaraan ${routeIdx + 1}`,
                      'Urutan': stopIdx + 1,
                      'Lokasi': stop.name,
                      'Total Jarak Rute (KM)': routeIdx === 0 && stopIdx === 0 ? methodData.total_distance_km : '',
                      'Total Cost Rute (Rp)': routeIdx === 0 && stopIdx === 0 ? methodData.cost?.total_cost : ''
                    }))
                  );
                  allExportData = [...allExportData, ...groupExport];
                });
                
                if (allExportData.length > 0) {
                  exportToExcel(allExportData, 'Route_Optimization', 'Rute', new Date().toISOString());
                } else {
                  toast.error('Tidak ada data rute untuk diexport');
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" /> Download Excel
            </button>
          </div>
          
          {/* Interactive Filters */}
          <GlassCard className="!py-4 mb-6 border-primary/20">
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Filter Cabang / Grup</label>
                <select 
                  value={selectedGroup} 
                  onChange={e => { setSelectedGroup(Number(e.target.value)); setSelectedMethod(0); setFilterTipeRute(['All']); setFilterSearchStop(['All']); }}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  {results.map((res: any, idx: number) => (
                    <option key={idx} value={idx}>{res.label || `Cabang ${idx + 1}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Filter Tipe Armada / Rute</label>
                <MultiSelect
                  options={['All', 'Dedicated', 'Optimasi']}
                  selected={filterTipeRute}
                  onChange={setFilterTipeRute}
                  selectAllLabel="Semua Tipe Rute"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Cari Titik Pemberhentian</label>
                <MultiSelect
                  options={['All', ...(Array.from(new Set(
                    results[selectedGroup]?.methods?.[selectedMethod]?.routes?.flatMap((r: any) => r.stops?.map((s: any) => s.name) || []) || []
                  )) as string[]).sort()]}
                  selected={filterSearchStop}
                  onChange={setFilterSearchStop}
                  selectAllLabel="Semua Titik Tujuan"
                  className="w-full"
                />
              </div>
            </div>
          </GlassCard>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Metode Terbaik"
              value={results[selectedGroup].best_method?.split('+')[0]?.trim() || '—'}
              icon={<Cpu className="w-5 h-5" />}
            />
            <KPICard
              title="Penghematan vs Baseline"
              value={`${results[selectedGroup].saving_vs_baseline_pct}%`}
              icon={<TrendingDown className="w-5 h-5" />}
              trend="vs Nearest Neighbor"
            />
            <KPICard
              title="Total Cost (Best)"
              value={formatRp(results[selectedGroup].methods?.find((m: any) => m.method === results[selectedGroup].best_method)?.cost?.total_cost || 0)}
              icon={<DollarSign className="w-5 h-5" />}
            />
            <KPICard
              title="Penggunaan Armada"
              value={`${results[selectedGroup].methods?.find((m: any) => m.method === results[selectedGroup].best_method)?.n_vehicles || 0} / ${results[selectedGroup].num_vehicles || form.num_vehicles} Unit`}
              trend={`Dedicated: ${results[selectedGroup].methods?.find((m: any) => m.method === results[selectedGroup].best_method)?.n_dedicated_vehicles ?? form.num_dedicated_vehicles} | Optimasi: ${results[selectedGroup].methods?.find((m: any) => m.method === results[selectedGroup].best_method)?.n_optimized_vehicles ?? 0}`}
              icon={<Truck className="w-5 h-5" />}
            />
          </div>

          {/* Method Comparison Table */}
          <GlassCard>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <BarChart3 className="w-5 h-5 text-primary" />
              Perbandingan Metode
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-3 px-3">Metode</th>
                    <th className="text-right py-3 px-3">Jarak (km)</th>
                    <th className="text-right py-3 px-3">Kendaraan</th>
                    <th className="text-right py-3 px-3">Fuel Cost</th>
                    <th className="text-right py-3 px-3">Driver Cost</th>
                    <th className="text-right py-3 px-3">Total Cost</th>
                    <th className="text-right py-3 px-3">Waktu (jam)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {results[selectedGroup].methods?.map((m: any, idx: number) => {
                    const isBest = m.method === results[selectedGroup].best_method;
                    return (
                      <tr
                        key={m.method}
                        className={`cursor-pointer transition-colors ${
                          isBest ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/30'
                        } ${selectedMethod === idx ? 'ring-1 ring-primary/30' : ''}`}
                        onClick={() => setSelectedMethod(idx)}
                      >
                        <td className="py-3 px-3 font-semibold">
                          {isBest && <span className="text-primary mr-1">★</span>}
                          {m.method}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">{Number(m?.total_distance_km || 0).toFixed(1)}</td>
                        <td className="py-3 px-3 text-right font-mono">{m?.n_vehicles || 0}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs">{formatRp(m?.cost?.fuel_cost)}</td>
                        <td className="py-3 px-3 text-right font-mono text-xs">{formatRp(m?.cost?.driver_cost)}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold">{formatRp(m?.cost?.total_cost)}</td>
                        <td className="py-3 px-3 text-right font-mono">{Number(m?.cost?.estimated_time_hours || 0).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Klik baris untuk melihat visualisasi rute metode tersebut.
            </p>
          </GlassCard>

          {/* Route Map */}
          {results[selectedGroup].methods?.[selectedMethod] && results[selectedGroup].locations && (
            <>
              <GlassCard>
                <RouteMapChart
                  locations={results[selectedGroup].locations}
                  routes={results[selectedGroup].methods[selectedMethod].routes}
                  methodName={results[selectedGroup].methods[selectedMethod].method}
                />
              </GlassCard>

              {/* Dedicated vs Optimized Routes Breakdown Table */}
              <GlassCard>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <Truck className="w-5 h-5 text-primary" />
                  Daftar Armada & Pembagian Rute — {results[selectedGroup].methods[selectedMethod].method}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="text-left py-3 px-3">Armada / Rute</th>
                        <th className="text-center py-3 px-3">Tipe Rute</th>
                        <th className="text-right py-3 px-3">Stop</th>
                        <th className="text-right py-3 px-3">Muatan</th>
                        <th className="text-right py-3 px-3">Utilisasi Kapasitas</th>
                        <th className="text-right py-3 px-3">Jarak (KM)</th>
                        <th className="text-left py-3 px-3">Rute Pemberhentian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {results[selectedGroup].methods[selectedMethod].routes?.filter((r: any) => {
                        if (!filterTipeRute.includes('All')) {
                          const routeType = r.is_dedicated ? 'Dedicated' : 'Optimasi';
                          if (!filterTipeRute.includes(routeType)) return false;
                        }
                        if (!filterSearchStop.includes('All')) {
                          const stopNames = r.stops?.map((s: any) => s.name) || [];
                          const matchesStop = stopNames.some((name: string) => filterSearchStop.includes(name));
                          if (!matchesStop) return false;
                        }
                        return true;
                      }).map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="py-3 px-3 font-bold text-foreground">
                            {r.vehicle_name || `Kendaraan #${r.route_id}`}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {r.is_dedicated ? (
                              <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-500 font-bold rounded text-xs uppercase inline-block">
                                🛡️ Dedicated (Tetap)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 font-bold rounded text-xs uppercase inline-block">
                                ⚡ Optimasi (Sistem)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">{r.n_stops} stop</td>
                          <td className="py-3 px-3 text-right font-mono">{r.load ?? '—'} unit</td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                                <div className={`h-full ${r.capacity_pct > 90 ? 'bg-orange-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, r.capacity_pct || 0)}%` }} />
                              </div>
                              <span className="font-mono text-xs">{r.capacity_pct ?? '—'}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">{r.distance_km ?? '—'} km</td>
                          <td className="py-3 px-3 text-xs text-muted-foreground max-w-xs truncate">
                            {r.stops?.map((s: any) => s.name).join(' ➔ ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Rute Dedicated dikunci sejak awal dan tidak diubah polanya oleh algoritma. Rute Optimasi adalah hasil perhitungan heuristik untuk sisa pesanan/pelanggan.
                </p>
              </GlassCard>
            </>
          )}

          {/* Sensitivity Analysis */}
          {results[selectedGroup].sensitivity && (
            <GlassCard>
              <SensitivityChart data={results[selectedGroup].sensitivity} />
            </GlassCard>
          )}

          {/* Insights */}
          {results[selectedGroup].insights && (
            <GlassCard>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Zap className="w-5 h-5 text-primary" />
                Insights
              </h3>
              <div className="space-y-2">
                {results[selectedGroup].insights.map((ins: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border/50">
                    <span className="text-primary font-bold text-sm shrink-0">{idx + 1}.</span>
                    <p className="text-sm text-foreground">{ins}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Formulas Collapsible */}
          <GlassCard>
            <button
              onClick={() => setShowFormulas(!showFormulas)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <BarChart3 className="w-5 h-5 text-primary" />
                Rumus Optimasi Rute
              </h3>
              {showFormulas ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showFormulas && (
              <div className="mt-6 space-y-4 animate-in fade-in duration-300">
                {FORMULAS.map((f, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-card/50 border border-border/50">
                    <h4 className="text-sm font-bold text-foreground">{f.title}</h4>
                    <code className="block mt-1.5 text-xs font-mono text-primary bg-primary/10 px-2.5 py-1.5 rounded break-all">{f.formula}</code>
                    <p className="mt-2 text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Literature Benchmark Collapsible */}
          <GlassCard>
            <button
              onClick={() => setShowLiterature(!showLiterature)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <BookOpen className="w-5 h-5 text-primary" />
                Benchmark Literatur Route Optimization
              </h3>
              {showLiterature ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showLiterature && (
              <div className="mt-6 overflow-x-auto animate-in fade-in duration-300">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left py-2 px-3">Metode</th>
                      <th className="text-left py-2 px-3">Karakteristik</th>
                      <th className="text-left py-2 px-3">Bukti Literatur</th>
                      <th className="text-left py-2 px-3">Sumber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {ROUTE_BENCHMARK.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-semibold text-foreground">{row.method}</td>
                        <td className="py-2 px-3 text-muted-foreground">{row.characteristic}</td>
                        <td className="py-2 px-3 text-muted-foreground">{row.evidence}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">{row.source}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
