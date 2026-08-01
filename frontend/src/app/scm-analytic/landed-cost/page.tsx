"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import {
  Ship, Download, AlertTriangle, DollarSign, Clock,
  Package, Info, UploadCloud, FileSpreadsheet, X
} from 'lucide-react';
import { uploadLandedCostFiles } from '@/lib/api';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';

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

export default function LandedCostPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [trackingFile, setTrackingFile] = useState<File | null>(null);
  const [allocationFile, setAllocationFile] = useState<File | null>(null);
  const [exchangeRate, setExchangeRate] = useState(16000);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastLandedCost');
      if (saved) setResults(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleAnalyze = async () => {
    if (!trackingFile || !allocationFile) {
      toast.error('Upload kedua file terlebih dahulu.');
      return;
    }
    setIsProcessing(true);
    toast.loading('Menghitung Landed Cost & Demurrage...', { id: 'lc' });
    try {
      const data = await uploadLandedCostFiles(trackingFile, allocationFile, exchangeRate);
      data.processed_at = data.processed_at || new Date().toISOString();
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

  const handleExport = () => {
    if (!results?.sku_costs?.length) { toast.error('Tidak ada data'); return; }
    const lines = ['No_BL,SKU,Qty,Weight_Kg,Weight_Ratio_%,Freight_USD,Duty_USD,THC_USD,Inland_USD,Total_Landed_USD,Total_Landed_IDR,Cost_Per_Unit_IDR'];
    for (const s of results.sku_costs) {
      lines.push(`"${s.no_bl}","${s.sku}",${s.qty},${s.weight_kg},${s.weight_ratio},${s.freight_alloc_usd},${s.duty_alloc_usd},${s.thc_alloc_usd},${s.inland_alloc_usd},${s.total_landed_usd},${s.total_landed_idr},${s.cost_per_unit_idr}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Landed_Cost_Report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Landed Cost report exported!');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <Ship className="w-8 h-8 text-primary" />
            Import Landed Cost Tracker
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Pantau kontainer impor, hitung HPP per unit, dan simulasi dampak kurs valas terhadap biaya.
          </p>
        </div>
        {results && (
          <button onClick={handleExport} className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm font-medium flex items-center gap-2">
            <Download className="w-4 h-4" /> Export Landed Cost
          </button>
        )}
      </header>

      {/* Upload Section */}
      {!results && (
        <GlassCard>
          <h3 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wide">Upload Data Impor</h3>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <FileDropZone label="1. Import Tracking" file={trackingFile} onFile={setTrackingFile} onClear={() => setTrackingFile(null)}
              templateCsv={TEMPLATE_TRACKING} templateName="template_import_tracking.csv" />
            <FileDropZone label="2. SKU Allocation" file={allocationFile} onFile={setAllocationFile} onClear={() => setAllocationFile(null)}
              templateCsv={TEMPLATE_ALLOCATION} templateName="template_sku_allocation.csv" />
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground font-medium">Kurs USD/IDR:</label>
              <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))}
                className="w-32 px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm" />
            </div>
            <button onClick={handleAnalyze} disabled={isProcessing || !trackingFile || !allocationFile}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              {isProcessing ? 'Memproses...' : <><Ship className="w-4 h-4" /> Hitung Landed Cost</>}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              🚢 Hasil Analisa Landed Cost & Demurrage
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Total Container" value={results.kpi.total_containers} icon={<Package />} />
            <KPICard title="Total Cost" value={`$${Number(results.kpi.total_cost_usd).toLocaleString('en-US')}`} icon={<DollarSign />} />
            <KPICard title="Demurrage Risk" value={results.kpi.demurrage_risk_count} icon={<AlertTriangle />} isAlert={results.kpi.demurrage_risk_count > 0} />
            <KPICard title="Avg HPP/Unit" value={`Rp ${Number(results.kpi.avg_cost_per_unit).toLocaleString('id-ID')}`} icon={<DollarSign />} />
          </div>

          {/* Demurrage Alerts */}
          {results.demurrage_alerts.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Demurrage Risk Alert
              </h3>
              {results.demurrage_alerts.map((a: any, i: number) => (
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
              <table className="w-full text-sm text-left text-muted-foreground">
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
                  {results.containers.map((c: any, i: number) => (
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
              Landed Cost Breakdown per SKU ({results.sku_costs.length} items)
            </h3>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-muted-foreground">
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
                  {results.sku_costs.map((s: any, i: number) => (
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
          {results.currency_simulations.length > 0 && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Simulasi Dampak Kurs Valas terhadap Total HPP
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.currency_simulations} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="rate" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`]} />
                    <Bar dataKey="total_idr" name="Total HPP (IDR)" radius={[4, 4, 0, 0]}>
                      {results.currency_simulations.map((entry: any, idx: number) => (
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
          {results.monte_carlo?.histogram && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Monte Carlo Simulation — Lead Time Kedatangan Impor
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.monte_carlo.histogram} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
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
                    <p className="text-lg font-bold text-foreground">{results.monte_carlo[p]} hr</p>
                  </div>
                ))}
              </div>
              {results.monte_carlo.recommendation && (
                <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm text-foreground">💡 {results.monte_carlo.recommendation}</p>
                </div>
              )}
            </GlassCard>
          )}

          {/* Re-upload */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Upload Ulang</h3>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <FileDropZone label="1. Import Tracking" file={trackingFile} onFile={setTrackingFile} onClear={() => setTrackingFile(null)}
                templateCsv={TEMPLATE_TRACKING} templateName="template_import_tracking.csv" />
              <FileDropZone label="2. SKU Allocation" file={allocationFile} onFile={setAllocationFile} onClear={() => setAllocationFile(null)}
                templateCsv={TEMPLATE_ALLOCATION} templateName="template_sku_allocation.csv" />
            </div>
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Kurs:</label>
                <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))}
                  className="w-28 px-2 py-1.5 bg-background border border-border rounded text-foreground text-sm" />
              </div>
              <button onClick={handleAnalyze} disabled={isProcessing || !trackingFile || !allocationFile}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition text-sm font-bold">
                {isProcessing ? 'Memproses...' : 'Hitung Ulang'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
