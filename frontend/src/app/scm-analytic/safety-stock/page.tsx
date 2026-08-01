"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  ShieldCheck, AlertTriangle, TrendingUp, Package,
  Download, Activity, Layers, CheckCircle, XCircle, Info
} from 'lucide-react';
import { uploadSafetyStockFile } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

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

export default function SafetyStockPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [serviceLevel, setServiceLevel] = useState(0.95);
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(['All']);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastSafetyStock');
      if (saved) setResults(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Menghitung Safety Stock & ROP...', { id: 'ss' });
    try {
      const data = await uploadSafetyStockFile(file);
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
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
    if (!results?.results) return ['All'];
    const s = new Set<string>();
    results.results.forEach((r: any) => s.add(r.cabang));
    return ['All', ...Array.from(s).sort()];
  }, [results]);

  const statusOptions = ['All', 'CRITICAL', 'WARNING', 'SAFE', 'OVERSTOCK'];

  const filtered = useMemo(() => {
    if (!results?.results) return [];
    return results.results.filter((r: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(r.cabang)) &&
      (selectedStatus.includes('All') || selectedStatus.includes(r.status))
    );
  }, [results, selectedCabang, selectedStatus]);

  // ── DDMRP Zone chart data ──
  const zoneChartData = useMemo(() => {
    if (!results?.zone_data) return [];
    const cabangMap: Record<string, { red: number; yellow: number; green: number; net_flow: number; count: number }> = {};
    for (const z of results.zone_data) {
      if (!selectedCabang.includes('All') && !selectedCabang.includes(z.cabang)) continue;
      if (!cabangMap[z.cabang]) cabangMap[z.cabang] = { red: 0, yellow: 0, green: 0, net_flow: 0, count: 0 };
      cabangMap[z.cabang].red += z.red_zone;
      cabangMap[z.cabang].yellow += z.yellow_zone;
      cabangMap[z.cabang].green += z.green_zone;
      cabangMap[z.cabang].net_flow += z.net_flow;
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
    if (!results?.lead_time_matrix) return [];
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
    a.download = `Safety_Stock_ROP_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Safety Stock report exported!');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <ShieldCheck className="w-8 h-8 text-primary" />
            Dynamic Safety Stock & ROP
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Kalkulasi Safety Stock, Reorder Point, dan DDMRP Zones secara dinamis per SKU per Cabang.
          </p>
        </div>
        {results && (
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelect options={allCabangs} selected={selectedCabang} onChange={setSelectedCabang} selectAllLabel="Semua Cabang" />
            <MultiSelect options={statusOptions} selected={selectedStatus} onChange={setSelectedStatus} selectAllLabel="Semua Status" />
            <button onClick={handleExport} className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        )}
      </header>

      {/* Upload Section */}
      {!results && (
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          <div className="md:col-span-2 flex flex-col justify-center">
            <GlassCard className="h-full flex flex-col justify-center bg-muted/30 p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide text-foreground">
                <Info className="w-5 h-5 text-primary" /> Panduan & Parameter Safety Stock
              </h3>
              <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
                <p><strong>Service Level Target:</strong> Secara default diset 95%. Sistem akan menghitung nilai Z-score secara otomatis berdasarkan distribusi normal standar.</p>
                <p><strong>DDMRP Zones:</strong> Pembagian zona secara dinamis ke dalam Red (Safety Buffer), Yellow (Primary Coverage), dan Green (Order Generation & Cycle Buffer).</p>
                <p><strong>Net Flow Position:</strong> Dihitung melalui rumus <em>Stock + In_Transit - Backorder</em>. Sistem akan memberikan alert otomatis jika posisi ini ≤ ROP.</p>
              </div>
            </GlassCard>
          </div>
          <div className="md:col-span-1 flex flex-col">
            <GlassCard className="h-full flex items-center justify-center p-3">
              <FileUploader
                onFileUpload={handleFileUpload}
                isLoading={isProcessing}
                label="Upload Safety Stock"
                description="CSV/Excel: Cabang, SKU, Daily_Usage, Lead_Time_Days."
                templateCsv={TEMPLATE_CSV}
                templateName="template_safety_stock.csv"
              />
            </GlassCard>
          </div>
        </div>
      )}

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
                <BarChart data={results.service_level_simulations} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="service_level" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }} />
                  <Bar dataKey="total_safety_stock" name="Total Safety Stock" radius={[4, 4, 0, 0]}>
                    {results.service_level_simulations.map((entry: any, idx: number) => (
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
                    <XAxis dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={80} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
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
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} unit=" hari" />
                    <YAxis type="category" dataKey="cabang" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} width={75} />
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
          {results.alerts.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Reorder Alerts — Cabang Butuh Pengisian Segera
              </h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left text-muted-foreground">
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
                    {results.alerts
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
              <table className="w-full text-sm text-left text-muted-foreground">
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
