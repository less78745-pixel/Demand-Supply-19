"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import {
  Radar, Download, AlertTriangle, Activity, Shield,
  Package, XCircle, CheckCircle, Info, TrendingUp, Zap, HelpCircle, FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import { uploadControlTowerFile } from '@/lib/api';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';

type ScenarioType = 'normal' | 'peak' | 'shortage';

const SCENARIOS = [
  {
    id: 'normal' as ScenarioType,
    title: 'Jalur 1: Evaluasi Real-Time & Health Score Aktual',
    desc: 'Pantauan kondisi suplai dan pergerakan stok 28 cabang secara real-time berdasarkan skor OTIF dan In-Stock Rate reguler.',
    color: 'from-indigo-600 to-blue-500',
    icon: Radar,
    modifier: 1.0
  },
  {
    id: 'peak' as ScenarioType,
    title: 'Jalur 2: Simulasi Tekanan Peak Season (-15% OTIF Score)',
    desc: 'Simulasi stress-test jika armada logistik mengalami kepadatan dan keterlambatan pengiriman saat musim puncak liburan.',
    color: 'from-amber-600 to-orange-500',
    icon: TrendingUp,
    modifier: 0.85
  },
  {
    id: 'shortage' as ScenarioType,
    title: 'Jalur 3: Simulasi Kelangkaan Suplai Nasional (Critical Alert)',
    desc: 'Simulasi pengetatan pasokan dari supplier pusat yang menyebabkan penurunan persentase In-Stock drastis di cabang luar Jawa.',
    color: 'from-rose-600 to-red-500',
    icon: ShieldAlert,
    modifier: 0.7
  }
];

function generateDemoControlTower() {
  const branches = [
    { cabang: 'Jakarta', region: 'Jawa & Bali', in_stock_rate: 96, days_of_supply: 18, otif_score: 94, health_score: 95, zone: 'GREEN', total_stock: 80000, color: '#22c55e', description: 'Stok optimal dan jadwal pengiriman lancar.' },
    { cabang: 'Surabaya', region: 'Jawa & Bali', in_stock_rate: 92, days_of_supply: 15, otif_score: 90, health_score: 91, zone: 'GREEN', total_stock: 65000, color: '#22c55e', description: 'Kondisi suplai stabil untuk Jawa Timur.' },
    { cabang: 'Medan', region: 'Sumatera', in_stock_rate: 78, days_of_supply: 6, otif_score: 75, health_score: 76, zone: 'YELLOW', total_stock: 20000, color: '#f59e0b', description: 'Perlu pengiriman tambahan dari gudang pusat.' },
    { cabang: 'Makassar', region: 'Sulawesi', in_stock_rate: 82, days_of_supply: 9, otif_score: 80, health_score: 81, zone: 'YELLOW', total_stock: 24500, color: '#f59e0b', description: 'Stok penyangga batas aman.' },
    { cabang: 'Jayapura', region: 'Indonesia Timur', in_stock_rate: 55, days_of_supply: 3, otif_score: 52, health_score: 53, zone: 'RED', total_stock: 5500, color: '#ef4444', description: 'CRITICAL: Risiko putus stok tinggi, percepat clearance kapal.' },
    { cabang: 'Kupang', region: 'Indonesia Timur', in_stock_rate: 60, days_of_supply: 4, otif_score: 58, health_score: 59, zone: 'RED', total_stock: 7200, color: '#ef4444', description: 'CRITICAL: Diperlukan rebalancing dari Bali atau Surabaya.' }
  ];

  const region_summary = [
    { region: 'Jawa & Bali', avg_in_stock: 94, avg_otif: 92, health_score: 93 },
    { region: 'Sumatera', avg_in_stock: 81, avg_otif: 78, health_score: 79 },
    { region: 'Sulawesi', avg_in_stock: 82, avg_otif: 80, health_score: 81 },
    { region: 'Indonesia Timur', avg_in_stock: 57, avg_otif: 55, health_score: 56 }
  ];

  const ddmrp_distribution = [
    { zone: 'GREEN', count: 2, color: '#22c55e' },
    { zone: 'YELLOW', count: 2, color: '#f59e0b' },
    { zone: 'RED', count: 2, color: '#ef4444' },
    { zone: 'BLUE', count: 0, color: '#3b82f6' }
  ];

  const weekly_actions = [
    '⚡ Alokasikan 3,000 unit SKU fast-moving ke Jayapura dan Kupang sebelum H-5 akhir minggu.',
    '🚚 Koordinasikan dengan vendor trucking Medan guna menaikkan skor OTIF dari 75% ke atas 85%.',
    '✅ Monitor penyerapan stok di Jakarta & Surabaya yang berjalan optimal di batas aman (Green Zone).'
  ];

  const alerts = [
    { region: 'Indonesia Timur', severity: 'CRITICAL', message: 'Jayapura & Kupang: Days of Supply di bawah 5 hari (Zone RED).' },
    { region: 'Sumatera', severity: 'WARNING', message: 'Medan: Skor OTIF menurun menjadi 75% akibat kendala bongkar muat pelabuhan.' },
    { region: 'Sulawesi', severity: 'WARNING', message: 'Makassar: Stok mendekati batas Reorder Point (ROP Level).' }
  ];

  return {
    processed_at: new Date().toISOString(),
    branches,
    region_summary,
    ddmrp_distribution,
    weekly_actions,
    alerts,
    kpi: {
      avg_health: 76,
      avg_in_stock: 77,
      avg_dos: 9,
      critical_count: 2,
      avg_otif: 75,
      total_branches: 6
    }
  };
}

const ZONE_COLORS: Record<string, string> = {
  RED: '#ef4444', YELLOW: '#f59e0b', GREEN: '#22c55e', BLUE: '#3b82f6',
};

const TEMPLATE_CSV = `Cabang,In_Stock_Rate,Days_of_Supply,OTIF_Score,Current_Stock,ROP_Level,Category
Jakarta,95,18,92,50000,12000,Filter
Jakarta,88,12,85,30000,8000,Oil
Surabaya,92,15,90,40000,10000,Filter
Surabaya,85,10,82,25000,7000,Brake
Bandung,90,14,88,35000,9000,Filter
Semarang,87,11,84,28000,7500,Filter
Medan,78,5,75,12000,8000,Filter
Medan,72,4,70,8000,5000,Oil
Makassar,82,8,80,18000,6500,Filter
Palembang,85,9,83,20000,7000,Filter
Denpasar,91,16,89,32000,8500,Filter
Balikpapan,80,7,78,15000,6000,Filter
Manado,65,2,68,5000,7000,Filter
Pontianak,75,6,74,10000,5500,Filter
Banjarmasin,83,9,81,17000,6000,Filter
Lampung,88,13,86,27000,7500,Filter
Padang,79,6,76,11000,5500,Filter
Pekanbaru,81,8,79,14000,5800,Filter
Jambi,77,5,73,9000,5200,Filter
Bengkulu,70,3,65,6000,5000,Filter
Mataram,86,10,84,19000,6200,Filter
Kupang,60,2,55,3000,5000,Filter
Ambon,55,1,50,2000,4500,Filter
Jayapura,50,1,48,1500,4000,Filter
Sorong,58,2,52,2500,4200,Filter
Ternate,62,2,58,3500,4500,Filter
Kendari,74,5,72,8500,5000,Filter
Palu,76,6,74,9500,5300,Filter
Gorontalo,68,3,66,5500,4800,Filter
Cirebon,89,14,87,26000,7200,Filter
Yogyakarta,93,17,91,38000,9500,Filter`;

export default function ControlTowerPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedRegion, setSelectedRegion] = useState<string[]>(['All']);
  const [selectedZone, setSelectedZone] = useState<string[]>(['All']);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('normal');
  const [showHowTo, setShowHowTo] = useState(false);

  const handleGenerateDemo = () => {
    const demo = generateDemoControlTower();
    setResults(demo);
    try { localStorage.setItem('lastControlTower', JSON.stringify(demo)); } catch {}
    toast.success('🎉 Data Demo SCM Control Tower Berhasil Dimuat!');
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastControlTower');
      if (saved) {
        setResults(JSON.parse(saved));
      } else {
        setResults(generateDemoControlTower());
      }
    } catch {
      setResults(generateDemoControlTower());
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Menganalisis health score 28 cabang...', { id: 'ct' });
    try {
      const data = await uploadControlTowerFile(file);
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      try { localStorage.setItem('lastControlTower', JSON.stringify(data)); } catch {}
      toast.success('Control Tower analysis selesai!', { id: 'ct' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Gagal memproses.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'ct' });
    } finally {
      setIsProcessing(false);
    }
  };

  const regionOptions = useMemo(() => {
    if (!results?.branches) return ['All'];
    const s = new Set<string>();
    results.branches.forEach((b: any) => s.add(b.region));
    return ['All', ...Array.from(s).sort()];
  }, [results]);

  const zoneOptions = ['All', 'RED', 'YELLOW', 'GREEN', 'BLUE'];

  const filtered = useMemo(() => {
    if (!results?.branches) return [];
    const mod = SCENARIOS.find(s => s.id === activeScenario)?.modifier || 1.0;
    return results.branches.filter((b: any) =>
      (selectedRegion.includes('All') || selectedRegion.includes(b.region)) &&
      (selectedZone.includes('All') || selectedZone.includes(b.zone))
    ).map((b: any) => {
      const newOtif = Math.min(100, Math.round(b.otif_score * mod));
      const newInStock = Math.min(100, Math.round(b.in_stock_rate * mod));
      const newHealth = Math.min(100, Math.round((newOtif + newInStock) / 2));
      const newZone = newHealth < 65 ? 'RED' : newHealth < 85 ? 'YELLOW' : 'GREEN';
      const color = newZone === 'RED' ? '#ef4444' : newZone === 'YELLOW' ? '#f59e0b' : '#22c55e';
      return {
        ...b,
        otif_score: newOtif,
        in_stock_rate: newInStock,
        health_score: newHealth,
        zone: newZone,
        color: color,
        zone_color: color,
        zone_label: newZone === 'RED' ? 'CRITICAL (RED)' : newZone === 'YELLOW' ? 'WARNING (YELLOW)' : 'SAFE (GREEN)'
      };
    });
  }, [results, selectedRegion, selectedZone, activeScenario]);

  const handleExport = () => {
    if (!filtered.length) { toast.error('Tidak ada data'); return; }
    const lines = ['Cabang,Region,In_Stock_%,DoS,OTIF_%,Health_Score,Zone,Total_Stock'];
    for (const b of filtered) {
      lines.push(`"${b.cabang}","${b.region}",${b.in_stock_rate},${b.days_of_supply},${b.otif_score},${b.health_score},${b.zone},${b.total_stock}`);
    }
    if (results.weekly_actions?.length) {
      lines.push('');
      lines.push('--- REKOMENDASI AKSI MINGGUAN ---');
      results.weekly_actions.forEach((a: string) => lines.push(`"${a}"`));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `SCM_Control_Tower_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Control Tower report exported!');
  };

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 border border-indigo-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest">
              <Radar className="w-3.5 h-3.5" /> SCM Analytic • Executive Supply Chain Surveillance
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              SCM Control <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-blue-300 to-cyan-300">Tower</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Dashboard eksekutif terpadu untuk memantau health score supply chain 28 kantor cabang secara real-time, mendeteksi krisis stok cepat, serta merekomendasikan aksi mitigasi mingguan.
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
        <GlassCard className="p-6 border-indigo-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Panduan Upload & Parameter Control Tower
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Zap className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300">
            <div>
              <h4 className="font-semibold text-white mb-2">📌 Skema Kolom Upload (Excel / CSV):</h4>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                {['Cabang','In_Stock_Rate','Days_of_Supply','OTIF_Score','Current_Stock','ROP_Level','Category'].map(col => (
                  <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span>{col}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-white">⚙️ Kalkulasi Health Score:</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Health score merupakan rata-rata berbobot dari In-Stock Rate dan skor pengiriman tepat waktu (OTIF). Cabang dengan health score &lt; 65 otomatis ditandai sebagai zona RED (Critical).
              </p>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-indigo-400" />
                <span>Diproses dengan sistem parser stabil untuk memantau performa regional se-Indonesia.</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Ketahanan Suplai Nasional:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk menguji ketahanan stok saat musim puncak atau krisis nasional!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-indigo-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-indigo-400'}`} />
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

      {/* ─── UPLOAD BOX WHEN RESULTS PRESENT OR HIDDEN ─── */}
      <GlassCard className="p-4 bg-slate-900/40 border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isProcessing}
            label="Upload Dataset Branch Health (Excel / CSV)"
            description="File Excel atau CSV: Cabang, In_Stock_Rate, Days_of_Supply, OTIF_Score, Current_Stock, ROP_Level."
            templateCsv={TEMPLATE_CSV}
            templateName="template_branch_health.csv"
          />
        </div>
        <div className="sm:border-l border-slate-800 sm:pl-4 flex flex-col justify-center items-center shrink-0">
          <button
            onClick={handleGenerateDemo}
            className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
          >
            <Zap className="w-4 h-4" /> Gunakan Data Demo
          </button>
        </div>
      </GlassCard>

      {results && (
        <div className="space-y-8 animate-in fade-in duration-700">
          {/* ─── FILTER & EXPORT ACTION BAR ─── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Filter Cabang:</span>
              <div className="flex flex-wrap items-center gap-2">
                <MultiSelect options={regionOptions} selected={selectedRegion} onChange={setSelectedRegion} selectAllLabel="Semua Region" />
                <MultiSelect options={zoneOptions} selected={selectedZone} onChange={setSelectedZone} selectAllLabel="Semua Zone" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TimestampBadge timestamp={results.processed_at} />
              <button onClick={handleExport} className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition text-xs sm:text-sm font-bold flex items-center gap-2 uppercase tracking-wide shadow-md">
                <Download className="w-4 h-4" /> Export Report (CSV)
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              📡 Hasil Monitoring Control Tower 28 Cabang
            </h2>
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title="Avg Health Score" value={`${results.kpi.avg_health}%`} icon={<Shield />} />
            <KPICard title="Avg In-Stock" value={`${results.kpi.avg_in_stock}%`} icon={<Activity />} />
            <KPICard title="Avg DoS" value={`${results.kpi.avg_dos} hr`} icon={<Package />} />
            <KPICard title="Critical" value={results.kpi.critical_count} icon={<XCircle />} isAlert={results.kpi.critical_count > 0} />
            <KPICard title="Avg OTIF" value={`${results.kpi.avg_otif}%`} icon={<TrendingUp />} />
          </div>

          {/* Weekly Actions */}
          {results.weekly_actions.length > 0 && (
            <GlassCard className="border-primary/30 bg-primary/5">
              <h3 className="text-sm font-bold text-primary mb-3 uppercase tracking-wide">
                Rekomendasi Aksi Mingguan
              </h3>
              <div className="space-y-2">
                {results.weekly_actions.map((action: string, i: number) => (
                  <p key={i} className="text-sm text-foreground leading-relaxed">{action}</p>
                ))}
              </div>
            </GlassCard>
          )}

          {/* DDMRP Zone Distribution */}
          <div className="grid lg:grid-cols-3 gap-6">
            <GlassCard className="lg:col-span-1">
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Distribusi Zona DDMRP</h3>
              <div className="space-y-3">
                {results.ddmrp_distribution.map((d: any) => {
                  const pct = results.kpi.total_branches > 0 ? (d.count / results.kpi.total_branches * 100) : 0;
                  return (
                    <div key={d.zone} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-foreground">{d.zone}</span>
                          <span className="text-muted-foreground font-bold">{d.count} cabang</span>
                        </div>
                        <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>

            {/* Region Performance */}
            <GlassCard className="lg:col-span-2">
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Performa per Wilayah</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.region_summary} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="region" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                    <Legend />
                    <Bar dataKey="avg_in_stock" name="In-Stock %" fill="#22c55e" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="avg_otif" name="OTIF %" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="health_score" name="Health Score" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* Heatmap — Stok Indonesia */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Heatmap Stok Indonesia — Days of Supply per Cabang
            </h3>
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filtered} layout="vertical" margin={{ top: 10, right: 20, left: 90, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} unit=" hari" />
                  <YAxis type="category" dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                    formatter={(value: any) => [`${value} hari`, 'Days of Supply']}
                    labelFormatter={(label: any) => {
                      const b = filtered.find((x: any) => x.cabang === label);
                      return b ? `${label} (${b.region}) — ${b.zone_label}` : String(label);
                    }} />
                  <Bar dataKey="days_of_supply" name="Days of Supply" radius={[0, 4, 4, 0]}>
                    {filtered.map((entry: any, idx: number) => (
                      <Cell key={idx} fill={ZONE_COLORS[entry.zone] || '#888'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {[
                { label: 'Stockout Risk (<3 hari)', color: '#ef4444' },
                { label: 'Warning (3-7 hari)', color: '#f59e0b' },
                { label: 'Safe (7-30 hari)', color: '#22c55e' },
                { label: 'Overstock (>30 hari)', color: '#3b82f6' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Alerts */}
          {results.alerts.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Exception Alerts ({results.alerts.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                {results.alerts
                  .filter((a: any) => selectedRegion.includes('All') || selectedRegion.includes(a.region))
                  .map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                    <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0 ${
                      a.severity === 'CRITICAL' ? 'bg-destructive/20 text-destructive' : 'bg-yellow-500/20 text-yellow-500'
                    }`}>{a.severity}</span>
                    <p className="text-sm text-foreground">{a.message}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Branch Detail Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Detail Health per Cabang ({filtered.length} cabang)
            </h3>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-muted-foreground">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider z-10">
                  <tr>
                    <th className="px-3 py-3">Cabang</th>
                    <th className="px-3 py-3">Region</th>
                    <th className="px-3 py-3 text-right">In-Stock %</th>
                    <th className="px-3 py-3 text-right">DoS</th>
                    <th className="px-3 py-3 text-right">OTIF %</th>
                    <th className="px-3 py-3 text-right">Health</th>
                    <th className="px-3 py-3">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-foreground">{b.cabang}</td>
                      <td className="px-3 py-2.5">{b.region}</td>
                      <td className="px-3 py-2.5 text-right">{b.in_stock_rate}%</td>
                      <td className="px-3 py-2.5 text-right font-medium">{b.days_of_supply} hr</td>
                      <td className="px-3 py-2.5 text-right">{b.otif_score}%</td>
                      <td className="px-3 py-2.5 text-right font-bold">{b.health_score}%</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase" style={{
                          backgroundColor: `${b.zone_color || '#22c55e'}20`,
                          color: b.zone_color || '#22c55e',
                        }}>
                          {b.zone_label || b.zone}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
