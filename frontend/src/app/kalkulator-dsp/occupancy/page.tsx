"use client";
import LZString from 'lz-string';

import React, { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { Activity, AlertTriangle, Info, TrendingUp, TrendingDown, AlertOctagon, Layers, Download, Sparkles, HelpCircle, FileSpreadsheet, Zap, Cloud } from 'lucide-react';
import { uploadOccupancyFileAsync, downloadOccupancyTemplate, downloadOccupancyExcelFromStorage } from '@/lib/api';
import { AsyncUploadStatus } from '@/components/ui/AsyncUploadStatus';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import toast from 'react-hot-toast';
import { getStandardFilename } from '@/utils/export';
import { exportOccupancyWorkbook, exportCombinedWorkbook, base64ToArrayBuffer } from '@/utils/exportOccupancyWorkbook';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import { ModuleExportConfig } from '@/utils/offlineExport';
import { supabase } from '@/lib/supabase';
import { useColumnFilters, FilterableHeader } from '@/components/ui/ColumnFilterDropdown';

// recharts pulls in ~150KB of d3 submodules; this chart only ever renders
// after a file has been processed, so defer it out of the initial route bundle.
const OccupancyChart = dynamic(
  () => import('@/components/charts/OccupancyChart').then(m => m.OccupancyChart),
  { ssr: false, loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-muted" /> }
);

// Fitur 3: grafik tren MOS (Value) per cabang -- lazy-load sama seperti OccupancyChart.
const MosValueChart = dynamic(
  () => import('@/components/charts/MosValueChart').then(m => m.MosValueChart),
  { ssr: false, loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="h-[230px] w-full animate-pulse rounded-xl bg-orange-100" />
      <div className="h-[230px] w-full animate-pulse rounded-xl bg-orange-100" />
    </div>
  ) }
);

type ScenarioType = 'actual' | 'surge' | 'expansion';

const SCENARIOS = [
  {
    id: 'actual' as ScenarioType,
    title: 'Jalur 1: Kapasitas Aktual Gudang (Current Base)',
    desc: 'Pemantauan rasio pemanfaatan gudang aktual (Occupancy Pct) terhadap batas kapasitas resmi tiap cabang saat ini.',
    color: 'from-indigo-600 to-violet-500',
    icon: Activity,
    modifier: 1.0
  },
  {
    id: 'surge' as ScenarioType,
    title: 'Jalur 2: Simulasi Lonjakan Stok (+25% Inflow)',
    desc: 'Uji stress gudang saat terjadi lonjakan kedatangan kontainer atau penumpukan stok akhir tahun maupun seasonal import.',
    color: 'from-rose-600 to-orange-500',
    icon: AlertTriangle,
    modifier: 1.25
  },
  {
    id: 'expansion' as ScenarioType,
    title: 'Jalur 3: Simulasi Ekspansi Gudang (+30% Kapasitas)',
    desc: 'Evaluasi kelonggaran ruang simpan dan penurunan persentase over-occupancy paska penambahan pallet space di cabang.',
    color: 'from-emerald-600 to-teal-500',
    icon: Layers,
    modifier: 0.77
  }
];

// Realisasi Sales -xx%: Target (demand) turun xx% di semua kategori tiap minggu
// (xx dapat diatur manual lewat input, bukan lagi angka tetap 25%). Balance
// mingguan = Onhand + TO + Vessel - Target, jadi Target lebih kecil membuat
// sisa stok (dan occupancy) membesar. Faktor 1 / (1 - xx/100) merepresentasikan
// kenaikan occupancy akibat stok yang gagal terjual/keluar tetap tertahan di gudang.
const DEFAULT_SALES_REALIZATION_PERCENT = 25;
const MAX_SALES_REALIZATION_PERCENT = 95; // dijaga < 100 supaya faktor tidak menuju infinity
function salesRealizationFactorFor(percent: number): number {
  const clamped = Math.min(MAX_SALES_REALIZATION_PERCENT, Math.max(0, Number.isFinite(percent) ? percent : 0));
  return 1 / (1 - clamped / 100);
}

// Fitur 4: jendela periode tetap untuk modul "Analisa & Grafik MRP" -- harus
// sama persis dengan CUSTOM_ANALYSIS_PERIODS di occupancy_engine.py (backend)
// supaya data demo & data hasil upload nyata memakai label periode yang identik.
const CUSTOM_ANALYSIS_PERIODS = [
  'AUG-3', 'AUG-4',
  'SEP-1', 'SEP-2', 'SEP-3', 'SEP-4', 'SEP-5',
  'OCT-1', 'OCT-2', 'OCT-3', 'OCT-4',
  'NOV-1', 'NOV-2', 'NOV-3', 'NOV-4',
  'DEC-1', 'DEC-2', 'DEC-3', 'DEC-4',
];

function PaginatedTable<T>({
  data,
  pageSize = 50,
  renderTable,
}: {
  data: T[];
  pageSize?: number;
  renderTable: (currentData: T[], page: number, totalPages: number) => React.ReactNode;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [data.length, totalPages, page]);

  const currentData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  return (
    <div className="w-full">
      {renderTable(currentData, page, totalPages)}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t border-border mt-2 rounded-b-lg text-foreground">
          <div className="text-xs text-muted-foreground font-medium">
            Menampilkan {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, data.length)} dari {data.length.toLocaleString()} data
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs font-semibold rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sebelumnya
            </button>
            <span className="text-xs font-bold px-2.5 py-1 bg-muted rounded">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs font-semibold rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generateDemoOccupancy() {
  // Fitur 4: demo memakai jendela periode tetap AUG-3 s/d DEC-4 (19 minggu)
  // supaya modul "Analisa & Grafik MRP" bisa didemonstrasikan tanpa perlu
  // upload file nyata yang kebetulan jatuh pada rentang tersebut.
  const dates = CUSTOM_ANALYSIS_PERIODS;
  const branches = [
    { name: 'DC Jakarta', capacity: 30000 },
    { name: 'DC Surabaya', capacity: 17000 },
    { name: 'DC Medan', capacity: 9000 },
    { name: 'DC Makassar', capacity: 13500 },
  ];
  const baseByBranch: Record<string, number> = { 'DC Jakarta': 50, 'DC Surabaya': 47, 'DC Medan': 43, 'DC Makassar': 44 };

  // DC Jakarta diberi laju drift lebih tajam supaya melewati ambang 80% menjelang
  // akhir jendela periode -- mendemonstrasikan conditional formatting "occupancy
  // > 80% -> merah" (Task 1b) lewat mode Data Demo tanpa perlu upload file nyata.
  const driftRateByBranch: Record<string, number> = { 'DC Jakarta': 1.8, 'DC Surabaya': 0.15, 'DC Medan': 0.15, 'DC Makassar': 0.15 };

  const targetSeries: Record<string, number[]> = {};
  branches.forEach((b, bi) => {
    targetSeries[b.name] = dates.map((_, i) => {
      const wave = Math.sin((i + bi * 2) / 3) * 5;
      const drift = i * (driftRateByBranch[b.name] ?? 0.15);
      return Math.round((baseByBranch[b.name] + wave + drift) * 100) / 100;
    });
  });

  const daily_data: any[] = [];
  branches.forEach(b => {
    const series = targetSeries[b.name];
    dates.forEach((dt, idx) => {
      const pct = series[idx];
      const currentHand = Math.round((pct / 100) * b.capacity);
      daily_data.push({
        date: dt,
        cabang: b.name,
        total_on_hand: currentHand,
        capacity: b.capacity,
        occupancy_pct: pct,
        is_shortage: currentHand < 0
      });
    });
  });

  const mos_data = branches.map((b, bi) => ({
    Cabang: b.name, Grup: 'General', Week: dates[0],
    Balance: 1000 + bi * 190, Target: 1000 + bi * 190, Harga: 15000 + bi * 3000,
    Value_per_Week: (1000 + bi * 190) * (15000 + bi * 3000), MOS: 1.5 + bi * 0.3,
  }));

  const shortage_alerts = [
    { cabang: 'DC Jakarta', category: 'General - Electronics', date: dates[6], deficit: 150 },
  ];

  // Analisa Nilai Inventori (QTY -> Value -> MOS Value) -- disintesis per cabang
  // per minggu supaya conditional formatting (Task 1b/1c: >80% & <0 -> merah)
  // dan grafik MOS (Value) baru bisa langsung terlihat lewat mode Data Demo,
  // tanpa perlu upload file nyata.
  const unitPriceByBranch: Record<string, number> = { 'DC Jakarta': 15000, 'DC Surabaya': 25000, 'DC Medan': 120000, 'DC Makassar': 850000 };
  const qty_series_by_branch: Record<string, number[]> = {};
  const value_series_by_branch: Record<string, number[]> = {};
  const mos_value_series_by_branch: Record<string, number[]> = {};
  branches.forEach((b, bi) => {
    const unitPrice = unitPriceByBranch[b.name] || 15000;
    const qty = dates.map((_, i) => {
      const wave = Math.sin((i + bi * 3) / 4) * 400;
      const base = 1200 + bi * 300;
      // Dip sengaja dibuat minus di satu titik (DC Medan, minggu ke-6) untuk
      // mendemonstrasikan conditional formatting "nilai minus -> merah".
      const dip = (bi === 2 && i === 5) ? 1800 : 0;
      return Math.round(base + wave - dip);
    });
    qty_series_by_branch[b.name] = qty;
    value_series_by_branch[b.name] = qty.map((q) => Math.round(q * unitPrice));
    const monthlyDemandValue = (1500 + bi * 300) * unitPrice; // proxy SUM(AA) * 4 skala bulanan
    mos_value_series_by_branch[b.name] = qty.map((q) => Math.round(((q * unitPrice) / (monthlyDemandValue * 4)) * 100) / 100);
  });

  const avgOccupancy = daily_data.reduce((acc, d) => acc + d.occupancy_pct, 0) / daily_data.length;
  const maxOccupancy = Math.max(...daily_data.map(d => d.occupancy_pct));

  return {
    processed_at: new Date().toISOString(),
    daily_data,
    kpi_summary: {
      avg_occupancy: Math.round(avgOccupancy * 10) / 10,
      max_occupancy: Math.round(maxOccupancy * 10) / 10,
      categories_at_risk: shortage_alerts.length,
    },
    shortage_alerts,
    mos_data,

    over_occupancy_insights: [
      `PERBANDINGAN SKENARIO - DC Jakarta: pada periode ${dates[0]}, utilisasi gudang stabil di kisaran ${targetSeries['DC Jakarta'][0].toFixed(1)}% dari total kapasitas 30,000 unit.`,
      'STATUS GUDANG - Seluruh 4 Distribution Center (DC Jakarta, Surabaya, Medan, Makassar) beroperasi pada level occupancy relatif stabil sepanjang jendela analisa AUG-3 s/d DEC-4.'
    ],
    mrp_results: {
      week_awal: 1,
      period_labels: dates,
      insights_list: [
        `PERBANDINGAN SKENARIO - DC Jakarta: pada periode ${dates[0]}, utilisasi gudang stabil di kisaran ${targetSeries['DC Jakarta'][0].toFixed(1)}% dari total kapasitas 30,000 unit.`,
        `TREN - DC Surabaya (Proyeksi): utilisasi bergerak dari ${targetSeries['DC Surabaya'][0].toFixed(1)}% (${dates[0]}) menjadi ${targetSeries['DC Surabaya'][dates.length - 1].toFixed(1)}% (${dates[dates.length - 1]}).`,
        'STATUS GUDANG - Seluruh 4 Distribution Center beroperasi pada level occupancy ideal sepanjang jendela analisa AUG-3 s/d DEC-4.'
      ],
      occupancy_series_target: targetSeries,
      qty_series_by_branch,
      value_series_by_branch,
      mos_value_series_by_branch,
    }
  };
}

// `processed_results.result_json` bisa muncul dalam DUA format berbeda tergantung
// jalur mana yang menulisnya: alur upload (sync/async, lihat routers/occupancy.py)
// menulis JSON polos, sedangkan tombol "Simpan ke Global" (handleSaveToGlobal di
// bawah) membungkusnya sebagai `{compressed: true, data: <base64 LZString>}` untuk
// menghemat ukuran baris. Sebelumnya fetchInitialData() dan handler realtime
// SELALU memakai JSON.parse polos tanpa mengecek pembungkus ini -- kalau baris
// TERBARU di tabel kebetulan hasil "Simpan ke Global", dashboard akan menerima
// objek `{compressed:true,...}` mentah (tanpa daily_data/mrp_results sama sekali)
// dan terlihat kosong/rusak, bukan menampilkan data upload yang sebenarnya.
function decodeStoredResult(rawJson: string): any {
  const parsed = JSON.parse(rawJson);
  if (parsed && typeof parsed === 'object' && parsed.compressed && typeof parsed.data === 'string') {
    const decompressed = LZString.decompressFromBase64(parsed.data);
    if (!decompressed) throw new Error('Gagal decompress data tersimpan (LZString).');
    return JSON.parse(decompressed);
  }
  return parsed;
}

export default function OccupancyPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults]           = useState<any>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('actual');
  const [salesRealizationActive, setSalesRealizationActive] = useState(false);
  const [salesRealizationPercent, setSalesRealizationPercent] = useState<number>(DEFAULT_SALES_REALIZATION_PERCENT);
  const [showHowTo, setShowHowTo] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      toast.loading('Mengunduh Template Excel MRP (Raw & WH)...', { id: 'tpl' });
      const blob = await downloadOccupancyTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Template_Occupancy_MRP_Raw_WH.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Template MRP Berhasil Diunduh!', { id: 'tpl' });
    } catch (e: any) {
      toast.error('Gagal mengunduh template: ' + (e?.message || 'Server offline'), { id: 'tpl' });
    }
  };

  const handleSaveToGlobal = async () => {
    if (!results) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...results, processed_at: timestamp };
    sessionStorage.setItem('last_processed_at_occupancy', timestamp);
    const { error } = await supabase.from('processed_results').insert([{ module: 'occupancy', result_json: JSON.stringify({ compressed: true, data: LZString.compressToBase64(JSON.stringify(dataCopy)) }) }]);
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = generateDemoOccupancy();
    setResults(demo);
    try {
      localStorage.setItem('lastOccupancy', JSON.stringify(demo));
    } catch(e){}
    toast.success('🎉 Data Demo Occupancy Berhasil Dimuat!');
  };

  // ── Restore previous results from Supabase ──
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { data, error } = await supabase
          .from('processed_results')
          .select('*')
          .eq('module', 'occupancy')
          .order('created_at', { ascending: false })
          .limit(1);

        // Sebelumnya `error` di sini tidak pernah dicek -- kalau query gagal
        // (mis. RLS, jaringan), `data` jatuh ke falsy dan langsung diam-diam
        // fallback ke data demo tanpa jejak apa pun, membuat kegagalan nyata
        // (bukan "memang belum ada data") terlihat identik dengan kondisi normal.
        if (error) {
          console.error('[Occupancy] Gagal memuat hasil tersimpan dari Supabase:', error);
        }

        if (data && data.length > 0) {
          const row = data[0];
          const parsed = decodeStoredResult(row.result_json);
          parsed.processed_at = row.created_at;
          setResults(parsed);
          try {
            localStorage.setItem('lastOccupancy', JSON.stringify(parsed));
          } catch (e) {
            console.warn('Data terlalu besar untuk disimpan di memori browser');
          }
        } else {
          if (error) {
            toast.error('Gagal memuat hasil olahan terakhir, menampilkan data demo sementara. Cek console untuk detail.');
          }
          setResults(generateDemoOccupancy());
        }
      } catch (err) {
        console.error('[Occupancy] Exception saat memuat hasil tersimpan:', err);
        setResults(generateDemoOccupancy());
      }
    };
    
    fetchInitialData();
    
    const channel = supabase
      .channel('occupancy_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: 'module=eq.occupancy' },
        (payload) => {
          try {
            const newData = decodeStoredResult(payload.new.result_json);
            newData.processed_at = payload.new.created_at;

            try {
              localStorage.setItem('lastOccupancy', JSON.stringify(newData));
            } catch (e) {
              console.warn('Data terlalu besar untuk disimpan di memori browser');
            }

            // Dua mekanisme dedup "ini upload saya sendiri" -- keduanya HANYA
            // menentukan apakah toast "pembaruan dari pengguna lain" muncul,
            // BUKAN apakah setResults dipanggil: pada alur async, event realtime
            // ini adalah satu-satunya jalur yang benar-benar membawa hasil olahan
            // ke state halaman (handleFileUpload tidak lagi menerima data secara
            // sinkron), jadi setResults wajib tetap jalan untuk job_id milik sendiri.
            // - by processed_at: alur lama (sinkron) & handleSaveToGlobal -- data
            //   di path itu SUDAH di-set langsung sebelum event ini tiba, sehingga
            //   aman untuk di-skip sepenuhnya (redundan).
            // - by job_id: alur upload async (BackgroundTasks) -- data BELUM
            //   pernah di-set di manapun sebelum event ini, jadi hanya toast
            //   "user lain"-nya yang di-skip (toast sukses sendiri sudah
            //   ditampilkan lewat AsyncUploadStatus.onCompleted).
            const lastProcessedAt = sessionStorage.getItem('last_processed_at_occupancy');
            const lastJobId = sessionStorage.getItem('last_dsp_job_id_occupancy');
            const isOwnSyncUpload = lastProcessedAt === newData.processed_at;
            const isOwnAsyncUpload = !!(payload.new.job_id && lastJobId && payload.new.job_id === lastJobId);

            if (isOwnSyncUpload) return;

            setResults(newData);

            if (!isOwnAsyncUpload) {
              toast.success('Pembaruan data dari pengguna lain diterima!', {
                icon: '🔄',
                duration: 5000,
                style: { background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))', fontWeight: 'bold' }
              });
            }
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

  const [selectedCabang,   setSelectedCabang]   = useState<string[]>(['All']);
  const [selectedDate,     setSelectedDate]     = useState<string[]>(['All']);
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);

  // ── Upload handler (async: Supabase Storage -> FastAPI BackgroundTasks) ──
  // File tidak lagi dikirim langsung ke FastAPI (yang kena limit payload 4.5MB
  // Vercel), melainkan ke Supabase Storage. Hasil olahannya tetap diterima lewat
  // realtime subscription `processed_results` yang sudah ada (lihat useEffect di
  // bawah) -- AsyncUploadStatus di bawah hanya untuk feedback progress ke user.
  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setAsyncJobId(null);
    toast.loading('Mengunggah file ke Storage...', { id: 'occ' });
    try {
      const { jobId } = await uploadOccupancyFileAsync(file);
      setAsyncJobId(jobId);
      toast.success('File terunggah! Sedang diproses di background...', { id: 'occ' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to upload. Check file.';
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg), { id: 'occ' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── CSV export step-by-step complete data ──
  const handleExport = () => {
    if (!results) return;
    const lines = [];

    // Gunakan data aktif (terfilter) agar hasil export sesuai dengan layar
    const exportDailyData = filteredData && filteredData.length > 0 ? filteredData : (results.daily_data || []);
    const exportKpi = kpiMetrics || results.kpi_summary || {};
    const exportShortage = filteredShortageAlerts && filteredShortageAlerts.length > 0 ? filteredShortageAlerts : (results.shortage_alerts || []);
    const exportMos = results.mos_data || [];
    
    // Fallback over occupancy insights from state or raw results
    const rawInsights = results.over_occupancy_insights || [];
    const derivedInsights = (insights.over || []).map((o: any) => `TREN - ${o.cabang} pada ${o.date}: Over Kapasitas (${o.occupancy_pct}%)`);
    const exportWarnings = derivedInsights.length > 0 ? derivedInsights : rawInsights;

    // STEP 1: RAW/DAILY DATA (Kapasitas & Occupancy)
    if (exportDailyData.length) {
      lines.push('--- STEP 1: HASIL HITUNG OCCUPANCY (KAPASITAS) ---');
      lines.push('Date,Cabang,Total On Hand,Capacity,Occupancy Pct (%)');
      exportDailyData.forEach((r: any) =>
        lines.push([r.date, r.cabang, r.total_on_hand, r.capacity, r.occupancy_pct].join(','))
      );
    }
    
    // STEP 2: SUMMARY & KPI
    lines.push('');
    lines.push('--- STEP 2: KPI & SUMMARY ---');
    lines.push(`Avg Occupancy (%),${(exportKpi as any).avg || (exportKpi as any).avg_occupancy || 0}`);
    lines.push(`Max Occupancy (%),${(exportKpi as any).peak || (exportKpi as any).max_occupancy || 0}`);
    lines.push(`Categories at Risk,${(exportKpi as any).riskCount || (exportKpi as any).categories_at_risk || 0}`);

    // STEP 3: MOS & HARGA
    if (exportMos.length > 0) {
      lines.push('');
      lines.push('--- STEP 3: PERHITUNGAN MOS & HARGA CONTAINER ---');
      lines.push('Cabang,Grup,Week,Balance,Target,Harga,Value per Week,MOS');
      exportMos.forEach((m: any) => {
        lines.push(`${m.Cabang},${m.Grup},${m.Week},${m.Balance},${m.Target},${m.Harga},${m.Value_per_Week},${m.MOS}`);
      });
    }

    // STEP 4: SHORTAGE & DEFICIT
    if (exportShortage.length > 0) {
      lines.push('');
      lines.push('--- STEP 4: SHORTAGE ALERTS (DEFICIT) ---');
      lines.push('Cabang,Category,Date,Deficit');
      exportShortage.forEach((a: any) => lines.push(`${a.cabang},${a.category},${a.date},${a.deficit}`));
    }

    // STEP 5: WARNINGS
    if (exportWarnings.length > 0) {
      lines.push('');
      lines.push('--- STEP 5: WARNING OVER OCCUPANCY (>90%) ---');
      exportWarnings.forEach((ins: string) => {
        lines.push(`"${ins}"`);
      });
    }

    const blob = new Blob(['sep=,\r\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = getStandardFilename("Hasil_Pengolahan_Lengkap_Occupancy", results?.processed_at || new Date().toISOString(), "csv");
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Data Hasil Pengolahan Lengkap berhasil diekspor!');
  };

  // ── Dropdown options ──
  const cabangs = useMemo(() => {
    if (!results?.daily_data) return [];
    return ['All', ...Array.from(new Set<string>(results.daily_data.map((d: any) => d.cabang)))];
  }, [results]);

  const dates = useMemo(() => {
    if (!results?.daily_data) return [];
    return ['All', ...Array.from(new Set<string>(results.daily_data.map((d: any) => d.date))).sort()];
  }, [results]);



  const salesRealizationFactor = useMemo(
    () => (salesRealizationActive ? salesRealizationFactorFor(salesRealizationPercent) : 1),
    [salesRealizationActive, salesRealizationPercent]
  );

  const filteredData = useMemo(() => {
    if (!results?.daily_data) return [];
    const mod = (SCENARIOS.find(s => s.id === activeScenario)?.modifier || 1.0) * salesRealizationFactor;
    return results.daily_data.filter((d: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(d.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(d.date))
    ).map((d: any) => ({
      ...d,
      occupancy_pct: Math.round(Number(d.occupancy_pct || 0) * mod * 10) / 10,
      total_on_hand: Math.round((activeScenario === 'surge' ? d.total_on_hand * 1.25 : d.total_on_hand) * salesRealizationFactor),
      capacity: activeScenario === 'expansion' ? Math.round(d.capacity * 1.3) : d.capacity,
    }));
  }, [results, selectedCabang, selectedDate, activeScenario, salesRealizationFactor]);

  const insights = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return { over: [], lower: [] };
    const over = filteredData.filter((d: any) => d.occupancy_pct > 100);
    const lower = filteredData.filter((d: any) => d.occupancy_pct < 50);
    return { over, lower };
  }, [filteredData]);



  const filteredShortageAlerts = useMemo(() => {
    if (!results?.shortage_alerts) return [];
    return results.shortage_alerts.filter((a: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(a.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(a.date))
    );
  }, [results, selectedCabang, selectedDate]);

  // Overstock Alerts: cermin persis filteredShortageAlerts di atas (arsitektur
  // state & reaktivitas terhadap filter global yang sama).
  const filteredOverstockAlerts = useMemo(() => {
    if (!results?.overstock_alerts) return [];
    return results.overstock_alerts.filter((a: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(a.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(a.date))
    );
  }, [results, selectedCabang, selectedDate]);

  // Sheet 1 "Analisa Nilai Inventori" (Download Excel Ringkasan): row per
  // Cabang+Grup+Category+Week, mengikuti filter Cabang & Tanggal aktif di
  // layar sama seperti filteredShortageAlerts/filteredOverstockAlerts.
  const filteredInventoryValueRows = useMemo(() => {
    if (!results?.inventory_value_rows) return [];
    return results.inventory_value_rows.filter((r: any) =>
      (selectedCabang.includes('All') || selectedCabang.includes(r.cabang)) &&
      (selectedDate.includes('All') || selectedDate.includes(r.week))
    );
  }, [results, selectedCabang, selectedDate]);

  const kpiMetrics = useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return {
        avg: 0,
        peak: 0,
        top3Peak: [] as Array<{ cabang: string; date: string; val: string }>,
        min: 0,
        bottom3Min: [] as Array<{ cabang: string; date: string; val: string }>,
        riskCount: 0,
        top5RiskCategories: [] as Array<{ category: string; cabang: string; reason: string }>,
        overstockCount: 0,
      };
    }

    // Avg Occupancy from active filtered data
    const totalOccupancy = filteredData.reduce((acc: number, item: any) => acc + Number(item.occupancy_pct || 0), 0);
    const avg = Number((totalOccupancy / filteredData.length).toFixed(1));

    // Sorted by occupancy_pct descending (Peak Occupancy)
    const sortedDesc = [...filteredData].sort((a: any, b: any) => Number(b.occupancy_pct || 0) - Number(a.occupancy_pct || 0));
    const peak = sortedDesc[0] ? Number(sortedDesc[0].occupancy_pct || 0).toFixed(1) : 0;
    const top3Peak = sortedDesc.slice(0, 3).map((item: any) => ({
      cabang: item.cabang,
      date: item.date,
      val: Number(item.occupancy_pct || 0).toFixed(1)
    }));

    // Sorted by occupancy_pct ascending (Min Occupancy)
    const sortedAsc = [...filteredData].sort((a: any, b: any) => Number(a.occupancy_pct || 0) - Number(b.occupancy_pct || 0));
    const min = sortedAsc[0] ? Number(sortedAsc[0].occupancy_pct || 0).toFixed(1) : 0;
    const bottom3Min = sortedAsc.slice(0, 3).map((item: any) => ({
      cabang: item.cabang,
      date: item.date,
      val: Number(item.occupancy_pct || 0).toFixed(1)
    }));

    // Categories at Risk: combines shortage alerts and inventory analysis risks
    const riskMap = new Map<string, { category: string; cabang: string; reason: string; score: number }>();
    
    if (filteredShortageAlerts && filteredShortageAlerts.length > 0) {
      filteredShortageAlerts.forEach((item: any) => {
        const key = `${item.cabang}-${item.category}`;
        riskMap.set(key, {
          category: item.category,
          cabang: item.cabang,
          reason: `Defisit: ${item.deficit}`,
          score: 1000 + Number(item.deficit || 0)
        });
      });
    }



    const riskList = Array.from(riskMap.values()).sort((a, b) => b.score - a.score);
    const top5RiskCategories = riskList.slice(0, 5);
    // Dataset ekstrem-besar bisa membuat backend memangkas `shortage_alerts`
    // sebelum disimpan (lihat shortage_alerts_truncated / MAX_STORED_SHORTAGE_ALERTS
    // di routers/occupancy.py) -- di situasi itu `riskList.length` cuma menghitung
    // subset yang tersimpan, jadi pakai angka asli dari `kpi_summary` (dihitung
    // backend SEBELUM dipangkas) supaya KPI tidak diam-diam under-count.
    const riskCount = results?.shortage_alerts_truncated
      ? (results?.kpi_summary?.categories_at_risk ?? riskList.length)
      : (riskList.length || results?.kpi_summary?.categories_at_risk || 0);

    // Overstock Count: kept as its own KPI (not merged into riskMap) --
    // shortage & overstock are opposite-direction risks, so collapsing them
    // into one "risk score" would hide which direction is actually driving it.
    // Sama seperti riskCount di atas, pakai kpi_summary.overstock_count saat
    // overstock_alerts sudah dipangkas backend supaya tidak under-count.
    const overstockCount = results?.overstock_alerts_truncated
      ? (results?.kpi_summary?.overstock_count ?? filteredOverstockAlerts.length)
      : (filteredOverstockAlerts.length || results?.kpi_summary?.overstock_count || 0);

    return {
      avg,
      peak,
      top3Peak,
      min,
      bottom3Min,
      riskCount,
      top5RiskCategories,
      overstockCount,
    };
  }, [filteredData, filteredShortageAlerts, filteredOverstockAlerts, results]);

  const mrpData = results?.mrp_results || results?.ddmrp_results;

  // Terapkan faktor "Realisasi Sales -xx%" ke tabel Komparasi Occupancy Mingguan
  // (Target dipotong xx% -> stok tertahan lebih banyak -> occupancy membesar),
  // tanpa memutasi `mrpData` asli supaya toggle tetap bisa dimatikan reversibel.
  const displayOccupancySeriesTarget = useMemo(() => {
    const base: Record<string, number[]> = mrpData?.occupancy_series_target || {};
    if (!salesRealizationActive) return base;
    const scaled: Record<string, number[]> = {};
    Object.entries(base).forEach(([cabang, vals]) => {
      scaled[cabang] = vals.map((v) => Math.round(v * salesRealizationFactor * 10) / 10);
    });
    return scaled;
  }, [mrpData, salesRealizationActive, salesRealizationFactor]);

  // ── Column filters: "Analisa & Grafik MRP" (Komparasi Occupancy Mingguan) table ──
  const mrpCabangRows = useMemo(
    () => Object.keys(mrpData?.occupancy_series_target || {})
      .filter((cabang) => selectedCabang.includes('All') || selectedCabang.includes(cabang)),
    [mrpData, selectedCabang]
  );
  const mrpColumnDefs = useMemo(() => {
    const defs: Array<{ key: string; type: 'select' | 'number'; getValue: (cabang: string) => string | number }> = [
      { key: 'cabang', type: 'select', getValue: (cabang: string) => cabang },
    ];
    (mrpData?.period_labels || []).forEach((_label: string, i: number) => {
      defs.push({
        key: `week_${i}`,
        type: 'number',
        getValue: (cabang: string) => Number(displayOccupancySeriesTarget?.[cabang]?.[i] ?? 0),
      });
    });
    return defs;
  }, [mrpData, displayOccupancySeriesTarget]);
  const mrpTableFilters = useColumnFilters(mrpCabangRows, mrpColumnDefs);

  // ── Column filters: "Analisa Nilai Inventori (QTY & Value)" table --
  // konversi Container -> QTY (via CBM) -> Rupiah (via Harga Product), per cabang ──
  const qtyValueCabangRows = useMemo(
    () => Object.keys(mrpData?.qty_series_by_branch || {})
      .filter((cabang) => selectedCabang.includes('All') || selectedCabang.includes(cabang)),
    [mrpData, selectedCabang]
  );
  const qtyValueColumnDefs = useMemo(() => ([
    { key: 'cabang', type: 'select' as const, getValue: (cabang: string) => cabang },
  ]), []);
  const qtyValueTableFilters = useColumnFilters(qtyValueCabangRows, qtyValueColumnDefs);

  // ── Column filters (Excel-like): "Shortage Alerts" table ──
  const shortageColumnDefs = useMemo(() => ([
    { key: 'cabang', type: 'select' as const, getValue: (a: any) => a.cabang },
    { key: 'category', type: 'text' as const, getValue: (a: any) => a.category },
    { key: 'date', type: 'select' as const, getValue: (a: any) => a.date },
    { key: 'deficit', type: 'number' as const, getValue: (a: any) => Number(a.deficit || 0) },
  ]), []);
  const shortageTableFilters = useColumnFilters(filteredShortageAlerts, shortageColumnDefs);

  // ── Column filters (Excel-like): "Overstock Alerts" table (mirrors Shortage above) ──
  const overstockColumnDefs = useMemo(() => ([
    { key: 'cabang', type: 'select' as const, getValue: (a: any) => a.cabang },
    { key: 'category', type: 'text' as const, getValue: (a: any) => a.category },
    { key: 'date', type: 'select' as const, getValue: (a: any) => a.date },
    { key: 'excess', type: 'number' as const, getValue: (a: any) => Number(a.excess || 0) },
  ]), []);
  const overstockTableFilters = useColumnFilters(filteredOverstockAlerts, overstockColumnDefs);

  // ── Offline HTML export config: full raw dataset (not the live-narrowed
  // filteredData) so the exported file's own filters can range over everything,
  // not just whatever cabang/date/scenario was selected at export time. ──
  // Fitur 1: Export HTML kontekstual -- data yang diekspor HARUS berbanding
  // lurus dengan state tampilan yang sedang dirender di layar saat ini
  // (cabang/tanggal/skenario/toggle Realisasi Sales/filter kolom aktif),
  // bukan seluruh dataset mentah `results.*`. Karena itu setiap tabel di bawah
  // bersumber dari state yang SUDAH difilter (filteredData, shortageTableFilters
  // .filteredData, mos_data yang disaring selectedCabang), dan daftar opsi
  // filter offline-nya diturunkan dari data terfilter itu sendiri -- sehingga
  // reopen filter "Semua" di file HTML hasil unduhan tetap hanya menampilkan
  // apa yang sedang aktif di layar (mis. cuma "Cabang Bali"), bukan data cabang
  // lain yang sedang disembunyikan.
  const filteredMosData = useMemo(() => {
    if (!results?.mos_data) return [];
    return results.mos_data.filter((m: any) => selectedCabang.includes('All') || selectedCabang.includes(m.Cabang));
  }, [results, selectedCabang]);

  const contextualCabangOptions = useMemo(
    () => Array.from(new Set<string>(filteredData.map((d: any) => d.cabang))).sort(),
    [filteredData]
  );
  const contextualDateOptions = useMemo(
    () => Array.from(new Set<string>(filteredData.map((d: any) => d.date))).sort(),
    [filteredData]
  );

  const exportConfig: ModuleExportConfig | undefined = results ? {
    moduleName: 'Occupancy_Analisa',
    processedAt: results.processed_at,
    domElementId: 'export-container',
    filters: [
      { field: 'cabang', label: 'Filter Cabang', options: contextualCabangOptions },
      { field: 'date', label: 'Filter Tanggal', options: contextualDateOptions },
    ],
    tables: [
      {
        id: 'daily_data',
        title: 'Occupancy Harian (Mengikuti Filter & Skenario Aktif di Layar)',
        filterFields: ['cabang', 'date'],
        data: filteredData,
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'date', label: 'Tanggal' },
          { key: 'total_on_hand', label: 'Total On Hand', align: 'right', format: 'number' },
          { key: 'capacity', label: 'Capacity', align: 'right', format: 'number' },
          { key: 'occupancy_pct', label: 'Occupancy', align: 'right', format: 'percent', highlight: { above: 100, below: 50 } },
        ],
      },
      {
        id: 'shortage_alerts',
        title: 'Shortage Alerts (Mengikuti Filter & Kolom Aktif di Layar)',
        filterFields: ['cabang', 'date'],
        data: shortageTableFilters.filteredData,
        emptyLabel: 'Tidak ada shortage alert untuk filter yang dipilih.',
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'category', label: 'Category' },
          { key: 'date', label: 'Tanggal' },
          { key: 'deficit', label: 'Deficit', align: 'right', format: 'number' },
        ],
      },
      {
        id: 'overstock_alerts',
        title: 'Overstock Alerts (Mengikuti Filter & Kolom Aktif di Layar)',
        filterFields: ['cabang', 'date'],
        data: overstockTableFilters.filteredData,
        emptyLabel: 'Tidak ada overstock alert untuk filter yang dipilih.',
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'category', label: 'Category' },
          { key: 'date', label: 'Tanggal' },
          { key: 'excess', label: 'Excess', align: 'right', format: 'number' },
        ],
      },
      {
        id: 'mos_data',
        title: 'Sheet Harga Container & Kalkulasi MOS (Mengikuti Filter Cabang di Layar)',
        filterFields: ['cabang'],
        data: filteredMosData.map((m: any) => ({
          cabang: m.Cabang, grup: m.Grup, week: m.Week, balance: m.Balance,
          target: m.Target, harga: m.Harga, value_per_week: m.Value_per_Week, mos: m.MOS,
        })),
        columns: [
          { key: 'cabang', label: 'Cabang' },
          { key: 'grup', label: 'Grup' },
          { key: 'week', label: 'Week', align: 'center' },
          { key: 'balance', label: 'Balance', align: 'right', format: 'number' },
          { key: 'target', label: 'Target', align: 'right', format: 'number' },
          { key: 'harga', label: 'Harga', align: 'right', format: 'currency-idr' },
          { key: 'value_per_week', label: 'Value per Week', align: 'right', format: 'currency-idr' },
          { key: 'mos', label: 'MOS', align: 'right', format: 'number', decimals: 2 },
        ],
      },
    ],
    kpis: [
      { id: 'avg_occupancy', label: 'Avg Occupancy', sourceTableId: 'daily_data', field: 'occupancy_pct', agg: 'avg', suffix: '%' },
      { id: 'peak_occupancy', label: 'Peak Occupancy', sourceTableId: 'daily_data', field: 'occupancy_pct', agg: 'max', suffix: '%' },
      { id: 'min_occupancy', label: 'Min Occupancy', sourceTableId: 'daily_data', field: 'occupancy_pct', agg: 'min', suffix: '%' },
      { id: 'shortage_count', label: 'Shortage Alerts', sourceTableId: 'shortage_alerts', field: 'deficit', agg: 'count', decimals: 0, suffix: '' },
      { id: 'overstock_count', label: 'Overstock Alerts', sourceTableId: 'overstock_alerts', field: 'excess', agg: 'count', decimals: 0, suffix: '' },
    ],
  } : undefined;

  return (
    <div id="export-container" className="space-y-8 max-w-[1550px] mx-auto pb-16 animate-in fade-in duration-500 text-foreground">

      {/* ─── COMMAND TOWER HERO BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-black p-6 sm:p-8 border border-orange-500/30 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 uppercase tracking-widest">
              <Activity className="w-3.5 h-3.5" /> Kalkulator DSP • Warehouse & Inventory Projector
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Occupancy & <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-300 to-white">Inventory Projector</span>
            </h1>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <TimestampBadge timestamp={results?.processed_at} label="Olah Terakhir:" />
            {exportConfig
              ? <ExportHtmlButton config={exportConfig} moduleName="Occupancy_Analisa" processedAt={results?.processed_at} />
              : <ExportHtmlButton elementId="export-container" moduleName="Occupancy_Analisa" processedAt={results?.processed_at} />}
            <button
              onClick={() => setShowHowTo(!showHowTo)}
              className="no-export w-full sm:w-auto px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              {showHowTo ? 'Tutup Panduan' : 'Panduan & Template'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── PANDUAN & DEMO DATA SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-indigo-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Panduan & Skema File Excel Occupancy
            </h3>
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-[#1E1E2C] font-bold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <FileSpreadsheet className="w-4 h-4" /> Download Template Excel MRP
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-foreground">
            <div>
              <h4 className="font-semibold text-foreground mb-2">📌 Skema Kolom Diperlukan (2 Pilihan Format):</h4>
              <div className="space-y-2 mb-3">
                <p className="text-xs font-bold text-indigo-400">Option 1: Format Multi-Sheet MRP (Terbaru)</p>
                <p className="text-xs text-muted-foreground">• Sheet <code>Raw</code>: No, Cabang, Grup, Category, On Hand + blok mingguan [TO, Vessel, Buffer, Target].</p>
                <p className="text-xs text-muted-foreground">• Sheet <code>WH</code>: No, Cabang, Kapasitas Existing, Tambahan, dan sel <code>Week Awal</code> (cth: 1 untuk JAN-1).</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-teal-400">Option 2: Format Tabel Tunggal (Legacy CSV/XLSX)</p>
                <ul className="grid grid-cols-2 gap-2 text-xs text-foreground">
                  {['Cabang','Category','On Hand (stok awal)','In (masuk)','Out (keluar / penjualan)','Capacity (kapasitas cabang)','Date'].map(col => (
                    <li key={col} className="flex items-center gap-2 font-mono bg-white/5 p-2 rounded border border-border">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span>{col}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">⚙️ Proxy Penjualan & Klasifikasi ABC-XYZ:</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Kolom <code>Out</code> atau demand <code>Target</code> diproses sebagai proxy <b>Penjualan</b> untuk memetakan inventory ke kelas ABC (Volume) dan XYZ (Variabilitas/Coefficient of Variation), sehingga Anda mengetahui risiko Stockout dan Dead Stock secara otomatis.
              </p>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-indigo-400" />
                <span>Mendukung penggabungan sheet Hasil Target & Occupancy secara dinamis!</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="no-export space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi & Uji Ketahanan Gudang:
          </h2>
          <span className="text-xs text-muted-foreground italic hidden sm:inline">Klik tab untuk memproyeksikan lonjakan inflow atau ekspansi gudang!</span>
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
                    : 'bg-white hover:bg-muted text-foreground border-border hover:border-primary'
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
                <p className={`text-xs sm:text-sm leading-relaxed ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {sc.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Toggle simulasi tambahan: Realisasi Sales -xx% -- memotong Target xx%
            (xx diatur manual lewat input di bawah) di semua kategori/minggu
            sehingga stok yang gagal terjual tertahan di gudang dan occupancy
            rate membesar otomatis (lihat salesRealizationFactorFor()). */}
        <div
          className={`w-full flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border transition-all duration-300 ${
            salesRealizationActive
              ? 'bg-orange-500 border-orange-400 text-black shadow-lg shadow-orange-500/25'
              : 'bg-white border-border text-foreground'
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSalesRealizationActive((v) => !v);
                toast.success(!salesRealizationActive
                  ? `Realisasi Sales -${salesRealizationPercent}% diaktifkan: Target dipotong ${salesRealizationPercent}%, occupancy diproyeksikan naik.`
                  : 'Realisasi Sales dinonaktifkan.');
              }}
              className="flex items-center gap-2.5 font-bold text-sm text-left"
            >
              <TrendingDown className={`w-5 h-5 shrink-0 ${salesRealizationActive ? 'text-black' : 'text-orange-500'}`} />
              Realisasi Sales -{salesRealizationPercent}%
            </button>

            <label
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg border ${
                salesRealizationActive ? 'border-black/30 bg-black/10' : 'border-border bg-muted/50'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <span>Persentase:</span>
              <input
                type="number"
                min={0}
                max={MAX_SALES_REALIZATION_PERCENT}
                step={1}
                value={salesRealizationPercent}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  setSalesRealizationPercent(Number.isFinite(raw) ? Math.min(MAX_SALES_REALIZATION_PERCENT, Math.max(0, raw)) : 0);
                }}
                className="w-16 px-2 py-1 rounded border border-border bg-white text-black text-xs font-bold text-center"
              />
              <span>%</span>
            </label>

            <span className={`text-xs font-medium whitespace-normal break-words ${salesRealizationActive ? 'text-black/70' : 'text-muted-foreground'}`}>
              (Target seluruh kategori dipotong {salesRealizationPercent}% tiap minggu — occupancy naik otomatis)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSalesRealizationActive((v) => !v)}
            aria-label="Toggle Realisasi Sales"
            className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${salesRealizationActive ? 'bg-black/80' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${salesRealizationActive ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── UPLOAD BOX WHEN RESULTS PRESENT OR HIDDEN ─── */}
      <GlassCard className="no-export p-4 bg-white border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full">
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isProcessing}
            templateCsv={
              'Cabang,Category,On Hand,In,Out,Capacity,Date\n' +
              'DC Jakarta,Electronics,200,150,120,5000,2026-08-01\n' +
              'DC Surabaya,Apparel,300,180,190,4000,2026-08-01'
            }
            templateName="occupancy_template.csv"
            label="Upload Dataset Occupancy (Excel/CSV)"
            description="Format Multi-Sheet MRP (Raw & WH) atau Format Legacy CSV/XLSX (Cabang, Category, On Hand, In, Out, Capacity, Date)."
          />
          {asyncJobId && (
            <div className="mt-3">
              <AsyncUploadStatus
                jobId={asyncJobId}
                onCompleted={() => toast.success('Hasil olahan siap! Data ter-update otomatis.', { icon: '✅' })}
                onFailed={(msg) => toast.error(`Pemrosesan gagal: ${msg}`)}
              />
            </div>
          )}
        </div>
        <div className="sm:border-l border-border sm:pl-4 flex flex-col justify-center items-center shrink-0 gap-2.5">
          <button
            onClick={handleDownloadTemplate}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-[#1E1E2C] font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs sm:text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" /> Download Template MRP
          </button>
          <button
            onClick={handleGenerateDemo}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs sm:text-sm"
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
      </GlassCard>

      {results && (
        /* ── Result state ── */
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-xl font-bold uppercase tracking-wide text-foreground flex items-center gap-2">
              📈 Hasil Analisa Occupancy & Shortage
            </h2>
            <TimestampBadge timestamp={results.processed_at} />
          </div>

          {/* ═══ OCCUPANCY SECTION ═══ */}

          {/* KPI Row & Deep Insights (frozen snapshot — a live, filterable copy is generated in the offline export section below) */}
          <div className="no-export grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Avg Occupancy */}
            <GlassCard className="flex flex-col justify-between p-5 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Occupancy</span>
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="my-4">
                <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.avg}%</div>
                <p className="text-xs text-muted-foreground mt-1">Rerata dari filter aktif</p>
              </div>
            </GlassCard>

            {/* Peak Occupancy (Top 3) */}
            <GlassCard className="flex flex-col justify-between p-5 border-orange-500/30 bg-orange-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">Peak Occupancy</span>
                  <Layers className="w-5 h-5 text-orange-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.peak}%</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Top 3 Maksimum (Cabang & Periode):</p>
                </div>
                <div className="space-y-1.5 mt-2">
                  {kpiMetrics.top3Peak.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[120px]">#{idx+1} {p.cabang} <span className="text-[10px] text-muted-foreground">({p.date})</span></span>
                      <span className="font-bold text-orange-500 ml-2">{p.val}%</span>
                    </div>
                  ))}
                  {kpiMetrics.top3Peak.length === 0 && <p className="text-xs text-muted-foreground italic">Tidak ada data</p>}
                </div>
              </div>
            </GlassCard>

            {/* Min Occupancy (Bottom 3) */}
            <GlassCard className="flex flex-col justify-between p-5 border-blue-500/30 bg-blue-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">Min Occupancy</span>
                  <TrendingDown className="w-5 h-5 text-blue-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.min}%</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Bottom 3 Minimum (Cabang & Periode):</p>
                </div>
                <div className="space-y-1.5 mt-2">
                  {kpiMetrics.bottom3Min.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground truncate max-w-[120px]">#{idx+1} {m.cabang} <span className="text-[10px] text-muted-foreground">({m.date})</span></span>
                      <span className="font-bold text-blue-500 ml-2">{m.val}%</span>
                    </div>
                  ))}
                  {kpiMetrics.bottom3Min.length === 0 && <p className="text-xs text-muted-foreground italic">Tidak ada data</p>}
                </div>
              </div>
            </GlassCard>

            {/* Categories at Risk (Top 5) */}
            <GlassCard className="flex flex-col justify-between p-5 border-destructive/30 bg-destructive/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-destructive uppercase tracking-wider">Categories at Risk</span>
                  <AlertOctagon className="w-5 h-5 text-destructive" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.riskCount}</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Top 5 Kategori Berbahaya:</p>
                </div>
                <div className="space-y-1.5 mt-2 max-h-[140px] overflow-y-auto">
                  {kpiMetrics.top5RiskCategories.map((r, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5 text-[11px] py-1.5 px-2 rounded bg-background/50 border border-border/40">
                      <span className="font-medium text-foreground whitespace-normal break-words leading-snug">#{idx+1} {r.category} <span className="text-[9px] text-muted-foreground">({r.cabang})</span></span>
                      <span className="font-bold text-destructive self-end">{r.reason}</span>
                    </div>
                  ))}
                  {kpiMetrics.top5RiskCategories.length === 0 && <p className="text-xs text-muted-foreground italic">Aman (Tidak ada risiko)</p>}
                </div>
              </div>
            </GlassCard>

            {/* Overstock Count (mirrors Categories at Risk, opposite direction) */}
            <GlassCard className="flex flex-col justify-between p-5 border-amber-500/30 bg-amber-500/5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Overstock Alerts</span>
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight text-foreground">{kpiMetrics.overstockCount}</div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Kombinasi Cabang/Category kelebihan stok (&gt; {'8'} minggu coverage)</p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Insights Row (frozen snapshot — replaced by the filterable Occupancy Harian table in the offline export section) */}
          {(insights.over.length > 0 || insights.lower.length > 0) && (
            <div className="no-export grid md:grid-cols-2 gap-6">
              {insights.over.length > 0 && (
                <GlassCard className="border-orange-500/30 bg-orange-500/5">
                  <h3 className="text-lg font-bold text-orange-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <AlertTriangle className="w-5 h-5" /> Over Occupancy (&gt; 100%)
                  </h3>
                  <PaginatedTable
                    data={insights.over}
                    pageSize={25}
                    renderTable={(slicedData) => (
                      <div className="relative overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-border">
                        <table className="w-full text-sm text-left text-muted-foreground table-fixed">
                          <colgroup>
                            <col className="w-[40%]" />
                            <col className="w-[30%]" />
                            <col className="w-[30%]" />
                          </colgroup>
                          <thead className="text-xs text-foreground uppercase bg-muted border-b border-border sticky top-0 z-10 font-bold tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Cabang</th>
                              <th className="px-4 py-3">Tanggal</th>
                              <th className="px-4 py-3 text-right">Occupancy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slicedData.map((a: any, i: number) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors bg-background">
                                <td className="px-4 py-3 font-medium text-foreground truncate">{a.cabang}</td>
                                <td className="px-4 py-3 truncate">{a.date}</td>
                                <td className="px-4 py-3 text-right font-bold text-orange-500">{a.occupancy_pct}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />
                </GlassCard>
              )}

              {insights.lower.length > 0 && (
                <GlassCard className="border-blue-500/30 bg-blue-500/5">
                  <h3 className="text-lg font-bold text-blue-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                    <Info className="w-5 h-5" /> Lower Occupancy (&lt; 50%)
                  </h3>
                  <PaginatedTable
                    data={insights.lower}
                    pageSize={25}
                    renderTable={(slicedData) => (
                      <div className="relative overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-border">
                        <table className="w-full text-sm text-left text-muted-foreground table-fixed">
                          <colgroup>
                            <col className="w-[40%]" />
                            <col className="w-[30%]" />
                            <col className="w-[30%]" />
                          </colgroup>
                          <thead className="text-xs text-foreground uppercase bg-muted border-b border-border sticky top-0 z-10 font-bold tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Cabang</th>
                              <th className="px-4 py-3">Tanggal</th>
                              <th className="px-4 py-3 text-right">Occupancy</th>
                            </tr>
                          </thead>
                          <tbody>
                            {slicedData.map((a: any, i: number) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors bg-background">
                                <td className="px-4 py-3 font-medium text-foreground truncate">{a.cabang}</td>
                                <td className="px-4 py-3 truncate">{a.date}</td>
                                <td className="px-4 py-3 text-right font-bold text-blue-500">{a.occupancy_pct}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  />
                </GlassCard>
              )}
            </div>
          )}

          {/* Chart Card */}
          <GlassCard allowOverflow={true} className="mb-10 p-6 bg-white border-border shadow-xl relative z-30">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-6 border-b border-border pb-6">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">
                  Occupancy per Cabang per Tanggal
                </h3>
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  Total On Hand (All Categories) ÷ Kapasitas Cabang
                </p>
                {/* Filters (live-only — dead after clone, so excluded from export; real offline filters are generated below) */}
                <div className="no-export grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 max-w-2xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider block">🏢 Filter Cabang:</label>
                    <MultiSelect
                      options={cabangs}
                      selected={selectedCabang}
                      onChange={setSelectedCabang}
                      selectAllLabel="Semua Cabang"
                      placeholder="Pilih Cabang..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider block">📅 Filter Tanggal:</label>
                    <MultiSelect
                      options={dates}
                      selected={selectedDate}
                      onChange={setSelectedDate}
                      selectAllLabel="Semua Tanggal"
                      placeholder="Pilih Tanggal..."
                    />
                  </div>
                </div>
              </div>
              <div className="no-export flex gap-3 shrink-0">
                <button onClick={handleExport}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-transparent rounded-xl transition text-sm flex items-center gap-2 font-bold shadow-md">
                  <Download className="w-4 h-4 text-white" /> Export Hasil Olah (Lengkap)
                </button>
              </div>
            </div>

            {filteredData.length > 0
              ? <OccupancyChart data={filteredData} />
              : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm font-medium">
                  Tidak ada data untuk filter yang dipilih.
                </div>
            }
          </GlassCard>

          {/* Shortage Alerts (frozen snapshot — replaced by the filterable table in the offline export section) */}
          {filteredShortageAlerts.length > 0 && (
            <GlassCard className="no-export border-destructive/30 bg-destructive/5">
              <h3 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2 uppercase tracking-wide">
                <AlertTriangle className="w-5 h-5" /> Shortage Alerts (Mengikuti Filter)
              </h3>
              {results?.shortage_alerts_truncated && (
                <div className="mb-3 text-xs font-semibold text-destructive/80 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                  Dataset sangat besar: hanya {(results.shortage_alerts || []).length.toLocaleString('id-ID')} dari total {Number(results.shortage_alerts_total_count || 0).toLocaleString('id-ID')} shortage alerts (defisit terbesar) yang disimpan, agar hasil tetap bisa disinkronkan secara realtime. KPI &quot;Categories at Risk&quot; tetap menghitung total sebenarnya.
                </div>
              )}
              {shortageTableFilters.activeCount > 0 && (
                <button
                  onClick={shortageTableFilters.clearAll}
                  className="no-export mb-3 text-xs font-semibold text-orange-500 hover:text-orange-400 underline"
                >
                  Hapus semua filter kolom ({shortageTableFilters.activeCount})
                </button>
              )}
              <PaginatedTable
                data={shortageTableFilters.filteredData}
                pageSize={50}
                renderTable={(slicedData) => (
                  <div className="relative overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-sm text-left text-muted-foreground table-fixed">
                      <colgroup>
                        <col className="w-[25%]" />
                        <col className="w-[35%]" />
                        <col className="w-[20%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                      <thead className="text-xs text-foreground uppercase bg-muted border-b border-border sticky top-0 z-10 font-bold tracking-wider">
                        <tr>
                          <FilterableHeader
                            label="Cabang"
                            columnKey="cabang"
                            type="select"
                            className="py-3 px-4"
                            options={shortageTableFilters.uniqueValuesByKey['cabang']}
                            activeFilter={shortageTableFilters.filters['cabang']}
                            onChange={(v) => shortageTableFilters.setFilter('cabang', v)}
                          />
                          <FilterableHeader
                            label="Category"
                            columnKey="category"
                            type="text"
                            className="py-3 px-4"
                            activeFilter={shortageTableFilters.filters['category']}
                            onChange={(v) => shortageTableFilters.setFilter('category', v)}
                          />
                          <FilterableHeader
                            label="Tanggal"
                            columnKey="date"
                            type="select"
                            className="py-3 px-4"
                            options={shortageTableFilters.uniqueValuesByKey['date']}
                            activeFilter={shortageTableFilters.filters['date']}
                            onChange={(v) => shortageTableFilters.setFilter('date', v)}
                          />
                          <FilterableHeader
                            label="Deficit"
                            columnKey="deficit"
                            type="number"
                            align="right"
                            className="py-3 px-4"
                            activeFilter={shortageTableFilters.filters['deficit']}
                            onChange={(v) => shortageTableFilters.setFilter('deficit', v)}
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {slicedData.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors bg-background">
                            <td className="px-4 py-3 font-medium text-foreground truncate">{a.cabang}</td>
                            <td className="px-4 py-3 font-medium text-foreground truncate">{a.category}</td>
                            <td className="px-4 py-3 truncate">{a.date}</td>
                            <td className="px-4 py-3 text-right text-destructive font-bold">{Number(a.deficit).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              />
            </GlassCard>
          )}

          {/* Overstock Alerts (cermin persis Shortage Alerts di atas — arsitektur state & UI yang sama) */}
          {filteredOverstockAlerts.length > 0 && (
            <GlassCard className="no-export border-amber-500/30 bg-amber-500/5">
              <h3 className="text-lg font-bold text-amber-500 mb-4 flex items-center gap-2 uppercase tracking-wide">
                <TrendingUp className="w-5 h-5" /> Overstock Alerts (Mengikuti Filter)
              </h3>
              {results?.overstock_alerts_truncated && (
                <div className="mb-3 text-xs font-semibold text-amber-600/80 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Dataset sangat besar: hanya {(results.overstock_alerts || []).length.toLocaleString('id-ID')} dari total {Number(results.overstock_alerts_total_count || 0).toLocaleString('id-ID')} overstock alerts (kelebihan stok terbesar) yang disimpan, agar hasil tetap bisa disinkronkan secara realtime. KPI &quot;Overstock Alerts&quot; tetap menghitung total sebenarnya.
                </div>
              )}
              {overstockTableFilters.activeCount > 0 && (
                <button
                  onClick={overstockTableFilters.clearAll}
                  className="no-export mb-3 text-xs font-semibold text-orange-500 hover:text-orange-400 underline"
                >
                  Hapus semua filter kolom ({overstockTableFilters.activeCount})
                </button>
              )}
              <PaginatedTable
                data={overstockTableFilters.filteredData}
                pageSize={50}
                renderTable={(slicedData) => (
                  <div className="relative overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-sm text-left text-muted-foreground table-fixed">
                      <colgroup>
                        <col className="w-[25%]" />
                        <col className="w-[35%]" />
                        <col className="w-[20%]" />
                        <col className="w-[20%]" />
                      </colgroup>
                      <thead className="text-xs text-foreground uppercase bg-muted border-b border-border sticky top-0 z-10 font-bold tracking-wider">
                        <tr>
                          <FilterableHeader
                            label="Cabang"
                            columnKey="cabang"
                            type="select"
                            className="py-3 px-4"
                            options={overstockTableFilters.uniqueValuesByKey['cabang']}
                            activeFilter={overstockTableFilters.filters['cabang']}
                            onChange={(v) => overstockTableFilters.setFilter('cabang', v)}
                          />
                          <FilterableHeader
                            label="Category"
                            columnKey="category"
                            type="text"
                            className="py-3 px-4"
                            activeFilter={overstockTableFilters.filters['category']}
                            onChange={(v) => overstockTableFilters.setFilter('category', v)}
                          />
                          <FilterableHeader
                            label="Tanggal"
                            columnKey="date"
                            type="select"
                            className="py-3 px-4"
                            options={overstockTableFilters.uniqueValuesByKey['date']}
                            activeFilter={overstockTableFilters.filters['date']}
                            onChange={(v) => overstockTableFilters.setFilter('date', v)}
                          />
                          <FilterableHeader
                            label="Excess"
                            columnKey="excess"
                            type="number"
                            align="right"
                            className="py-3 px-4"
                            activeFilter={overstockTableFilters.filters['excess']}
                            onChange={(v) => overstockTableFilters.setFilter('excess', v)}
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {slicedData.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors bg-background">
                            <td className="px-4 py-3 font-medium text-foreground truncate">{a.cabang}</td>
                            <td className="px-4 py-3 font-medium text-foreground truncate">{a.category}</td>
                            <td className="px-4 py-3 truncate">{a.date}</td>
                            <td className="px-4 py-3 text-right text-amber-600 font-bold">{Number(a.excess).toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              />
            </GlassCard>
          )}

          {/* ═══ MRP AUTOMATED ANALYSIS SECTION (WHEN MULTI-SHEET EXCEL UPLOADED) ═══ */}
          {/* Fitur 5: modul ini SENGAJA dibatasi hanya memakai kombinasi warna
              Hitam, Putih, dan Oranye (tanpa indigo/emerald/rose/amber) --
              termasuk kartu, tombol, tabel, dan kotak rangkuman di bawah.
              CATATAN: GlassCard membawa class `.glass-card` bawaan yang
              di-@apply di dalam `@layer utilities` (globals.css) -- karena
              berada di layer & spesifisitas yang SAMA dengan utility Tailwind
              biasa, `bg-*`/`border-*` yang ditaruh langsung di className
              GlassCard KALAH oleh `bg-card`/`border-border` bawaannya (menang
              karena posisinya lebih akhir di CSS hasil build), sehingga kartu
              ini tetap terlihat terang, bukan hitam pekat. Makanya teks yang
              duduk LANGSUNG di atas kartu (bukan di dalam sub-elemen yang
              punya bg sendiri seperti thead/chip/tabel) memakai warna gelap
              (text-black), bukan text-white -- lihat juga `!border-orange-400`
              di bawah yang memakai modifier `!important` Tailwind supaya
              warna border benar-benar tampil oranye walau kalah lapisan. */}
          {mrpData && (
            <GlassCard className="p-6 !border-orange-400 shadow-2xl relative z-30 mb-10">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-orange-200 pb-5 mb-6">
                <div>
                  <h3 className="text-xl font-extrabold text-black uppercase tracking-wide flex items-center gap-2.5">
                    <Sparkles className="w-6 h-6 text-orange-500 animate-pulse" />
                    Analisa &amp; Grafik MRP
                  </h3>
                  <p className="text-xs text-black/60 mt-1 font-medium">
                    Hasil kalkulasi otomatis balance mingguan, rasio demand, dan occupancy gudang per periode ({mrpData.period_labels?.join(', ')}).
                  </p>
                </div>
                <div className="no-export flex flex-wrap gap-3 shrink-0">
                  {/* Satu tombol gabungan: kalau workbook mentah tersedia (excel_storage_path
                      di Supabase Storage, atau fallback excel_base64), sheet Ringkasan
                      (Analisa Nilai Inventori/Shortage/Overstock -- dari data yang SUDAH
                      difilter di layar) ditambahkan ke workbook YANG SAMA lalu diunduh
                      sebagai satu file. Kalau workbook mentah TIDAK tersedia (lihat notice
                      excel_download_unavailable di bawah), tombol ini tetap tampil dan
                      jatuh ke ringkasan-saja, bukan hilang total tanpa penjelasan. */}
                  <button
                    onClick={async () => {
                      const ringkasanPayload = {
                        moduleName: 'Occupancy_Analisa',
                        processedAt: results?.processed_at,
                        inventoryValueRows: filteredInventoryValueRows.map((r: any) => ({
                          cabang: r.cabang,
                          grup: r.grup,
                          category: r.category,
                          week: r.week,
                          balanceContainer: Number(r.balance_container || 0),
                          qty: r.qty ?? null,
                          hargaSatuan: r.harga_satuan ?? null,
                        })),
                        shortageAlerts: shortageTableFilters.filteredData.map((a: any) => ({
                          cabang: a.cabang, category: a.category, date: a.date, amount: Number(a.deficit || 0),
                        })),
                        overstockAlerts: overstockTableFilters.filteredData.map((a: any) => ({
                          cabang: a.cabang, category: a.category, date: a.date, amount: Number(a.excess || 0),
                        })),
                        capacityByCabang: Object.fromEntries(
                          filteredData.map((d: any) => [d.cabang, Number(d.capacity || 0)])
                        ),
                      };

                      try {
                        if (mrpData.excel_storage_path || mrpData.excel_base64) {
                          toast.loading('Menyiapkan Excel Lengkap...', { id: 'dl-excel' });
                          const rawBytes = mrpData.excel_storage_path
                            ? await (await downloadOccupancyExcelFromStorage(mrpData.excel_storage_path)).arrayBuffer()
                            : base64ToArrayBuffer(mrpData.excel_base64);
                          await exportCombinedWorkbook(rawBytes, ringkasanPayload);
                          toast.success('Excel Lengkap (MRP + Ringkasan) berhasil diunduh!', { id: 'dl-excel' });
                        } else {
                          await exportOccupancyWorkbook(ringkasanPayload);
                          toast.success('Workbook MRP mentah tidak tersedia -- hanya sheet Ringkasan yang diunduh.', { icon: '⚠️' });
                        }
                      } catch (err: any) {
                        toast.error('Gagal mengunduh Excel: ' + (err?.message || 'Error tidak diketahui'), { id: 'dl-excel' });
                      }
                    }}
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl shadow-lg transition text-xs flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Download Excel Lengkap (MRP + Ringkasan)
                  </button>
                  {mrpData.html_report && (
                    <button
                      onClick={() => {
                        const blob = new Blob([mrpData.html_report], { type: 'text/html;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = getStandardFilename('mrp_analysis_report', results?.processed_at, 'html');
                        link.click();
                        toast.success('Laporan HTML Analisa MRP berhasil diunduh!');
                      }}
                      className="px-4 py-2.5 bg-white hover:bg-orange-50 text-black font-bold rounded-xl shadow-lg transition text-xs flex items-center gap-2 border border-orange-400"
                    >
                      <Download className="w-4 h-4" /> Download Laporan Analisa HTML
                    </button>
                  )}
                </div>
              </div>

              {/* excel_download_unavailable/html_report_unavailable: backend men-strip
                  field ini kalau payload masih kelewat besar SETELAH _offload_excel_to_storage
                  gagal upload ke Supabase Storage (lihat _prepare_result_for_storage di
                  routers/occupancy.py) -- sebelumnya kondisi ini membuat tombol download
                  hilang total tanpa penjelasan; sekarang tetap ada notice-nya di sini. */}
              {mrpData.excel_download_unavailable && (
                <div className="mb-4 text-xs font-semibold text-black/70 bg-red-100 border border-red-300 rounded-lg px-3 py-2">
                  File Excel mentah (Raw/WH/rumus) tidak tersedia untuk dataset ini -- terlalu besar untuk disinkronkan dan gagal diunggah ke Storage. Tombol di atas tetap bisa dipakai untuk mengunduh sheet Ringkasan (Analisa Nilai Inventori/Shortage/Overstock) saja. Cek log server untuk detail kegagalan upload Storage.
                </div>
              )}
              {mrpData.html_report_unavailable && (
                <div className="mb-4 text-xs font-semibold text-black/70 bg-orange-100 border border-orange-300 rounded-lg px-3 py-2">
                  Laporan HTML tidak tersedia untuk dataset ini (dipangkas karena dataset terlalu besar untuk disinkronkan secara realtime).
                </div>
              )}

              {/* inventory_value_rows dipangkas ke budget byte tetap di backend untuk
                  dataset nasional besar (lihat INVENTORY_VALUE_ROWS_BYTE_BUDGET di
                  routers/occupancy.py) -- Sheet 1 "Analisa Nilai Inventori" pada Excel
                  Lengkap/Ringkasan jadi cuma berisi baris paling bernilai, bukan seluruhnya. */}
              {results?.inventory_value_rows_truncated && (
                <div className="mb-4 text-xs font-semibold text-black/70 bg-orange-100 border border-orange-300 rounded-lg px-3 py-2">
                  Dataset sangat besar: Sheet &quot;Analisa Nilai Inventori&quot; pada Excel yang diunduh hanya berisi {(results.inventory_value_rows || []).length.toLocaleString('id-ID')} dari total {Number(results.inventory_value_rows_total_count || 0).toLocaleString('id-ID')} baris (nilai terbesar), agar hasil tetap bisa disinkronkan secara realtime.
                </div>
              )}

              {/* Komparasi Occupancy Mingguan Table */}
              {mrpData.occupancy_series_target && (
                <div className="mb-8">
                  <h4 className="text-sm sm:text-base font-extrabold text-black mb-4 flex items-center gap-2.5 border-b border-orange-200 pb-2.5">
                    <Activity className="w-5 h-5 text-orange-400" /> Komparasi Occupancy Mingguan terhadap Target (%)
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-orange-500/30 bg-black shadow-xl">
                    <table className="w-full text-xs text-left text-black">
                      <thead className="bg-black text-white uppercase font-extrabold border-b border-orange-500/40 tracking-wider">
                        <tr>
                          <FilterableHeader
                            label="Cabang"
                            columnKey="cabang"
                            type="select"
                            className="py-3.5 px-4"
                            accentClassName="text-orange-400"
                            options={mrpTableFilters.uniqueValuesByKey['cabang']}
                            activeFilter={mrpTableFilters.filters['cabang']}
                            onChange={(v) => mrpTableFilters.setFilter('cabang', v)}
                          />
                          <th className="py-3.5 px-4 text-center">Skenario</th>
                          {mrpData.period_labels?.map((label: string, i: number) => (
                            <FilterableHeader
                              key={i}
                              label={label}
                              columnKey={`week_${i}`}
                              type="number"
                              align="right"
                              className="py-3.5 px-3"
                              accentClassName="text-orange-400"
                              activeFilter={mrpTableFilters.filters[`week_${i}`]}
                              onChange={(v) => mrpTableFilters.setFilter(`week_${i}`, v)}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-500/10 font-medium">
                        {mrpTableFilters.filteredData.map((cabang) => {
                          const tVals = displayOccupancySeriesTarget?.[cabang] || [];
                          return (
                            <React.Fragment key={cabang}>
                              <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/10">
                                <td className="py-3 px-4 font-black text-black text-sm" rowSpan={1}>{cabang}</td>
                                <td className="py-2 px-3 text-center font-bold text-white bg-black rounded">Target</td>
                                {tVals.map((v: number, vIdx: number) => {
                                  // Conditional Formatting 1 (Task 1b): occupancy > 80% -> merah.
                                  const isCritical = v > 80;
                                  return (
                                    <td key={vIdx} className={`py-2.5 px-3 text-right text-sm font-bold ${
                                      isCritical ? 'text-red-600 font-black' : 'text-black'
                                    }`}>
                                      {v.toFixed(1)}%
                                      {isCritical && (
                                        <span className="block text-[9px] font-extrabold text-red-600 uppercase tracking-tighter">
                                          {v > 100 ? 'Over Capacity!' : 'Waspada (>80%)'}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Analisa Nilai Inventori: Container -> QTY (via CBM) -> Rupiah (via Harga Product) */}
              {mrpData.qty_series_by_branch && Object.keys(mrpData.qty_series_by_branch).length > 0 && (
                <div className="mb-8">
                  <h4 className="text-sm sm:text-base font-extrabold text-black mb-4 flex items-center gap-2.5 border-b border-orange-200 pb-2.5">
                    <FileSpreadsheet className="w-5 h-5 text-orange-400" /> Analisa Nilai Inventori - Konversi Container &rarr; QTY (CBM) &rarr; Value (Harga Product)
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-orange-500/30 bg-black shadow-xl">
                    <table className="w-full text-xs text-left text-black">
                      <thead className="bg-black text-white uppercase font-extrabold border-b border-orange-500/40 tracking-wider">
                        <tr>
                          <FilterableHeader
                            label="Cabang"
                            columnKey="cabang"
                            type="select"
                            className="py-3.5 px-4"
                            accentClassName="text-orange-400"
                            options={qtyValueTableFilters.uniqueValuesByKey['cabang']}
                            activeFilter={qtyValueTableFilters.filters['cabang']}
                            onChange={(v) => qtyValueTableFilters.setFilter('cabang', v)}
                          />
                          <th className="py-3.5 px-4 text-center">Metrik</th>
                          {(mrpData.period_labels || []).map((label: string, i: number) => (
                            <th key={i} className="py-3.5 px-3 text-right">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-500/10 font-medium">
                        {/* Fitur 3 belum ada di data ini: baris MOS (Value) hanya terisi untuk
                            hasil yang diproses SETELAH metrik ini ditambahkan ke backend --
                            hasil lama yang tersimpan di Supabase (dibuka lewat "Olah Terakhir")
                            tidak otomatis mendapatkannya. Tampilkan catatan alih-alih diam-diam
                            menyembunyikan baris supaya jelas bahwa perlu upload ulang. */}
                        {!mrpData.mos_value_series_by_branch && (
                          <tr className="bg-orange-50">
                            <td colSpan={2 + (mrpData.period_labels?.length || 0)} className="py-2 px-4 text-center text-[11px] text-black/70 italic">
                              MOS (Value) belum tersedia untuk data ini (hasil lama) -- upload ulang file Excel untuk menghitung metrik terbaru, atau coba &quot;Gunakan Data Demo&quot;.
                            </td>
                          </tr>
                        )}
                        {qtyValueTableFilters.filteredData.map((cabang) => {
                          const qtyVals: number[] = mrpData.qty_series_by_branch?.[cabang] || [];
                          const valVals: number[] = mrpData.value_series_by_branch?.[cabang] || [];
                          const mosValueVals: number[] = mrpData.mos_value_series_by_branch?.[cabang] || [];
                          return (
                            <React.Fragment key={cabang}>
                              {/* Bug fix (Task 1a): cabang cell diberi bg-white eksplisit
                                  (bukan mengandalkan bg dari <tr> "menembus" rowSpan),
                                  supaya tidak pernah jatuh ke background gelap tak sengaja. */}
                              <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/10">
                                <td className="py-3 px-4 font-black text-black text-sm bg-white" rowSpan={mosValueVals.length ? 3 : 2}>{cabang}</td>
                                <td className="py-2 px-3 text-center font-bold text-white bg-black rounded">QTY</td>
                                {qtyVals.map((v: number, vIdx: number) => (
                                  // Conditional Formatting 2 (Task 1c): nilai minus (< 0) -> merah.
                                  <td key={vIdx} className={`py-2.5 px-3 text-right text-sm font-bold ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                                    {v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                                  </td>
                                ))}
                              </tr>
                              <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/20">
                                <td className="py-2 px-3 text-center font-bold text-black bg-orange-400 rounded">Value (Rp)</td>
                                {valVals.map((v: number, vIdx: number) => (
                                  <td key={vIdx} className={`py-2.5 px-3 text-right text-sm font-bold font-mono ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                                    Rp {v.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                                  </td>
                                ))}
                              </tr>
                              {/* Fitur 3: MOS berbasis Value -- tepat di bawah baris Value (Rp). */}
                              {mosValueVals.length > 0 && (
                                <tr className="bg-white hover:bg-orange-50 transition border-b border-orange-500/20">
                                  <td className="py-2 px-3 text-center font-bold text-black bg-white border-2 border-black rounded">MOS (Value)</td>
                                  {mosValueVals.map((v: number, vIdx: number) => (
                                    <td key={vIdx} className={`py-2.5 px-3 text-right text-sm font-bold font-mono ${v < 0 ? 'text-red-600' : 'text-black'}`}>
                                      {v.toFixed(2)}x
                                    </td>
                                  ))}
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-black/60 mt-2">
                    QTY = Running Balance (container) &times; 68 &divide; CBM per Cabang+Category. Value = QTY &times; Harga per Cabang+Category (sheet &quot;CBM&quot; &amp; &quot;Harga Product&quot;). MOS (Value) = Value (Rp) &divide; SUM(AA per Cabang, minggu yang sama), di mana AA = (Target &times; 68 &divide; CBM) &times; Harga Product per Cabang+Category &times; 4 -- Target dikonversi ke QTY dengan rumus CBM yang sama seperti QTY di atas, bukan Target mentah, supaya satuan pembilang &amp; penyebut sama. Baris bernilai 0 berarti kombinasi Cabang+Category tidak ditemukan di sheet lookup.
                  </p>

                  {/* Fitur 3: grafik tren MOS (Value) per cabang, diposisikan tepat
                      di bawah tabel metrik Value (Rp) / MOS (Value) di atas. */}
                  {mrpData.mos_value_series_by_branch && Object.keys(mrpData.mos_value_series_by_branch).length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-xs font-extrabold text-black/70 uppercase tracking-wider mb-2">
                        Grafik Tren MOS (Value) per Cabang
                      </h5>
                      <MosValueChart
                        periodLabels={mrpData.period_labels || []}
                        seriesByBranch={mrpData.mos_value_series_by_branch}
                        branches={qtyValueTableFilters.filteredData}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Automated Insights Section (Filtered) */}
              {(() => {
                const filteredShortageAlerts = (mrpData.shortage_alerts || []).filter((a: any) => selectedCabang.includes('All') || selectedCabang.includes(a.cabang));
                const filteredDailyData = (mrpData.daily_data || []).filter((d: any) => selectedCabang.includes('All') || selectedCabang.includes(d.cabang));
                const hasInsights = filteredShortageAlerts.length > 0 || filteredDailyData.some((d: any) => d.occupancy_pct > 100);
                if (!hasInsights) return null;
                return (
                  <div className="mb-6 bg-white border border-orange-400 rounded-2xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-black mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-orange-500" /> Rangkuman Status Gudang (Mengikuti Filter)
                    </h4>
                    <div className="flex flex-wrap gap-4">
                      <div className="px-4 py-3 bg-black border border-orange-500 rounded-xl flex items-center gap-3">
                        <AlertOctagon className="w-6 h-6 text-orange-500" />
                        <div>
                          <div className="text-white font-bold text-lg">{filteredShortageAlerts.length} Alert</div>
                          <div className="text-orange-400 text-xs font-medium">Potensi Kekurangan Stok</div>
                        </div>
                      </div>
                      <div className="px-4 py-3 bg-white border-2 border-black rounded-xl flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-orange-500" />
                        <div>
                          <div className="text-black font-bold text-lg">
                            {filteredDailyData.filter((d: any) => d.occupancy_pct > 100).length} Insiden
                          </div>
                          <div className="text-orange-600 text-xs font-medium">Over Kapasitas Gudang</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </GlassCard>
          )}

          {/* NOTE: Tabel "Sheet Harga Container & Kalkulasi MOS" sengaja tidak
              ditampilkan di dashboard atas permintaan user -- datanya (mos_data)
              tetap dihasilkan di backend dan WAJIB ada di sheet "3. Harga & MOS"
              pada file Excel hasil unduhan (Download Excel Hasil), tidak berubah. */}
        </div>
      )}
    </div>
  );
}

