"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { ForecastChart } from '@/components/charts/ForecastChart';
import { ModelComparisonTable } from '@/components/charts/ModelComparisonTable';
import { LineChart, Info, AlertTriangle, Cpu, Target, BrainCircuit, Download, BookOpen, ChevronDown, ChevronUp, Sparkles, HelpCircle, FileSpreadsheet, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { uploadForecastFile } from '@/lib/api';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';
import { getStandardFilename } from '@/utils/export';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

type ScenarioType = 'actual' | 'promo' | 'recession';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Prediksi Baseline ML & Aktual (Standard)',
    desc: 'Prospeki peramalan permintaan berbasis 15 Algoritma ML (XGBoost, Hybrid Ensemble, Prophet) berdasarkan historis murni.',
    color: 'from-purple-600 to-indigo-500',
    icon: LineChart,
    modifier: 1.0
  },
  {
    id: 'promo' as ScenarioType,
    title: 'Jalur 2: Simulasi Lonjakan Promosi (+25% Demand)',
    desc: 'Simulasi dampak promosi besar, diskon musiman, atau peningkatan rasio Active Outlet (AO) & New Outlet (NOO) terhadap stok.',
    color: 'from-emerald-600 to-teal-500',
    icon: TrendingUp,
    modifier: 1.25
  },
  {
    id: 'recession' as ScenarioType,
    title: 'Jalur 3: Simulasi Penurunan Pasar (-15% Contraction)',
    desc: 'Uji stress jika daya beli pasar terkontraksi atau terjadi penundaan pesanan oleh Repeat Outlet (RO) maupun penurunan Drop Size.',
    color: 'from-rose-600 to-orange-500',
    icon: TrendingDown,
    modifier: 0.85
  }
];

function generateDemoForecast() {
  const dates = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01 (Future)', '2026-08-01 (Future)'];
  const cabangs = ['Bali', 'Jakarta', 'Surabaya'];
  const categories = ['Apparel', 'Automotive', 'Electronics'];
  const available_methods = ['Hybrid Ensemble', 'XGBoost', 'SARIMAX', 'Fb Prophet', 'SMA-3'];

  const forecast_data: any[] = [];
  cabangs.forEach(c => {
    categories.forEach(cat => {
      let base = cat === 'Electronics' ? 85000 : cat === 'Apparel' ? 45000 : 32000;
      dates.forEach(dt => {
        const isFuture = dt.includes('Future');
        const act = isFuture ? null : Math.round(base + (Math.random() - 0.4) * 5000);
        const fcs: any = {};
        available_methods.forEach(m => {
          fcs[m] = Math.round(base + (Math.random() - 0.3) * 4000);
        });
        forecast_data.push({
          cabang: c,
          category: cat,
          date: dt.split(' ')[0],
          actual: act,
          forecasts: fcs,
          best_model: 'Hybrid Ensemble',
          is_anomaly: Math.random() < 0.1,
          is_future: isFuture,
          mape: 4.2,
          bias: 1.1,
          mad: 1250,
          rmse: 1540,
          rop: Math.round(base * 1.3),
          safety_stock: Math.round(base * 0.4)
        });
        base *= 1.02; // gradual growth
      });
    });
  });

  return {
    processed_at: new Date().toISOString(),
    best_model: 'Hybrid Ensemble (BiLSTM + XGBoost)',
    available_methods,
    forecast_data,
    inventory_kpis: { avg_reorder_point: 58400, avg_safety_stock: 18200 },
    ai_insights: [
      'Model Hybrid Ensemble unggul dengan akurasi 95.8% pada kategori Electronics di Jakarta & Bali.',
      'Variabel eksogen (AO dan New Outlet/NOO) memiliki korelasi kuat (+0.84) terhadap kenaikan sales di pertengahan tahun.'
    ],
    model_tally: { 'Hybrid Ensemble': 14, 'XGBoost': 8, 'Fb Prophet': 5 }
  };
}

export default function ForecastPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('actual');
  const [showHowTo, setShowHowTo] = useState(false);
  
  const [selectedCabang, setSelectedCabang] = useState<string[]>(["All"]);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(["All"]);
  const [selectedMethod, setSelectedMethod] = useState<string>("");

  const handleGenerateDemo = () => {
    const demo = generateDemoForecast();
    setResults(demo);
    setSelectedMethod('Hybrid Ensemble');
    try {
      localStorage.setItem('lastForecast', JSON.stringify(demo));
    } catch(e){}
    toast.success('🎉 Data Demo ML Forecasting Berhasil Dimuat!');
  };

  // ── Restore previous results from Supabase ──
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'forecast')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (data && data.length > 0) {
          const row = data[0];
          const parsed = JSON.parse(row.result_json);
          parsed.processed_at = row.created_at;
          setResults(parsed);
          if (parsed.best_model && parsed.available_methods) {
            setSelectedMethod(parsed.available_methods[0] || parsed.best_model);
          }
        } else {
          const demo = generateDemoForecast();
          setResults(demo);
          setSelectedMethod(demo.available_methods[0]);
        }
      } catch (err) {
        const demo = generateDemoForecast();
        setResults(demo);
        setSelectedMethod(demo.available_methods[0]);
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('forecast_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.forecast' },
        (payload) => {
          try {
            const newData = JSON.parse(payload.new.result_json);
            newData.processed_at = payload.new.created_at;
            
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_forecast');
            if (lastProcessedAt === newData.processed_at) return;

            setResults(newData);
            if (newData.best_model && newData.available_methods) {
              setSelectedMethod(newData.available_methods[0] || newData.best_model);
            }
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

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Mempersiapkan data (Optimasi Payload)...', { id: 'forecast-upload' });

    try {
      let payloadFile = file;
      
      // Mengubah file Excel menjadi CSV di frontend agar terhindar dari limit 4.5MB Vercel (413 Payload Too Large)
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csvStr = XLSX.utils.sheet_to_csv(ws);
        payloadFile = new File([csvStr], file.name.replace(/\.xlsx?$/i, '.csv'), { type: 'text/csv' });
      }

      toast.loading('Training ML Models (SMA, SES, SARIMAX, XGBoost) per Cabang & Kategori...', { id: 'forecast-upload' });

      const data = await uploadForecastFile(payloadFile);
      if (data.error) {
        toast.error(data.error, { id: 'forecast-upload' });
      } else {
        data.processed_at = data.processed_at || new Date().toISOString();
        setResults(data);
        setSelectedMethod(data.best_model);
        sessionStorage.setItem('last_processed_at_forecast', data.processed_at);
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

    const getBestModelValue = (r: any): number | null => {
      const bestModel = String(r.best_model || results.best_model || '').trim().toLowerCase();
      if (!bestModel || !r.forecasts) return null;
      for (const [key, val] of Object.entries(r.forecasts)) {
        if (key.trim().toLowerCase() === bestModel && val !== undefined && val !== null) {
          const num = Number(val);
          return isNaN(num) ? null : num;
        }
      }
      for (const m of methods) {
        if (m.trim().toLowerCase() === bestModel && r.forecasts[m] !== undefined && r.forecasts[m] !== null) {
          const num = Number(r.forecasts[m]);
          return isNaN(num) ? null : num;
        }
      }
      if (r[bestModel] !== undefined && r[bestModel] !== null) {
        const num = Number(r[bestModel]);
        return isNaN(num) ? null : num;
      }
      return null;
    };

    // Sheet 1: Hasil Olahan Forecast (Demand Forecast)
    const sheet1Data = (results.forecast_data || []).map((r: any) => {
      const rowObj: any = {
        'Cabang': r.cabang || '',
        'Category': r.category || '',
        'Date': r.date || '',
        'Actual': r.actual ?? null,
      };
      methods.forEach((m: string) => {
        rowObj[m] = r.forecasts?.[m] !== undefined && r.forecasts?.[m] !== null ? Number(r.forecasts[m]) : null;
      });
      rowObj['Is Anomaly'] = Boolean(r.is_anomaly);
      rowObj['Is Future'] = Boolean(r.is_future);
      rowObj['Best Model'] = r.best_model || results.best_model || '';
      rowObj['Forecast_Original'] = getBestModelValue(r);
      rowObj['MAPE'] = r.mape !== undefined && r.mape !== null ? Number(Number(r.mape).toFixed(2)) : null;
      rowObj['Bias'] = r.bias !== undefined && r.bias !== null ? Number(Number(r.bias).toFixed(2)) : null;
      rowObj['MAD'] = r.mad !== undefined && r.mad !== null ? Number(Number(r.mad).toFixed(2)) : null;
      rowObj['RMSE'] = r.rmse !== undefined && r.rmse !== null ? Number(Number(r.rmse).toFixed(2)) : null;
      rowObj['ROP'] = r.rop !== undefined && r.rop !== null ? Number(Number(r.rop).toFixed(2)) : null;
      rowObj['Safety Stock'] = r.safety_stock !== undefined && r.safety_stock !== null ? Number(Number(r.safety_stock).toFixed(2)) : null;
      return rowObj;
    });

    // Sheet 2: Weekly Breakdown dengan Tanggal & ISO Weeknum
    const getNthMonday = (year: number, month: number, n: number): Date => {
      const mondays: Date[] = [];
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(year, month - 1, d);
        if (dt.getDay() === 1) {
          mondays.push(dt);
        }
      }
      if (mondays.length === 0) return new Date(year, month - 1, 1);
      if (n <= mondays.length) {
        return mondays[n - 1];
      } else {
        return mondays[mondays.length - 1];
      }
    };

    const getISOWeeknum = (date: Date): number => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    const formatDDMMYYYY = (dt: Date): string => {
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const weights = [
      { label: 'Week 1', ratio: 0.15, nth: 1 },
      { label: 'Week 2', ratio: 0.25, nth: 2 },
      { label: 'Week 3', ratio: 0.30, nth: 3 },
      { label: 'Week 4', ratio: 0.30, nth: 4 }
    ];

    const weeklyRows: any[] = [];
    const validFuture = (results.forecast_data || []).filter((r: any) => 
      r.is_future === true || String(r.is_future).toLowerCase() === 'true' || Boolean(r.is_future) || (r.actual === null || r.actual === undefined)
    );

    validFuture.forEach((row: any) => {
      const baseVal = getBestModelValue(row);
      const dateStr = String(row.date || '').trim();
      const parts = dateStr.split('-');
      if (parts.length < 2) return;
      const tahun = parseInt(parts[0], 10);
      const bulan = parseInt(parts[1], 10);
      if (isNaN(tahun) || isNaN(bulan) || bulan < 1 || bulan > 12) return;

      weights.forEach(({ label, ratio, nth }) => {
        const tanggalMingguan = getNthMonday(tahun, bulan, nth);
        const isoWeeknum = getISOWeeknum(tanggalMingguan);
        const forecastWeek = baseVal !== null && baseVal !== undefined ? Number((baseVal * ratio).toFixed(2)) : null;

        weeklyRows.push({
          'Cabang': row.cabang || '',
          'Category': row.category || '',
          'Periode Asli': row.date || '',
          'Best Model': row.best_model || results.best_model || '',
          'Nilai Forecast Original': baseVal,
          'Week': label,
          'Tanggal Mingguan': formatDDMMYYYY(tanggalMingguan),
          'ISO Weeknum': isoWeeknum,
          'Rasio': `${Math.round(ratio * 100)}%`,
          'Nilai Forecast Week': forecastWeek
        });
      });
    });

    // Sheet 3: DSP Insights & KPI Summary
    const summaryRows: any[] = [];
    summaryRows.push({ Bagian: '--- DSP KPI SUMMARY ---', Parameter: 'Best Model (Global)', Nilai: results.best_model || 'N/A' });
    summaryRows.push({ Bagian: '--- DSP KPI SUMMARY ---', Parameter: 'Avg Safety Stock', Nilai: results.inventory_kpis?.avg_safety_stock || 0 });
    summaryRows.push({ Bagian: '--- DSP KPI SUMMARY ---', Parameter: 'Avg Reorder Point', Nilai: results.inventory_kpis?.avg_reorder_point || 0 });

    if (results.ai_insights && results.ai_insights.length > 0) {
      results.ai_insights.forEach((ins: string, idx: number) => {
        summaryRows.push({ Bagian: '--- DSP INSIGHTS ---', Parameter: `Insight #${idx + 1}`, Nilai: ins });
      });
    }

    const tally = results.model_tally || {};
    if (Object.keys(tally).length > 0) {
      Object.entries(tally).forEach(([model, count]) => {
        summaryRows.push({ Bagian: '--- MODEL DISTRIBUTION ---', Parameter: model, Nilai: count });
      });
    }

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    const ws2 = XLSX.utils.json_to_sheet(weeklyRows);
    const ws3 = XLSX.utils.json_to_sheet(summaryRows);

    ws1['!cols'] = [{ wch: 15 }, { wch: 24 }, { wch: 12 }, { wch: 12 }];
    ws2['!cols'] = [{ wch: 15 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];
    ws3['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 80 }];

    XLSX.utils.book_append_sheet(wb, ws1, "Hasil Forecast");
    XLSX.utils.book_append_sheet(wb, ws2, "Breakdown Mingguan (ISO)");
    XLSX.utils.book_append_sheet(wb, ws3, "DSP Insights & KPI");

    const filename = getStandardFilename("Demand_Forecast_MultiSheet", results?.processed_at || new Date().toISOString(), "xlsx");
    XLSX.writeFile(wb, filename);
    toast.success('📊 File Excel 3-Sheet (Hasil Forecast + Weekly Breakdown) Berhasil Diekspor!');
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
    if (!results?.forecast_data) return [];
    const mod = SCENARIOS.find(s => s.id === activeScenario)?.modifier || 1.0;
    return results.forecast_data.filter((d: any) => 
      (selectedCabang.includes("All") || selectedCabang.includes(d.cabang)) &&
      (selectedCategory.includes("All") || selectedCategory.includes(d.category))
    ).map((d: any) => {
      const scaledForecasts: any = {};
      if (d.forecasts) {
        Object.keys(d.forecasts).forEach(k => {
          scaledForecasts[k] = Math.round(Number(d.forecasts[k] || 0) * mod);
        });
      }
      return {
        ...d,
        actual: d.actual ? Math.round(d.actual * mod) : null,
        forecasts: scaledForecasts,
        rop: Math.round(Number(d.rop || 0) * mod),
        safety_stock: Math.round(Number(d.safety_stock || 0) * mod)
      };
    });
  }, [results, selectedCabang, selectedCategory, activeScenario]);

  return (
    <div className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-6 sm:p-8 border border-purple-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#a855f7_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
              <BrainCircuit className="w-3.5 h-3.5" /> Kalkulator DSP • ML & AI Forecasting
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Advanced Causal <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-300 to-indigo-300">Sales Forecasting</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Peramalan permintaan hierarkis memadukan tren historis dengan variabel eksogen (AO, RO, Drop Size, NOO) menggunakan 15 algoritma Machine Learning modern.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="w-full sm:w-auto px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & DEMO DATA SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-purple-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" /> Panduan Upload & Skema Exogenous Variables
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Zap className="w-4 h-4" /> Gunakan Data Demo
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">📌 Skema Kolom Diperlukan:</h4>
              <ul className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {['Bulan','Deskripsi','Cabang','Kategori','Penjualan','AO (Active Outlet)','RO (Repeat Outlet)','Rerata Drop Size','NOO (New Outlet)'].map(col => (
                  <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span>{col}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900">⚙️ Auto-ML Pipeline & Covariates Optimization:</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sistem mengevaluasi model stabil (SMA, SES) hingga model Machine Learning & Deep Learning (XGBoost, ARIMAX, Prophet, BiLSTM-Hybrid). Variabel eksogen (AO, RO, NOO) digunakan sebagai *causal booster* untuk akurasi optimal.
              </p>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-purple-400" />
                <span>Ditenagai ArrayBuffer parser, file Excel (XLSX) diproses aman tanpa eror pembacaan binari.</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi & Uji Sensitivitas Permintaan:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk memproyeksikan lonjakan promosi atau kontraksi pasar!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-slate-900 border-transparent ring-2 ring-white/20 shadow-purple-500/25 scale-[1.02]`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-purple-400'}`} />
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

      {/* ─── UPLOAD BOX WHEN RESULTS PRESENT OR HIDDEN ─── */}
      <GlassCard className="p-4 bg-white border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isProcessing}
            templateCsv={
              'Bulan,Deskripsi,Cabang,Kategori,Penjualan,AO,RO,Rerata Drop Size,NOO\n' +
              '2026-01-01,Januari,Bali,Apparel,44806,681,141,956,51\n' +
              '2026-01-01,Januari,Bali,Automotive,32476,296,227,121,8'
            }
            templateName="forecast_template.csv"
            label="Upload Dataset Historis Penjualan (Excel / CSV)"
            description="File Excel atau CSV: Bulan, Deskripsi, Cabang, Kategori, Penjualan, AO, RO, Drop Size, NOO."
          />
        </div>
        <div className="sm:border-l border-slate-200 sm:pl-4 flex flex-col justify-center items-center shrink-0">
          <button
            onClick={handleGenerateDemo}
            className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-slate-900 font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
          >
            <Zap className="w-4 h-4" /> Gunakan Data Demo
          </button>
        </div>
      </GlassCard>

      {results && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              📊 Hasil Analisa Causal Forecasting ML
            </h2>
            <TimestampBadge timestamp={results.processed_at || new Date().toISOString()} />
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            <KPICard title="Majority Best Model" value={results.best_model} icon={<Cpu />} />
            <KPICard title="Reorder Point (ROP)" value={results.inventory_kpis?.avg_reorder_point || 0} icon={<BrainCircuit />} />
            <KPICard title="Avg Safety Stock" value={results.inventory_kpis?.avg_safety_stock || 0} icon={<AlertTriangle />} />
            <KPICard title="Total Datapoints" value={filteredData.length} icon={<Target />} />
          </div>

          <GlassCard allowOverflow={true} className="mb-10 p-6 bg-white border-slate-200 shadow-xl relative z-30">
            <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 gap-6 border-b border-slate-200 pb-6">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">Actual vs Forecast</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 max-w-3xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">🏢 Filter Cabang:</label>
                    <MultiSelect
                      options={cabangs}
                      selected={selectedCabang}
                      onChange={setSelectedCabang}
                      selectAllLabel="Semua Cabang"
                      placeholder="Pilih Cabang..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">📦 Filter Kategori:</label>
                    <MultiSelect
                      options={categories}
                      selected={selectedCategory}
                      onChange={setSelectedCategory}
                      selectAllLabel="Semua Kategori"
                      placeholder="Pilih Kategori..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">⚙️ Metode Prediksi:</label>
                    <select 
                      value={selectedMethod} 
                      onChange={e => setSelectedMethod(e.target.value)} 
                      className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-sky-700 font-bold focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 transition shadow-md"
                    >
                      {results.available_methods.map((m:string) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 shrink-0 mt-4 lg:mt-0">
                <button onClick={handleExport}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-900 border border-emerald-500 rounded-xl hover:from-emerald-500 hover:to-teal-500 transition text-sm flex items-center gap-2 font-extrabold shadow-lg shadow-emerald-500/20">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" /> Export Excel (3 Sheet)
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
