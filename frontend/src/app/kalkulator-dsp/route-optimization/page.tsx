/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import LZString from 'lz-string';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  Route, TrendingDown, Truck, DollarSign, Fuel,
  ChevronDown, ChevronUp, BookOpen, Cpu, Map,
  Info, Zap, BarChart3, Users, Clock, FileSpreadsheet,
  Award, CheckCircle2, Layers, Cloud } from 'lucide-react';
import { analyzeRouteOptimization, uploadRouteOptimizationFile } from '@/lib/api';
import { get, set } from 'idb-keyval';
import toast from 'react-hot-toast';
import { FileUploader } from '@/components/ui/FileUploader';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { exportToExcel } from '@/utils/export';
import { supabase } from '@/lib/supabase';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import { ModuleExportConfig } from '@/utils/offlineExport';

const RouteMapChart = dynamic(
  () => import('@/components/charts/RouteMapChart').then(m => m.RouteMapChart),
  { ssr: false, loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-slate-100" /> }
);
const SensitivityChart = dynamic(
  () => import('@/components/charts/SensitivityChart').then(m => m.SensitivityChart),
  { ssr: false, loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-slate-100" /> }
);

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

const getRouteStopsList = (r: any): any[] => {
  if (Array.isArray(r?.stops)) return r.stops;
  if (Array.isArray(r?.path)) return r.path.map((name: string, idx: number) => ({ index: idx, name, demand: idx === 0 ? 0 : 10 }));
  return [];
};

const getRouteStopNames = (r: any): string[] => {
  if (Array.isArray(r?.stops)) return r.stops.map((s: any) => typeof s === 'string' ? s : s?.name || 'Titik');
  if (Array.isArray(r?.path)) return r.path.map((s: any) => typeof s === 'string' ? s : s?.name || 'Titik');
  return [];
};

const getRouteStopsCount = (r: any): number => {
  if (typeof r?.n_stops === 'number') return r.n_stops;
  if (typeof r?.stops === 'number') return r.stops;
  if (Array.isArray(r?.stops)) return r.stops.length;
  if (Array.isArray(r?.path)) return r.path.length;
  return 0;
};

function generateDemoRoute() {
  const demoLocations = [
    { index: 0, name: 'Depot Pusat (Jakarta)', lat: -6.2088, lon: 106.8456, demand: 0, is_depot: true },
    { index: 1, name: 'Kelapa Gading', lat: -6.1601, lon: 106.9048, demand: 25, is_depot: false },
    { index: 2, name: 'Sunter', lat: -6.1432, lon: 106.8647, demand: 20, is_depot: false },
    { index: 3, name: 'Ancol', lat: -6.1265, lon: 106.8322, demand: 30, is_depot: false },
    { index: 4, name: 'Slipi', lat: -6.1912, lon: 106.8001, demand: 20, is_depot: false },
    { index: 5, name: 'Kebon Jeruk', lat: -6.1925, lon: 106.7663, demand: 25, is_depot: false },
    { index: 6, name: 'Puri Indah', lat: -6.1855, lon: 106.7368, demand: 30, is_depot: false },
    { index: 7, name: 'Tebet', lat: -6.2268, lon: 106.8576, demand: 15, is_depot: false },
    { index: 8, name: 'Pancoran', lat: -6.2505, lon: 106.8431, demand: 20, is_depot: false },
    { index: 9, name: 'Pasar Minggu', lat: -6.2845, lon: 106.8428, demand: 25, is_depot: false },
    { index: 10, name: 'Lenteng Agung', lat: -6.3268, lon: 106.8335, demand: 30, is_depot: false },
  ];

  const createRoute = (id: number, vehicleName: string, stopIndices: number[], dist: number, isDed: boolean) => {
    const routeStops = stopIndices.map(i => ({ index: i, name: demoLocations[i].name, demand: demoLocations[i].demand }));
    const load = routeStops.reduce((acc, curr) => acc + curr.demand, 0);
    return {
      route_id: id,
      vehicle_name: vehicleName,
      is_dedicated: isDed,
      n_stops: routeStops.length,
      stops: routeStops,
      load: load,
      capacity_pct: Math.round((load / 100) * 100),
      distance_km: Number(dist.toFixed(1)),
      path: routeStops.map(s => s.name)
    };
  };

  const dedRoute = createRoute(1, 'Armada Dedicated #1', [1, 2, 3], 32.5, true);

  const nnRoutes = [
    dedRoute,
    createRoute(2, 'Armada Optimasi (NN) #2', [4, 7, 5], 42.1, false),
    createRoute(3, 'Armada Optimasi (NN) #3', [6, 8, 9, 10], 58.4, false),
  ];

  const cwRoutes = [
    dedRoute,
    createRoute(2, 'Armada Optimasi (CW) #2', [4, 5, 6], 36.8, false),
    createRoute(3, 'Armada Optimasi (CW) #3', [7, 8, 9, 10], 48.2, false),
  ];

  const gaRoutes = [
    dedRoute,
    createRoute(2, 'Armada Optimasi (GA) #2', [6, 5, 4], 35.2, false),
    createRoute(3, 'Armada Optimasi (GA) #3', [7, 8, 9, 10], 46.5, false),
  ];

  const acoRoutes = [
    dedRoute,
    createRoute(2, 'Armada Optimasi (ACO) #2', [4, 5, 6], 33.9, false),
    createRoute(3, 'Armada Optimasi (ACO) #3', [7, 8, 9, 10], 44.1, false),
  ];

  const createCost = (dist: number, vehicles: number, timeHours: number) => ({
    fuel_cost: Math.round(dist * 13500 / 8),
    driver_cost: Math.round((vehicles * 250000) + (timeHours * 35000)),
    fixed_cost: vehicles * 150000,
    maintenance_cost: Math.round(dist * 500),
    emission_cost: Math.round(dist * 0.00027 * 50000),
    total_cost: Math.round((dist * 13500 / 8) + (vehicles * 250000) + (timeHours * 35000) + (vehicles * 150000) + (dist * 500) + (dist * 0.00027 * 50000)),
    estimated_time_hours: timeHours
  });

  const methods = [
    { method: 'Nearest Neighbor', total_distance_km: 133.0, n_vehicles: 3, n_dedicated_vehicles: 1, n_optimized_vehicles: 2, cost: createCost(133.0, 3, 4.5), routes: nnRoutes },
    { method: 'Clarke-Wright + 2-opt', total_distance_km: 117.5, n_vehicles: 3, n_dedicated_vehicles: 1, n_optimized_vehicles: 2, cost: createCost(117.5, 3, 4.0), routes: cwRoutes },
    { method: 'Genetic Algorithm + 2-opt', total_distance_km: 114.2, n_vehicles: 3, n_dedicated_vehicles: 1, n_optimized_vehicles: 2, cost: createCost(114.2, 3, 3.8), routes: gaRoutes },
    { method: 'Hybrid ACO + 2-opt', total_distance_km: 110.5, n_vehicles: 3, n_dedicated_vehicles: 1, n_optimized_vehicles: 2, cost: createCost(110.5, 3, 3.6), routes: acoRoutes },
  ];

  return [{
    label: 'Demo Dataset (Jabodetabek)',
    processed_at: new Date().toISOString(),
    best_method: 'Hybrid ACO + 2-opt',
    saving_vs_baseline_pct: 16.9,
    num_vehicles: 8,
    num_dedicated_vehicles: 1,
    locations: demoLocations,
    methods: methods,
    summary: { best_method: 'Hybrid ACO + 2-opt', savings_pct: 16.9, total_customers: 10 },
    insights: [
      'Metode terbaik: Hybrid ACO + 2-opt — total cost Rp 1.542.450.',
      'Penghematan 16.9% dibanding baseline (Nearest Neighbor).',
      'Penggunaan Armada: 3 unit digunakan dari total 8 kendaraan (Kapasitas per armada: 100 unit).',
      'Rute Dedicated: 1 kendaraan bertugas pada rute tetap (32.5 km). Rute Selanjutnya (Optimasi): 2 kendaraan diatur oleh sistem.'
    ]
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

  const handleSaveToGlobal = async () => {
    if (!results) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...results, processed_at: timestamp };
    sessionStorage.setItem('last_processed_at_route_optimization', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'route_optimization', result_json: JSON.stringify({ compressed: true, data: LZString.compressToBase64(JSON.stringify(dataCopy)) }) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = generateDemoRoute();
    setResults(demo);
    try { set('last_route_optimization_result', demo); } catch(e){}
    toast.success('🎉 Data Demo Optimasi Rute Berhasil Dimuat!');
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data: dbData, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'route_optimization')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (dbData && dbData.length > 0) {
          const row = dbData[0];
          const parsed = JSON.parse(row.result_json);
          parsed.forEach((r: any) => { r.processed_at = row.created_at; });
          setResults(parsed);
        } else {
          setResults(generateDemoRoute());
        }
      } catch (err) {
        setResults(generateDemoRoute());
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('route_optimization_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.route_optimization' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.forEach((r: any) => { r.processed_at = payload.new.created_at; });
            
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_route_optimization');
            if (lastProcessedAt === newData[0]?.processed_at) return;

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
      sessionStorage.setItem('last_processed_at_route_optimization', updatedRes[0]?.processed_at);
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
      sessionStorage.setItem('last_processed_at_route_optimization', updatedRes[0]?.processed_at);
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

  // ── Offline HTML export: flatten ALL groups × ALL methods × ALL routes so the
  // exported file's own filters can range over everything, not just the group/
  // method currently selected on screen. ──
  const allRoutesFlat = useMemo(() => {
    if (!results) return [];
    const rows: Record<string, unknown>[] = [];
    results.forEach((g: any) => {
      const label = g.label || 'Cabang';
      (g.methods || []).forEach((m: any) => {
        (Array.isArray(m.routes) ? m.routes : []).forEach((r: any) => {
          rows.push({
            cabang: label,
            metode: m.method,
            armada: r.vehicle_name || `Kendaraan #${r.route_id || ''}`,
            tipe: r.is_dedicated ? 'Dedicated' : 'Optimasi',
            stops: getRouteStopsCount(r),
            load: r.load ?? 0,
            capacity_pct: Number(r.capacity_pct) || 0,
            distance_km: Number(r.distance_km) || 0,
            rute: getRouteStopNames(r).join(' -> '),
          });
        });
      });
    });
    return rows;
  }, [results]);

  const methodSummaryFlat = useMemo(() => {
    if (!results) return [];
    const rows: Record<string, unknown>[] = [];
    results.forEach((g: any) => {
      const label = g.label || 'Cabang';
      const bestMethodName = g.best_method || g.summary?.best_method;
      (g.methods || []).forEach((m: any) => {
        rows.push({
          cabang: label,
          metode: m.method,
          is_best: m.method === bestMethodName ? 'Ya' : 'Tidak',
          jarak_km: Number(m.total_distance_km) || 0,
          kendaraan: m.n_vehicles || 0,
          total_cost: Number(m.cost?.total_cost) || 0,
          waktu_jam: Number(m.cost?.estimated_time_hours) || 0,
        });
      });
    });
    return rows;
  }, [results]);

  const dedicatedRoutesFlat = useMemo(
    () => allRoutesFlat.filter((r) => r.tipe === 'Dedicated'),
    [allRoutesFlat]
  );

  const groupLabels = useMemo(() => (results ? results.map((g: any) => g.label || 'Cabang') : []), [results]);
  const methodNames = useMemo(
    () => Array.from(new Set(allRoutesFlat.map((r: any) => r.metode as string))),
    [allRoutesFlat]
  );

  const exportConfig: ModuleExportConfig | undefined = results && results.length > 0 ? {
    moduleName: 'Route_Optimization',
    processedAt: results[0]?.processed_at,
    domElementId: 'export-container',
    filters: [
      { field: 'cabang', label: 'Filter Cabang / Grup', options: groupLabels },
      { field: 'metode', label: 'Filter Metode', options: methodNames },
      { field: 'tipe', label: 'Filter Tipe Rute', options: ['Dedicated', 'Optimasi'] },
    ],
    tables: [
      {
        id: 'all_routes',
        title: 'Semua Rute Optimasi (Seluruh Cabang & Metode)',
        filterFields: ['cabang', 'metode', 'tipe'],
        data: allRoutesFlat,
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'metode', label: 'Metode' },
          { key: 'armada', label: 'Armada' },
          { key: 'tipe', label: 'Tipe' },
          { key: 'stops', label: 'Stop', align: 'right', format: 'number' },
          { key: 'load', label: 'Muatan', align: 'right', format: 'number' },
          { key: 'capacity_pct', label: 'Utilisasi', align: 'right', format: 'percent', highlight: { above: 90 } },
          { key: 'distance_km', label: 'Jarak (KM)', align: 'right', format: 'number', decimals: 1 },
          { key: 'rute', label: 'Urutan Stop' },
        ],
      },
      {
        id: 'method_summary',
        title: 'Perbandingan Metode (Seluruh Cabang)',
        filterFields: ['cabang', 'metode'],
        data: methodSummaryFlat,
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'metode', label: 'Metode' },
          { key: 'is_best', label: 'Terbaik?' },
          { key: 'jarak_km', label: 'Jarak (KM)', align: 'right', format: 'number', decimals: 1 },
          { key: 'kendaraan', label: 'Kendaraan', align: 'right', format: 'number' },
          { key: 'total_cost', label: 'Total Cost', align: 'right', format: 'currency-idr' },
          { key: 'waktu_jam', label: 'Waktu (Jam)', align: 'right', format: 'number', decimals: 1 },
        ],
      },
      {
        id: 'dedicated_routes',
        title: 'Rute Dedicated (Armada Tetap)',
        data: dedicatedRoutesFlat,
        emptyLabel: 'Tidak ada rute dedicated.',
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'metode', label: 'Metode' },
          { key: 'armada', label: 'Armada' },
          { key: 'distance_km', label: 'Jarak (KM)', align: 'right', format: 'number', decimals: 1 },
        ],
      },
    ],
    kpis: [
      { id: 'total_rute', label: 'Total Rute', sourceTableId: 'all_routes', field: 'distance_km', agg: 'count', decimals: 0 },
      { id: 'total_jarak', label: 'Total Jarak', sourceTableId: 'all_routes', field: 'distance_km', agg: 'sum', decimals: 1, suffix: ' km' },
      { id: 'avg_utilisasi', label: 'Avg Utilisasi Kapasitas', sourceTableId: 'all_routes', field: 'capacity_pct', agg: 'avg', decimals: 1, suffix: '%' },
      { id: 'rute_dedicated_count', label: 'Rute Dedicated', sourceTableId: 'dedicated_routes', field: 'distance_km', agg: 'count', decimals: 0 },
    ],
  } : undefined;

  return (
    <div id="export-container" className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">
      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 p-6 sm:p-8 border border-teal-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase tracking-widest">
              <Route className="w-3.5 h-3.5" /> Kalkulator DSP • VRP Solver & Milk-Run
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              Route Optimization <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-emerald-300 to-cyan-300">(VRP Solver)</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Vehicle Routing Problem solver memadukan jarak Haversine dengan algoritma Clarke-Wright Savings, Genetic Algorithm, dan Hybrid Ant Colony Optimization (ACO).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.[0]?.processed_at} label="Olah Terakhir:" />
            {exportConfig
              ? <ExportHtmlButton config={exportConfig} moduleName="Route_Optimization" processedAt={results?.[0]?.processed_at} />
              : <ExportHtmlButton elementId="export-container" moduleName="Route_Optimization" processedAt={results?.[0]?.processed_at} />}
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
        <GlassCard className="p-6 border-teal-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-teal-400" /> Panduan Upload & Skema Koordinat Pelanggan
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-teal-500/20"
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
              <h4 className="font-semibold text-slate-900 mb-2">📌 Skema Kolom File VRP (Excel / CSV):</h4>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {['Customer ID','Nama Pelanggan','Latitude','Longitude','Demand (Unit)','Time Window Start','Time Window End','Service Duration (Mins)'].map(col => (
                  <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                    <span>{col}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">⚙️ Clarke-Wright & Hybrid ACO Metaheuristic:</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
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
      <div className="no-export space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Kondisi Rute & Lalu Lintas:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk menguji kemacetan peak-hours atau rute Eco-Driving!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-teal-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-teal-400'}`} />
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
                      Jalankan & Simpan ke Global (Demo Jakarta)
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
                <TimestampBadge timestamp={results[selectedGroup]?.processed_at} />
              </div>
            </div>
            <button
              onClick={() => {
                let allExportData: any[] = [];
                
                results.forEach((groupData: any, groupIdx: number) => {
                  const bestMethod = groupData.best_method || groupData.summary?.best_method;
                  if (!bestMethod) return;
                  
                  const methodData = groupData.methods?.find((m: any) => m.method === bestMethod);
                  if (!methodData || !methodData.routes) return;
                  
                  const groupExport = (Array.isArray(methodData.routes) ? methodData.routes : []).flatMap((route: any, routeIdx: number) => {
                    const stopsList = getRouteStopsList(route);
                    return stopsList.map((stop: any, stopIdx: number) => ({
                      'Cabang': groupData.label || `Grup ${groupIdx + 1}`,
                      'Metode': methodData.method,
                      'Vehicle': `Kendaraan ${routeIdx + 1}`,
                      'Urutan': stopIdx + 1,
                      'Lokasi': typeof stop === 'string' ? stop : (stop?.name || 'Lokasi'),
                      'Total Jarak Rute (KM)': routeIdx === 0 && stopIdx === 0 ? methodData.total_distance_km : '',
                      'Total Cost Rute (Rp)': routeIdx === 0 && stopIdx === 0 ? methodData.cost?.total_cost : ''
                    }));
                  });
                  allExportData = [...allExportData, ...groupExport];
                });
                
                if (allExportData.length > 0) {
                  exportToExcel(allExportData, 'Route_Optimization', 'Rute', new Date().toISOString());
                } else {
                  toast.error('Tidak ada data rute untuk diexport');
                }
              }}
              className="no-export bg-emerald-600 hover:bg-emerald-500 text-slate-900 px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" /> Download Excel
            </button>
          </div>

          {/* Interactive Filters (Expanded & Overflow Visible) */}
          <GlassCard allowOverflow={true} className="no-export p-6 mb-10 border-slate-200 bg-white shadow-xl relative z-30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🏢 Filter Cabang / Grup:</label>
                <select 
                  value={selectedGroup} 
                  onChange={e => { setSelectedGroup(Number(e.target.value)); setSelectedMethod(0); setFilterTipeRute(['All']); setFilterSearchStop(['All']); }}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
                >
                  {results.map((res: any, idx: number) => (
                    <option key={idx} value={idx}>{res.label || `Cabang ${idx + 1}`}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🚚 Filter Tipe Armada / Rute:</label>
                <MultiSelect
                  options={['All', 'Dedicated', 'Optimasi']}
                  selected={filterTipeRute}
                  onChange={setFilterTipeRute}
                  selectAllLabel="Semua Tipe Rute"
                  placeholder="Pilih Tipe Rute..."
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📍 Cari Titik Pemberhentian:</label>
                <MultiSelect
                  options={['All', ...(Array.from(new Set(
                    (Array.isArray(results[selectedGroup]?.methods?.[selectedMethod]?.routes) ? results[selectedGroup].methods[selectedMethod].routes : []).flatMap((r: any) => getRouteStopNames(r))
                  )) as string[]).sort()]}
                  selected={filterSearchStop}
                  onChange={setFilterSearchStop}
                  selectAllLabel="Semua Titik Tujuan"
                  placeholder="Pilih Titik Tujuan..."
                  className="w-full"
                />
              </div>
            </div>
          </GlassCard>

          {/* KPI Cards */}
          {(() => {
            const currentGroup = results[selectedGroup] || {};
            const bestMethodName = currentGroup.best_method || currentGroup.summary?.best_method;
            const savingsPct = currentGroup.saving_vs_baseline_pct ?? currentGroup.summary?.savings_pct ?? 0;
            const bestObj = currentGroup.methods?.find((m: any) => m.method === bestMethodName) || currentGroup.methods?.[0];

            return (
              <div className="no-export grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                  title="Metode Terbaik"
                  value={bestMethodName?.split('+')[0]?.trim() || '—'}
                  icon={<Cpu className="w-5 h-5" />}
                />
                <KPICard
                  title="Penghematan vs Baseline"
                  value={`${savingsPct}%`}
                  icon={<TrendingDown className="w-5 h-5" />}
                  trend="vs Nearest Neighbor"
                />
                <KPICard
                  title="Total Cost (Best)"
                  value={formatRp(bestObj?.cost?.total_cost || 0)}
                  icon={<DollarSign className="w-5 h-5" />}
                />
                <KPICard
                  title="Penggunaan Armada"
                  value={`${bestObj?.n_vehicles || 0} / ${currentGroup.num_vehicles || form.num_vehicles} Unit`}
                  trend={`Dedicated: ${bestObj?.n_dedicated_vehicles ?? form.num_dedicated_vehicles} | Optimasi: ${bestObj?.n_optimized_vehicles ?? 0}`}
                  icon={<Truck className="w-5 h-5" />}
                />
              </div>
            );
          })()}

          {/* 🏆 BANNER: REKOMENDASI RUTE PALING OK */}
          {(() => {
            const bestMethodName = results[selectedGroup]?.best_method || results[selectedGroup]?.summary?.best_method;
            const savingsPct = results[selectedGroup]?.saving_vs_baseline_pct ?? results[selectedGroup]?.summary?.savings_pct ?? 0;
            const bestObj = results[selectedGroup]?.methods?.find((m: any) => m.method === bestMethodName) || results[selectedGroup]?.methods?.[0];
            const bestIdx = results[selectedGroup]?.methods?.findIndex((m: any) => m.method === bestMethodName);

            if (!bestObj) return null;

            return (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-6 sm:p-7 border-2 border-emerald-500/40 shadow-2xl animate-fade-in my-6">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2.5 max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-black bg-emerald-400 text-slate-950 uppercase tracking-wider shadow-md">
                      <Award className="w-4 h-4 text-slate-950 fill-slate-950" />
                      Rekomendasi Rute Paling OK (Best Optimization)
                    </div>
                    <h3 className="text-xl sm:text-3xl font-black text-slate-900 flex items-center gap-3">
                      <span>🏆 {bestMethodName}</span>
                    </h3>
                    <p className="text-slate-800 text-sm sm:text-base leading-relaxed">
                      Berdasarkan analisis komputasi VRP (Vehicle Routing Problem), metode ini terbukti <b>Paling OK</b> dan optimal karena memberikan efisiensi tertinggi dengan penghematan biaya <b className="text-emerald-300 font-extrabold">{savingsPct}%</b> berbanding rute konvensional (Nearest Neighbor).
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold pt-1 text-slate-700">
                      <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow">
                        💰 Total Cost: <b className="text-emerald-400 text-sm font-mono">{formatRp(bestObj.cost?.total_cost || 0)}</b>
                      </span>
                      <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow">
                        🛣️ Jarak Rute: <b className="text-cyan-400 text-sm font-mono">{Number(bestObj.total_distance_km || 0).toFixed(1)} KM</b>
                      </span>
                      <span className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 flex items-center gap-1.5 shadow">
                        🚚 Armada Operasional: <b className="text-amber-400 text-sm font-mono">{bestObj.n_vehicles || 0} Unit</b>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 shrink-0 w-full md:w-auto">
                    <button
                      onClick={() => {
                        if (bestIdx !== undefined && bestIdx >= 0) {
                          setSelectedMethod(bestIdx);
                          toast.success(`Menyoroti rute dari metode terbaik: ${bestMethodName}`);
                        }
                      }}
                      className="no-export px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95"
                    >
                      <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                      Sorot Peta Rute Terbaik Ini
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Method Comparison Table */}
          <GlassCard className="no-export">
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
                    const isBest = m.method === (results[selectedGroup].best_method || results[selectedGroup].summary?.best_method);
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
              <GlassCard className="no-export">
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
                      {(Array.isArray(results[selectedGroup]?.methods?.[selectedMethod]?.routes) ? results[selectedGroup].methods[selectedMethod].routes : []).filter((r: any) => {
                        if (!filterTipeRute.includes('All')) {
                          const routeType = r.is_dedicated ? 'Dedicated' : 'Optimasi';
                          if (!filterTipeRute.includes(routeType)) return false;
                        }
                        if (!filterSearchStop.includes('All')) {
                          const stopNames = getRouteStopNames(r);
                          const matchesStop = stopNames.some((name: string) => filterSearchStop.includes(name));
                          if (!matchesStop) return false;
                        }
                        return true;
                      }).map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="py-3 px-3 font-bold text-foreground">
                            {r.vehicle_name || `Kendaraan #${r.route_id || idx + 1}`}
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
                          <td className="py-3 px-3 text-right font-mono">{getRouteStopsCount(r)} stop</td>
                          <td className="py-3 px-3 text-right font-mono">{r.load ?? '—'} unit</td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
                                <div className={`h-full ${Number(r.capacity_pct) > 90 ? 'bg-orange-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, Number(r.capacity_pct) || 0)}%` }} />
                              </div>
                              <span className="font-mono text-xs">{r.capacity_pct ?? '—'}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">{r.distance_km ?? '—'} km</td>
                          <td className="py-3 px-3 text-xs text-muted-foreground max-w-xs truncate">
                            {getRouteStopNames(r).join(' ➔ ')}
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

              {/* MASTER CATALOG: ALL ROUTES FROM ALL METHODS WITH BEST BADGE */}
              <GlassCard className="no-export p-6 border-slate-200 bg-white shadow-2xl my-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2.5 uppercase tracking-wide">
                      <Layers className="w-5 h-5 text-purple-400" />
                      Semua Rute Optimasi & Indikator Paling OK (Seluruh Metode)
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Daftar lengkap seluruh rute komputasi dari berbagai algoritma untuk membandingkan mana konfigurasi stop dan kendaraan yang paling efektif.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>Rute berlabel RUTE PALING OK adalah hasil rekomendasi sistem terbaik!</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[650px] overflow-y-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1100px]">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md text-[11px] tracking-wider text-center">
                      <tr className="border-b border-slate-200">
                        <th className="py-3 px-4 text-left">Metode Optimasi</th>
                        <th className="py-3 px-3 border-l border-slate-200 text-left">Armada / Rute</th>
                        <th className="py-3 px-3 border-l border-slate-200">Tipe</th>
                        <th className="py-3 px-3 border-l border-slate-200 text-right">Stop</th>
                        <th className="py-3 px-3 border-l border-slate-200 text-right">Muatan</th>
                        <th className="py-3 px-3 border-l border-slate-200 text-right">Utilisasi</th>
                        <th className="py-3 px-3 border-l border-slate-200 text-right text-cyan-400">Jarak</th>
                        <th className="py-3 px-4 border-l border-slate-200 text-left">Urutan Stop / Titik Tujuan</th>
                        <th className="py-3 px-3 border-l border-slate-200 bg-slate-100 text-slate-900">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-700 text-center font-medium">
                      {results[selectedGroup]?.methods?.flatMap((m: any, mIdx: number) => {
                        const isBestMethod = m.method === (results[selectedGroup].best_method || results[selectedGroup].summary?.best_method);
                        const routes = Array.isArray(m.routes) ? m.routes : [];
                        return routes.map((r: any, rIdx: number) => ({
                          ...r,
                          methodName: m.method,
                          methodIndex: mIdx,
                          isBestMethod,
                          uniqueKey: `${mIdx}-${rIdx}`
                        }));
                      }).filter((r: any) => {
                        if (!filterTipeRute.includes('All')) {
                          const rType = r.is_dedicated ? 'Dedicated' : 'Optimasi';
                          if (!filterTipeRute.includes(rType)) return false;
                        }
                        if (!filterSearchStop.includes('All')) {
                          const stopNames = getRouteStopNames(r);
                          const matches = stopNames.some((n: string) => filterSearchStop.includes(n));
                          if (!matches) return false;
                        }
                        return true;
                      }).map((item: any) => (
                        <tr
                          key={item.uniqueKey}
                          className={`hover:bg-slate-100 transition ${item.isBestMethod ? 'bg-emerald-950/20 border-l-4 border-l-emerald-500' : ''}`}
                        >
                          <td className="py-3 px-4 text-left align-middle font-bold text-slate-900">
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1.5 text-sm">
                                {item.isBestMethod && <span title="Paling OK (Best Method)">🏆</span>}
                                {item.methodName}
                              </span>
                              {item.isBestMethod && (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-700 font-extrabold px-2 py-0.5 rounded border border-emerald-500/40 w-fit">
                                  ✨ RUTE PALING OK
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 text-left align-middle font-bold text-slate-800">
                            {item.vehicle_name || `Kendaraan #${item.route_id || '—'}`}
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 align-middle">
                            {item.is_dedicated ? (
                              <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-700 font-bold rounded text-xs uppercase inline-block">
                                Dedicated
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 font-bold rounded text-xs uppercase inline-block">
                                Optimasi
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 align-middle font-mono text-right">
                            {getRouteStopsCount(item)} stop
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 align-middle font-mono text-right">
                            {item.load ?? '—'} unit
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 align-middle text-right font-mono text-xs">
                            <span className={Number(item.capacity_pct) > 90 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                              {item.capacity_pct ?? '—'}%
                            </span>
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 align-middle text-right font-mono font-black text-cyan-700 text-sm">
                            {item.distance_km ?? '—'} km
                          </td>
                          <td className="py-3 px-4 border-l border-slate-200 text-left align-middle text-xs text-slate-700 max-w-sm truncate" title={getRouteStopNames(item).join(' ➔ ')}>
                            {getRouteStopNames(item).join(' ➔ ')}
                          </td>
                          <td className="py-3 px-3 border-l border-slate-200 bg-slate-50 align-middle">
                            <button
                              onClick={() => {
                                setSelectedMethod(item.methodIndex);
                                toast.success(`Menyoroti di peta: ${item.methodName}`);
                              }}
                              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-700 text-slate-800 hover:text-slate-900 font-bold text-xs transition border border-slate-600 shadow-sm"
                            >
                              📍 Sorot Peta
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
