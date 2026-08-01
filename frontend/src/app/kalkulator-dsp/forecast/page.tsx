"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { ForecastChart } from '@/components/charts/ForecastChart';
import { ModelComparisonTable } from '@/components/charts/ModelComparisonTable';
import { LineChart, Info, AlertTriangle, Cpu, Target, BrainCircuit, Download, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { uploadForecastFile } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';

export default function ForecastPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  
  const [selectedCabang, setSelectedCabang] = useState<string[]>(["All"]);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(["All"]);
  const [selectedMethod, setSelectedMethod] = useState<string>("");

  // ── Restore previous results from localStorage ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lastForecast');
      if (saved) {
        const data = JSON.parse(saved);
        setResults(data);
        if (data.best_model) setSelectedMethod(data.best_model);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Training ML Models (SMA, SES, SARIMAX, XGBoost) per Cabang & Kategori...', { id: 'forecast-upload' });

    try {
      const data = await uploadForecastFile(file);
      if (data.error) {
        toast.error(data.error, { id: 'forecast-upload' });
      } else {
        data.processed_at = data.processed_at || new Date().toISOString();
        setResults(data);
        setSelectedMethod(data.best_model);
        try {
          localStorage.setItem('lastForecast', JSON.stringify(data));
        } catch (e) {
          console.warn('Data terlalu besar untuk disimpan di memori browser');
        }
        toast.success('Analysis complete!', { id: 'forecast-upload' });
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.message || 'Failed to train models. Check data format.';
      toast.error(msg, { id: 'forecast-upload' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!results) return;

    const methods = results.available_methods || ['SMA-3', 'SES', 'Trend', 'SARIMAX', 'XGBoost', 'SAMAI', 'BiLSTM', 'Hybrid Ensemble', 'Fb Prophet', 'ARIMAX', 'GNN', 'LightGBM', 'GARCH', 'Wavelet', 'LSTM-GRU'];
    const methodCols = methods.join(',');

    const lines = [
      `Cabang,Category,Date,Actual,${methodCols},Is Anomaly,Is Future,Best Model,MAPE,Bias,MAD,RMSE,ROP,Safety Stock`,
      ...(results.forecast_data || []).map((r: any) => {
        const methodVals = methods.map((m: string) => r.forecasts?.[m] ?? '').join(',');
        return `"${r.cabang}","${r.category}","${r.date}",${r.actual ?? ''},${methodVals},${r.is_anomaly},${r.is_future},"${r.best_model || ''}",${r.mape?.toFixed(2) || ''},${r.bias?.toFixed(2) || ''},${r.mad?.toFixed(2) || ''},${r.rmse?.toFixed(2) || ''},${r.rop?.toFixed(2) || ''},${r.safety_stock?.toFixed(2) || ''}`;
      })
    ];

    // DSP Insights section
    const insights: string[] = results.ai_insights || [];
    if (insights.length > 0) {
      lines.push('');
      lines.push('--- DSP INSIGHTS ---');
      insights.forEach((ins: string) => lines.push(`"${ins}"`));
    }

    // KPI Summary
    lines.push('');
    lines.push('--- DSP KPI SUMMARY ---');
    lines.push(`Best Model (Global),${results.best_model || 'N/A'}`);
    lines.push(`Avg Safety Stock,${results.inventory_kpis?.avg_safety_stock || 0}`);
    lines.push(`Avg Reorder Point,${results.inventory_kpis?.avg_reorder_point || 0}`);

    // Model Tally
    const tally = results.model_tally || {};
    if (Object.keys(tally).length > 0) {
      lines.push('');
      lines.push('--- DSP MODEL DISTRIBUTION ---');
      lines.push('Model,Count');
      Object.entries(tally).forEach(([model, count]) => lines.push(`${model},${count}`));
    }

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `Hasil Forecast_${dateStr}_DSP.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Full report exported with DSP Insights!');
  };

  const cabangs = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.forecast_data.map((d:any) => d.cabang)))];
  }, [results]);

  const categories = useMemo(() => {
    if (!results) return [];
    return ["All", ...Array.from(new Set<string>(results.forecast_data.map((d:any) => d.category)))];
  }, [results]);

  const filteredData = useMemo(() => {
    if (!results) return [];
    return results.forecast_data.filter((d: any) => 
      (selectedCabang.includes("All") || selectedCabang.includes(d.cabang)) &&
      (selectedCategory.includes("All") || selectedCategory.includes(d.category))
    );
  }, [results, selectedCabang, selectedCategory]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3 uppercase">
          <LineChart className="w-8 h-8 text-primary" />
          Advanced Causal Sales Forecasting
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">
          Hierarchical forecasting combining historical trends with exogenous variables per branch and category.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6 mb-8 items-stretch">
        <div className="md:col-span-2">
          <GlassCard className="h-full bg-muted/30 flex flex-col justify-center">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 uppercase tracking-wide">
              <BrainCircuit className="w-5 h-5 text-primary" /> Auto-ML Pipeline
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground leading-relaxed">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">SMA & SES</strong>: Baseline & exponential smoothing stabil.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">XGBoost & LightGBM</strong>: Machine Learning untuk interaksi kompleks.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">ARIMAX & Fb Prophet</strong>: Menangkap pola musiman & tren.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">Hybrid (BiLSTM + XGB)</strong>: Ensemble adaptif untuk fluktuasi tinggi.</span>
              </li>
              <li className="flex items-start gap-2 sm:col-span-2">
                <div className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                <span><strong className="text-foreground">Covariates Optimization</strong>: Variabel eksogen (AO, RO, Drop Size, NOO) sebagai *multiplier* pendorong akurasi.</span>
              </li>
            </ul>
          </GlassCard>
        </div>
        <div className="md:col-span-1 flex flex-col">
          <GlassCard className="h-full flex items-center justify-center p-3">
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              templateCsv={
                'Bulan,Deskripsi,Cabang,Kategori,Penjualan,AO,RO,Rerata Drop Size,NOO\n' +
                '2024-01-01,Januari,Bali,Apparel,44806,681,141,956,51\n' +
                '2024-01-01,Januari,Bali,Automotive,32476,296,227,121,8\n' +
                '2024-01-01,Januari,Bali,Building Materials,95630,593,365,832,11'
              }
              templateName="forecast_template.csv"
              label="Upload Historis Penjualan"
              description="CSV: Bulan, Deskripsi, Cabang, Kategori, Penjualan, AO, RO, Drop Size, NOO."
            />
          </GlassCard>
        </div>
      </div>

      {results && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              📊 Hasil Analisa Forecasting ML
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            <KPICard title="Majority Best Model" value={results.best_model} icon={<Cpu />} />
            <KPICard title="Reorder Point (ROP)" value={results.inventory_kpis?.avg_reorder_point || 0} icon={<BrainCircuit />} />
            <KPICard title="Avg Safety Stock" value={results.inventory_kpis?.avg_safety_stock || 0} icon={<AlertTriangle />} />
            <KPICard title="Total Datapoints" value={filteredData.length} icon={<Target />} />
          </div>

          <GlassCard>
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 border-b border-border pb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">Actual vs Forecast</h3>
                <div className="flex flex-wrap gap-3 mt-4">
                  <MultiSelect
                    options={cabangs}
                    selected={selectedCabang}
                    onChange={setSelectedCabang}
                    selectAllLabel="Semua Cabang"
                  />
                  <MultiSelect
                    options={categories}
                    selected={selectedCategory}
                    onChange={setSelectedCategory}
                    selectAllLabel="Semua Kategori"
                  />
                  <select 
                    value={selectedMethod} 
                    onChange={e => setSelectedMethod(e.target.value)} 
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm text-primary font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary hover:border-primary/50 transition-colors"
                  >
                    {results.available_methods.map((m:string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 shrink-0 mt-4 md:mt-0">
                <button onClick={handleExport}
                  className="px-4 py-2 bg-background text-foreground border border-border rounded-md hover:border-primary transition text-sm flex items-center gap-2 font-medium">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
              </div>
            </div>
            
            {filteredData.length > 0
              ? <ForecastChart data={filteredData} activeMethod={selectedMethod} />
              : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                  Tidak ada data untuk filter yang dipilih.
                </div>
            }
          </GlassCard>

          {/* Model Comparison Table rendering based on current selection */}
          {results && results.model_comparison && (
            <ModelComparisonTable modelComparison={results.model_comparison} />
          )}

          {/* Literature Benchmark Table */}
          <GlassCard>
            <button
              onClick={() => setShowBenchmark(!showBenchmark)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <BookOpen className="w-5 h-5 text-primary" />
                Benchmark Literatur Forecasting
              </h3>
              {showBenchmark ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showBenchmark && (
              <div className="mt-6 space-y-6 animate-in fade-in duration-300">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                        <th className="text-left py-2 px-3">Studi / Konteks</th>
                        <th className="text-left py-2 px-3">Metode Dibandingkan</th>
                        <th className="text-left py-2 px-3">Hasil Error Terendah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {[
                        { study: 'Retail multi-store (GNN paper)', methods: 'ARIMA vs XGBoost vs LSTM vs GNN', result: 'XGBoost solid di banyak toko, MAPE 2,2–3,3%' },
                        { study: 'Retail supply chain', methods: 'ARIMA, Gradient Boosting, LSTM, BiLSTM', result: 'BiLSTM unggul, RMSE/MAE turun 42,35% & 40,10% vs ARIMA' },
                        { study: 'Hybrid ensemble (M5 Walmart)', methods: 'XGBoost, LightGBM, LSTM-GRU, stacked', result: 'XGBoost MAE 0,82 / MAPE 26,88%; ensemble RMSE terendah (1,48)' },
                        { study: 'Inventory + variabel eksternal', methods: 'XGBoost, ARIMAX, Fb Prophet', result: 'XGBoost unggul, MAE 22,7 dgn variabel eksternal' },
                        { study: 'Forecast perishable (PMC)', methods: 'SAMAI, Simple Average, SARIMA', result: 'SAMAI MAPE 13–27%; mengungguli SARIMA' },
                        { study: 'Retail seasonality tinggi', methods: 'Metode tradisional vs LSTM', result: 'LSTM MAPE 16,43% vs 28,76% tradisional (perbaikan 42,87%)' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium text-foreground">{row.study}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{row.methods}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{row.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 rounded-lg bg-card/50 border border-border/50">
                  <h4 className="text-sm font-bold text-foreground mb-3">Kesimpulan Pola Umum</h4>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                      <span><strong className="text-foreground">XGBoost/Gradient Boosting</strong> unggul saat ada banyak variabel eksogen (harga, promo, kalender, cuaca).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                      <span><strong className="text-foreground">LSTM/BiLSTM/GRU</strong> unggul saat pola permintaan punya dependensi temporal kompleks & non-linear jangka panjang.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                      <span><strong className="text-foreground">Model hybrid/ensemble</strong> umumnya memberi kombinasi MAPE-RMSE-MAE paling stabil dan std dev error paling kecil.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-none bg-primary mt-1.5 shrink-0" />
                      <span><strong className="text-foreground">Metode klasik (ARIMA/SARIMA)</strong> tetap kompetitif untuk deret waktu stabil, tapi kalah saat volatilitas & promosi tinggi.</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Factors Affecting Accuracy */}
          <GlassCard>
            <button
              onClick={() => setShowFactors(!showFactors)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wide">
                <Info className="w-5 h-5 text-primary" />
                Faktor yang Memengaruhi Akurasi Forecasting
              </h3>
              {showFactors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showFactors && (
              <div className="mt-6 grid md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                {[
                  { title: 'Promosi & Event', desc: 'Promosi dan event drive demand spikes — flag deviasi penjualan kontribusi tertinggi (~0,175) pada feature importance XGBoost.' },
                  { title: 'Seasonality & Hari Libur', desc: 'Musim dan hari libur publik berkontribusi signifikan (~0,075) pada peningkatan akurasi forecasting.' },
                  { title: 'Hari dalam Minggu', desc: 'Day-of-week effect punya kontribusi ~0,125 — pola pembelian berbeda di hari kerja vs weekend.' },
                  { title: 'Lag & Rolling Statistics', desc: 'Lag demand (t-1, t-7) dan rolling mean/std meningkatkan kemampuan model menangkap pola temporal.' },
                  { title: 'Variabel Eksternal', desc: 'Harga bahan bakar, CPI, cuaca, tren pasar terbukti meningkatkan akurasi model boosting.' },
                  { title: 'Volatilitas Demand', desc: 'Faktor endogen & eksogen — musim, promosi, cuaca — berkontribusi pada volatilitas yang memengaruhi error forecasting.' },
                ].map((item, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-card/50 border border-border/50">
                    <h4 className="text-sm font-bold text-foreground">{item.title}</h4>
                    <p className="mt-1.5 text-xs text-muted-foreground">{item.desc}</p>
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
