/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { DDMRPBufferChart } from '@/components/charts/DDMRPBufferChart';
import {
  Layers, Activity, TrendingDown, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, BookOpen, Cpu, Package, Truck,
  Info, ShieldCheck, BarChart3, Calculator, FileSpreadsheet,
} from 'lucide-react';
import { analyzeDDMRPManual, uploadDDMRPFile } from '@/lib/api';
import toast from 'react-hot-toast';
import { FileUploader } from '@/components/ui/FileUploader';
import { exportToExcel } from '@/utils/export';

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

export default function DDMRPPage() {
  const [results, setResults] = useState<any>(null);
  const [filterCabang, setFilterCabang] = useState<string>('All');
  const [filterKategori, setFilterKategori] = useState<string>('All');
  const [filterSku, setFilterSku] = useState<string>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const [showLiterature, setShowLiterature] = useState(false);
  const [activeMode, setActiveMode] = useState<'manual' | 'file'>('manual');

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
      setResults(data);
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
      setResults(data);
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
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <Layers className="w-8 h-8 text-primary" />
          DDMRP — Demand Driven MRP
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Buffer positioning & replenishment cerdas berbasis Net Flow Position — pendekatan modern pengganti MRP klasik.
        </p>
      </header>

      {/* Input Form */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <GlassCard>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <Calculator className="w-5 h-5 text-primary" />
                Input Parameter DDMRP
              </h3>
              <div className="flex bg-muted/50 p-1 rounded-lg">
                <button
                  onClick={() => setActiveMode('manual')}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${activeMode === 'manual' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Manual Input
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
                      Hitung Buffer DDMRP
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="space-y-6">
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

                <FileUploader
                  onFileUpload={handleFileUpload}
                  isLoading={isProcessing}
                  label="Upload Riwayat Sales & Inventory"
                  description="Upload file CSV/Excel berisi riwayat penjualan per SKU. Kolom opsional: Nama Cabang, Category Product, On-Hand, On-Order, Qualified Demand."
                  templateCsv={`Bulan,Deskripsi,Cabang,Kategori,Penjualan,Lead Time (Hari),MOQ,Order Cycle (Hari),On-Hand,On-Order,Qualified Demand
2024-01-01,Januari,Bali,Apparel,44806,14,500,7,12000,5000,2000
2024-01-01,Januari,Bali,Automotive,32476,21,100,14,8000,2000,1000`}
                />
              </div>
            )}
          </GlassCard>
        </div>

        {/* Info Panel */}
        <div className="md:col-span-1">
          <GlassCard className="h-full bg-muted/30">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-5 h-5 text-primary" />
              Tentang DDMRP
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-red-500 mt-1.5 shrink-0" />
                <span><strong className="text-destructive">Red Zone</strong>: Safety buffer — stok darurat untuk fluktuasi demand & supply.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-amber-500 mt-1.5 shrink-0" />
                <span><strong className="text-amber-500">Yellow Zone</strong>: Normal coverage — menutupi demand selama lead time.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-emerald-500 mt-1.5 shrink-0" />
                <span><strong className="text-emerald-500">Green Zone</strong>: Order sizing — minimum order quantity zone.</span>
              </li>
              <li className="flex items-start gap-2 pt-2 border-t border-border">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">Net Flow Position</strong>: NFP menentukan apakah perlu order — jika NFP jatuh di bawah Top of Yellow, sistem merekomendasikan order.</span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-10">
          
          {/* Summary & Filters */}
          <GlassCard className="mb-8 border-primary/20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-primary" />
                Ringkasan Analisis DDMRP
              </h2>
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
                  exportToExcel(exportData, 'DDMRP_Analysis_Result');
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export to Excel
              </button>
            </div>
            
            {results.results && (
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Filter Cabang</label>
                  <select 
                    value={filterCabang} 
                    onChange={e => { setFilterCabang(e.target.value); setFilterSku('All'); }}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="All">Semua Cabang</option>
                    {Array.from(new Set(results.results.map((r: any) => r.cabang || 'All'))).filter(x => x !== 'All').map((c: any) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Filter Kategori</label>
                  <select 
                    value={filterKategori} 
                    onChange={e => { setFilterKategori(e.target.value); setFilterSku('All'); }}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="All">Semua Kategori</option>
                    {Array.from(new Set(results.results.map((r: any) => r.kategori || 'All'))).filter(x => x !== 'All').map((k: any) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Cari SKU</label>
                  <select 
                    value={filterSku} 
                    onChange={e => setFilterSku(e.target.value)}
                    className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="All">Semua SKU (Max 20 Tampil)</option>
                    {results.results
                      .filter((r: any) => (filterCabang === 'All' || r.cabang === filterCabang) && (filterKategori === 'All' || r.kategori === filterKategori))
                      .map((r: any) => (
                        <option key={r.label} value={r.label}>{r.label}</option>
                      ))}
                  </select>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-card border border-border">
              {(() => {
                const dataArray = results.results || [results];
                const filteredData = dataArray.filter((res: any) => {
                  if (filterCabang !== 'All' && res.cabang !== filterCabang) return false;
                  if (filterKategori !== 'All' && res.kategori !== filterKategori) return false;
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
              if (filterCabang !== 'All' && res.cabang !== filterCabang) return false;
              if (filterKategori !== 'All' && res.kategori !== filterKategori) return false;
              if (filterSku !== 'All' && res.label !== filterSku) return false;
              return true;
            })
            .slice(0, filterSku === 'All' ? 20 : 1) // Batasi tampilan jika All agar tidak lag
            .map((res: any, idx: number) => (
            <div key={idx} className="space-y-6">
              {results.results && (
                <h2 className="text-xl font-bold text-primary mb-4 pb-2 border-b border-border/50">
                  {res.label} {res.cabang ? `(${res.cabang})` : ''}
                </h2>
              )}
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KPICard title="ADU" value={`${res.adu?.toFixed(2)} /hari`} icon={<Activity className="w-5 h-5" />} />
                <KPICard title="CoV" value={res.cov?.toFixed(3)} icon={<BarChart3 className="w-5 h-5" />} />
                <KPICard
                  title="Variability"
                  value={res.variability?.category}
                  icon={<AlertTriangle className="w-5 h-5" />}
                  trend={`VF: ${res.variability?.factor}`}
                />
                <KPICard
                  title="Lead Time"
                  value={res.lead_time?.category}
                  icon={<Truck className="w-5 h-5" />}
                  trend={`LTF: ${res.lead_time?.factor}`}
                />
                <KPICard
                  title="Net Flow"
                  value={res.net_flow_position?.toLocaleString()}
                  icon={<TrendingUp className="w-5 h-5" />}
                  isAlert={res.replenishment?.urgency === 'high'}
                />
              </div>

              {/* Buffer Chart */}
              <GlassCard>
                <DDMRPBufferChart
                  bufferZones={res.buffer_zones}
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
                          <td className={`py-2 px-3 font-medium ${row.color || ''}`}>{row.label}</td>
                          <td className={`py-2 px-3 text-right font-mono font-semibold ${row.color || ''}`}>{row.value?.toLocaleString()}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{row.desc}</td>
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
