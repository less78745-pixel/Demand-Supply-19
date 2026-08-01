"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import {
  ArrowLeftRight, Download, Truck, DollarSign, AlertTriangle,
  Package, CheckCircle, Info, UploadCloud, FileSpreadsheet, X
} from 'lucide-react';
import { uploadRebalancingFiles } from '@/lib/api';
import toast from 'react-hot-toast';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';

const TEMPLATE_STOCK = `Cabang,SKU,Qty_Available
Jakarta,SKU-001,5000
Jakarta,SKU-002,3000
Jakarta,SKU-003,8000
Surabaya,SKU-001,2000
Surabaya,SKU-002,1500
Surabaya,SKU-003,4000
Bandung,SKU-001,800
Denpasar,SKU-001,1200
Denpasar,SKU-002,600
Makassar,SKU-001,300
Makassar,SKU-003,2500
Semarang,SKU-001,900
Medan,SKU-001,400
Balikpapan,SKU-001,350`;

const TEMPLATE_DEMAND = `Cabang,Entity,SKU,Qty_Needed,Max_Lead_Time_Days
Manado,PT Alpha,SKU-001,500,14
Kupang,PT Alpha,SKU-001,200,21
Jayapura,PT Alpha,SKU-001,150,28
Ambon,PT Beta,SKU-001,100,25
Mataram,PT Beta,SKU-002,300,10
Kendari,PT Alpha,SKU-003,400,18
Palu,PT Beta,SKU-001,250,15
Pontianak,PT Alpha,SKU-002,350,12
Makassar,PT Alpha,SKU-001,800,7
Lampung,PT Beta,SKU-001,600,5
Padang,PT Alpha,SKU-001,300,10`;

const TEMPLATE_FREIGHT = `Origin,Destination,Mode,Cost_Per_Ton,Capacity_Max,Lead_Time_Est
Jakarta,Manado,Laut,8500,1000,12
Jakarta,Manado,Udara,25000,200,2
Surabaya,Manado,Laut,7000,800,10
Jakarta,Kupang,Laut,9000,500,18
Surabaya,Kupang,Laut,7500,500,15
Jakarta,Jayapura,Laut,12000,300,25
Jakarta,Jayapura,Udara,35000,100,3
Jakarta,Ambon,Laut,10000,400,20
Denpasar,Mataram,Roro,3000,600,1
Surabaya,Mataram,Laut,4500,500,3
Surabaya,Kendari,Laut,6500,500,8
Makassar,Kendari,Darat,4000,300,2
Jakarta,Palu,Laut,8000,500,12
Makassar,Palu,Darat,3500,400,2
Jakarta,Pontianak,Laut,5500,800,5
Jakarta,Makassar,Laut,7000,1000,7
Jakarta,Makassar,Udara,22000,200,1
Surabaya,Makassar,Laut,5500,800,5
Jakarta,Lampung,Darat,2000,1000,1
Jakarta,Padang,Laut,5000,600,4
Jakarta,Padang,Darat,6000,300,3`;

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
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              const blob = new Blob(['\ufeff' + templateCsv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = templateName; a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-1 px-2 py-1 bg-primary/20 hover:bg-primary/40 text-primary text-xs rounded border border-primary/50 transition"
          >
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

export default function RebalancingPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [demandFile, setDemandFile] = useState<File | null>(null);
  const [freightFile, setFreightFile] = useState<File | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string[]>(['All']);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastRebalancing');
      if (saved) setResults(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleAnalyze = async () => {
    if (!stockFile || !demandFile || !freightFile) {
      toast.error('Upload ketiga file terlebih dahulu.');
      return;
    }
    setIsProcessing(true);
    toast.loading('Mengoptimasi distribusi stok antar-cabang...', { id: 'rb' });
    try {
      const data = await uploadRebalancingFiles(stockFile, demandFile, freightFile);
      data.processed_at = data.processed_at || new Date().toISOString();
      setResults(data);
      try { localStorage.setItem('lastRebalancing', JSON.stringify(data)); } catch {}
      toast.success('Optimasi selesai!', { id: 'rb' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Gagal memproses.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'rb' });
    } finally {
      setIsProcessing(false);
    }
  };

  const entityOptions = useMemo(() => {
    if (!results?.recommendations) return ['All'];
    const s = new Set<string>();
    results.recommendations.forEach((r: any) => s.add(r.entity));
    return ['All', ...Array.from(s).sort()];
  }, [results]);

  const filtered = useMemo(() => {
    if (!results?.recommendations) return [];
    return results.recommendations.filter((r: any) =>
      selectedEntity.includes('All') || selectedEntity.includes(r.entity)
    );
  }, [results, selectedEntity]);

  const handleExportSTO = () => {
    if (!filtered.length) { toast.error('Tidak ada data untuk di-export'); return; }
    const lines = ['Origin,Destination,Entity,SKU,Qty,Mode,Cost_Per_Ton,Total_Cost,Lead_Time'];
    for (const r of filtered) {
      lines.push(`"${r.origin}","${r.destination}","${r.entity}","${r.sku}",${r.qty},"${r.mode}",${r.cost_per_ton},${r.total_cost},${r.lead_time}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Draft_STO_Rebalancing_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Draft STO exported!');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
            <ArrowLeftRight className="w-8 h-8 text-primary" />
            Stock Rebalancing Optimizer
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Optimasi pemindahan stok antar-cabang dengan biaya logistik terendah. Perhitungan dipartisi ketat per entitas perusahaan tujuan.
          </p>
        </div>
        {results && (
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelect options={entityOptions} selected={selectedEntity} onChange={setSelectedEntity} selectAllLabel="Semua Entity" />
            <button onClick={handleExportSTO} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
              <Download className="w-4 h-4" /> Download Draft STO
            </button>
          </div>
        )}
      </header>

      {/* Upload Section */}
      {!results && (
        <GlassCard>
          <h3 className="text-sm font-bold text-foreground mb-6 uppercase tracking-wide">Upload 3 File Data</h3>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <FileDropZone label="1. Stock Saat Ini" file={stockFile} onFile={setStockFile} onClear={() => setStockFile(null)}
              templateCsv={TEMPLATE_STOCK} templateName="template_stock_current.csv" />
            <FileDropZone label="2. Demand / Defisit" file={demandFile} onFile={setDemandFile} onClear={() => setDemandFile(null)}
              templateCsv={TEMPLATE_DEMAND} templateName="template_demand_target.csv" />
            <FileDropZone label="3. Matriks Tarif Freight" file={freightFile} onFile={setFreightFile} onClear={() => setFreightFile(null)}
              templateCsv={TEMPLATE_FREIGHT} templateName="template_freight_matrix.csv" />
          </div>
          <div className="flex justify-center">
            <button onClick={handleAnalyze} disabled={isProcessing || !stockFile || !demandFile || !freightFile}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              {isProcessing ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Memproses...</>
              ) : (
                <><ArrowLeftRight className="w-4 h-4" /> Jalankan Optimasi</>
              )}
            </button>
          </div>
          <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Constraint Entity:</strong> Perhitungan kebutuhan dan alokasi per perusahaan tujuan dipisah ketat, tidak digabung.</p>
                <p><strong>Pre-filter Lead Time:</strong> Opsi pengiriman yang melebihi target waktu otomatis didiskualifikasi.</p>
                <p><strong>Infeasible:</strong> Jika stok tidak cukup, sistem menampilkan status, bukan error.</p>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              ⚖️ Hasil Optimasi Stock Rebalancing
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Total Transfer" value={results.kpi.total_transfers} icon={<Truck />} />
            <KPICard title="Total Biaya" value={`Rp ${Number(results.kpi.total_cost).toLocaleString('id-ID')}`} icon={<DollarSign />} />
            <KPICard title="Hemat vs Central" value={`Rp ${Number(results.kpi.savings).toLocaleString('id-ID')}`} icon={<CheckCircle />} />
            <KPICard title="Infeasible" value={results.kpi.infeasible_count} icon={<AlertTriangle />} isAlert={results.kpi.infeasible_count > 0} />
          </div>

          {/* Savings indicator */}
          {results.kpi.savings > 0 && (
            <GlassCard className="border-green-500/30 bg-green-500/5">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <div>
                  <p className="text-sm font-bold text-green-500">
                    Penghematan {results.kpi.savings_pct}% — Rp {Number(results.kpi.savings).toLocaleString('id-ID')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dibandingkan dengan pengiriman seluruhnya dari Central Warehouse (Rp {Number(results.kpi.total_cost_central).toLocaleString('id-ID')}).
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Route Summary Chart */}
          {results.route_summary.length > 0 && (
            <GlassCard>
              <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
                Ringkasan Biaya per Rute Distribusi
              </h3>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.route_summary} layout="vertical" margin={{ top: 10, right: 20, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="route" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} width={95} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`]} />
                    <Bar dataKey="total_cost" name="Total Biaya" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {/* Recommendations Table */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">
              Rekomendasi Transfer ({filtered.length} items)
            </h3>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-muted-foreground">
                <thead className="text-xs text-foreground uppercase bg-muted/50 border-b border-border sticky top-0 font-bold tracking-wider z-10">
                  <tr>
                    <th className="px-3 py-3">Entity</th>
                    <th className="px-3 py-3">Origin</th>
                    <th className="px-3 py-3">→ Destination</th>
                    <th className="px-3 py-3">SKU</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3 text-right">Rp/Ton</th>
                    <th className="px-3 py-3 text-right">Total Cost</th>
                    <th className="px-3 py-3 text-right">LT (hari)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-primary">{r.entity}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{r.origin}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{r.destination}</td>
                      <td className="px-3 py-2.5">{r.sku}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{r.qty}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                          r.mode === 'Udara' ? 'bg-blue-500/20 text-blue-400' :
                          r.mode === 'Laut' ? 'bg-cyan-500/20 text-cyan-400' :
                          r.mode === 'Darat' ? 'bg-green-500/20 text-green-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{r.mode}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{Number(r.cost_per_ton).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right font-medium">Rp {Number(r.total_cost).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right">{r.lead_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Infeasible */}
          {results.infeasible.length > 0 && (
            <GlassCard className="border-destructive/30 bg-destructive/5">
              <h3 className="text-sm font-bold text-destructive mb-4 uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Infeasible — Tidak Dapat Dipenuhi
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-muted-foreground">
                  <thead className="text-xs text-foreground uppercase bg-destructive/10 border-b border-destructive/20 font-bold">
                    <tr>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Destination</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3 text-right">Unfulfilled</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.infeasible.map((inf: any, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-4 py-3 font-medium text-primary">{inf.entity}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{inf.destination}</td>
                        <td className="px-4 py-3">{inf.sku}</td>
                        <td className="px-4 py-3 text-right text-destructive font-bold">{inf.qty_unfulfilled}</td>
                        <td className="px-4 py-3 text-xs">{inf.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Re-upload */}
          <GlassCard>
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wide">Upload Ulang</h3>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <FileDropZone label="1. Stock Saat Ini" file={stockFile} onFile={setStockFile} onClear={() => setStockFile(null)}
                templateCsv={TEMPLATE_STOCK} templateName="template_stock_current.csv" />
              <FileDropZone label="2. Demand / Defisit" file={demandFile} onFile={setDemandFile} onClear={() => setDemandFile(null)}
                templateCsv={TEMPLATE_DEMAND} templateName="template_demand_target.csv" />
              <FileDropZone label="3. Matriks Tarif Freight" file={freightFile} onFile={setFreightFile} onClear={() => setFreightFile(null)}
                templateCsv={TEMPLATE_FREIGHT} templateName="template_freight_matrix.csv" />
            </div>
            <div className="flex justify-center">
              <button onClick={handleAnalyze} disabled={isProcessing || !stockFile || !demandFile || !freightFile}
                className="px-8 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition text-sm font-bold uppercase tracking-wide flex items-center gap-2">
                {isProcessing ? 'Memproses...' : 'Jalankan Ulang Optimasi'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
