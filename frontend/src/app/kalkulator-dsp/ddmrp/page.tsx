/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { DDMRPBufferChart } from '@/components/charts/DDMRPBufferChart';
import {
  Layers, Activity, TrendingDown, TrendingUp, AlertTriangle,
  ChevronDown, ChevronUp, BookOpen, Cpu, Package, Truck,
  Info, ShieldCheck, BarChart3, Calculator,
} from 'lucide-react';
import { analyzeDDMRPManual } from '@/lib/api';
import toast from 'react-hot-toast';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const [showLiterature, setShowLiterature] = useState(false);

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
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 uppercase tracking-wide">
              <Calculator className="w-5 h-5 text-primary" />
              Input Parameter DDMRP
            </h3>

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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KPICard title="ADU" value={`${results.adu?.toFixed(2)} /hari`} icon={<Activity className="w-5 h-5" />} />
            <KPICard title="CoV" value={results.cov?.toFixed(3)} icon={<BarChart3 className="w-5 h-5" />} />
            <KPICard
              title="Variability"
              value={results.variability?.category}
              icon={<AlertTriangle className="w-5 h-5" />}
              trend={`VF: ${results.variability?.factor}`}
            />
            <KPICard
              title="Lead Time"
              value={results.lead_time?.category}
              icon={<Truck className="w-5 h-5" />}
              trend={`LTF: ${results.lead_time?.factor}`}
            />
            <KPICard
              title="Net Flow"
              value={results.net_flow_position?.toLocaleString()}
              icon={<TrendingUp className="w-5 h-5" />}
              isAlert={results.replenishment?.urgency === 'high'}
            />
          </div>

          {/* Buffer Chart */}
          <GlassCard>
            <DDMRPBufferChart
              bufferZones={results.buffer_zones}
              netFlowPosition={results.net_flow_position}
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
                {getUrgencyBadge(results.replenishment?.urgency)}
              </div>
              <div className="flex-1">
                <p className="text-sm text-foreground font-medium">{results.replenishment?.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
                  <div>
                    <span className="text-muted-foreground uppercase tracking-wider">Zone</span>
                    <p className="font-bold text-foreground mt-0.5">{results.replenishment?.zone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase tracking-wider">Order Qty</span>
                    <p className="font-bold text-foreground mt-0.5">{results.replenishment?.suggested_order_qty?.toLocaleString()} unit</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase tracking-wider">On-Hand</span>
                    <p className="font-bold text-foreground mt-0.5">{results.on_hand?.toLocaleString()} unit</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase tracking-wider">On-Order</span>
                    <p className="font-bold text-foreground mt-0.5">{results.on_order?.toLocaleString()} unit</p>
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
                    { label: 'Red Base', value: results.buffer_zones?.red_base, desc: 'ADU × DLT × LTF' },
                    { label: 'Red Safety', value: results.buffer_zones?.red_safety, desc: 'Red Base × VF' },
                    { label: 'Red Zone', value: results.buffer_zones?.red_zone, desc: 'Red Base + Red Safety', color: 'text-red-400' },
                    { label: 'Yellow Zone', value: results.buffer_zones?.yellow_zone, desc: 'ADU × DLT', color: 'text-amber-400' },
                    { label: 'Green Zone', value: results.buffer_zones?.green_zone, desc: 'max(ADU×DLT×LTF, ADU×OC, MOQ)', color: 'text-emerald-400' },
                    { label: 'Top of Red (TOR)', value: results.buffer_zones?.top_of_red, desc: 'Batas atas zona merah' },
                    { label: 'Top of Yellow (TOY)', value: results.buffer_zones?.top_of_yellow, desc: 'Trigger replenishment' },
                    { label: 'Top of Green (TOG)', value: results.buffer_zones?.top_of_green, desc: 'Target order sampai sini' },
                    { label: 'Net Flow Position', value: results.net_flow_position, desc: 'OH + OO − QD', color: 'text-primary font-bold' },
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
