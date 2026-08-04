/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { FileUploader } from '@/components/ui/FileUploader';
import { KPICard } from '@/components/ui/KPICard';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import {
  FileBarChart, Info, Calendar, BarChart3, Clock, Table as TableIcon, Download,
  Sparkles, Layers, HelpCircle, FileSpreadsheet, Zap, AlertTriangle, CheckCircle2,
  TrendingUp, Truck, AlertCircle, ExternalLink, Globe, Filter, Search, X, Check, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { get, set } from 'idb-keyval';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';

const COLORS = ['#a855f7', '#3b82f6', '#f97316', '#eab308', '#22c55e', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#10b981'];

type ScenarioType = 'current' | 'expedite' | 'delay';

const SCENARIOS = [
  {
    id: 'current' as ScenarioType,
    title: 'Jalur 1: Evaluasi Aktual PR & Status Compile',
    desc: 'Pemantauan posisi terkini dari dokumen Purchase Requisition, PO Vendor, dan status bongkar muat secara live.',
    color: 'from-purple-600 to-indigo-500',
    icon: FileBarChart,
    multiplier: 1.0,
    statusModifier: 'normal'
  },
  {
    id: 'expedite' as ScenarioType,
    title: 'Jalur 2: Simulasi Percepatan Lead Time (-7 Hari)',
    desc: 'Estimasi percepatan kedatangan kapal (Vessel) dan konversi status dari Hold menjadi Ready untuk amankan stok.',
    color: 'from-emerald-600 to-teal-500',
    icon: TrendingUp,
    multiplier: 1.1,
    statusModifier: 'expedite'
  },
  {
    id: 'delay' as ScenarioType,
    title: 'Jalur 3: Simulasi Delay Port / Hold Vendor (+15 Hari)',
    desc: 'Uji ketahanan gudang terhadap risiko kemacetan pelabuhan atau penahanan pengiriman dari pihak pabrik/vendor.',
    color: 'from-rose-600 to-orange-500',
    icon: AlertTriangle,
    multiplier: 0.85,
    statusModifier: 'delay'
  }
];

function getDirectTrackingUrl(containerNo?: string, carrierName?: string): { url: string; carrier: string } {
  const no = (containerNo || "").trim().toUpperCase();
  let carrier = (carrierName || "").toLowerCase().trim();

  if (!no || no === '-' || no === '0' || no === '#N/A' || no === 'N/A' || no === 'NULL') {
    return { url: "", carrier: "-" };
  }

  // Auto-detect carrier by container prefix if carrier not explicit or generic
  if (!carrier || carrier === '-' || carrier.includes('agregator') || carrier.includes('custom') || carrier === 'all') {
    if (no.startsWith('MRTU') || no.startsWith('MTRU')) carrier = 'meratus';
    else if (no.startsWith('TEMU') || no.startsWith('TMSU')) carrier = 'temas';
    else if (no.startsWith('SPIL') || no.startsWith('SPU') || no.startsWith('SUL')) carrier = 'spil';
    else if (no.startsWith('MAEU') || no.startsWith('MSKU') || no.startsWith('MRKU')) carrier = 'maersk';
    else if (no.startsWith('MSCU') || no.startsWith('MEDU')) carrier = 'msc';
    else if (no.startsWith('CMAU') || no.startsWith('CGMU') || no.startsWith('APZU')) carrier = 'cma cgm';
    else if (no.startsWith('ONEU') || no.startsWith('ONEY')) carrier = 'one';
    else if (no.startsWith('EGLV') || no.startsWith('EVER') || no.startsWith('EMCU')) carrier = 'evergreen';
    else if (no.startsWith('HLCU') || no.startsWith('HPGU')) carrier = 'hapag-lloyd';
    else if (no.startsWith('COSU') || no.startsWith('CCLU') || no.startsWith('OOCL')) carrier = 'cosco';
    else if (no.startsWith('ZIMU')) carrier = 'zim';
  }

  // Domestic Indonesia Shipping
  if (carrier.includes("temas") || carrier.includes("kliktemas")) return { url: "https://apps.kliktemas.com/", carrier: "Temas Line (KlikTemas)" };
  if (carrier.includes("meratus")) return { url: "https://www.meratusline.com/", carrier: "Meratus Line" };
  if (carrier.includes("spil") || carrier.includes("salam pacific") || carrier.includes("myspil")) return { url: "https://www.myspil.com/", carrier: "SPIL (mySPIL)" };
  if (carrier.includes("samudera")) return { url: "https://samuderaconnect.com/", carrier: "Samudera Indonesia" };
  if (carrier.includes("tanto")) return { url: "https://www.tantonet.com/", carrier: "Tanto Intim Line" };
  if (carrier.includes("wan hai") || carrier.includes("wanhai")) return { url: "https://www.wanhai.com/views/Cargo_Tracking/CargoTracking.xhtml", carrier: "Wan Hai Lines" };
  if (carrier.includes("pil") || carrier.includes("pacific int")) return { url: "https://www.pilship.com/cargo-tracking", carrier: "PIL (Pacific Int'l Lines)" };

  // Global Shipping Deep Links
  if (carrier.includes("maersk")) return { url: `https://www.maersk.com/tracking/${no}`, carrier: "Maersk" };
  if (carrier.includes("msc")) return { url: `https://www.msc.com/en/track-a-shipment?number=${no}`, carrier: "MSC" };
  if (carrier.includes("cma") || carrier.includes("cgm")) return { url: `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=CN&Reference=${no}`, carrier: "CMA CGM" };
  if (carrier.includes("one") || carrier.includes("ocean network")) return { url: `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trackingNo=${no}`, carrier: "ONE (Ocean Network Express)" };
  if (carrier.includes("hapag") || carrier.includes("lloyd")) return { url: `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?blno=${no}`, carrier: "Hapag-Lloyd" };
  if (carrier.includes("zim")) return { url: `https://www.zim.com/tools/track-a-shipment?consignmentNumber=${no}`, carrier: "ZIM" };
  if (carrier.includes("evergreen")) return { url: `https://www.evergreen-line.com/emodal/Cargo/CargoTrackingDetail?no=${no}`, carrier: "Evergreen Line" };
  if (carrier.includes("oocl")) return { url: `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?cn=${no}`, carrier: "OOCL" };
  if (carrier.includes("cosco")) return { url: `https://elines.coscoshipping.com/ebusiness/cargoTracking?no=${no}`, carrier: "COSCO Shipping" };

  // Default Universal Container Tracking via SeaRates
  return { url: `https://www.searates.com/container/tracking/?number=${no}`, carrier: "Universal Agregator (SeaRates)" };
}

const syncToTrackingContainer = async (parsed: ParsedData) => {
  const colCont = findColumn(parsed.headers, ['no container', 'nocontainer', 'no_kontainer', 'no kontainer', 'container', 'nomor container']);
  const colBranch = findColumn(parsed.headers, ['branch name', 'branch_name', 'branch', 'cabang']);
  const colStatus = findColumn(parsed.headers, ['status compile', 'status', 'state']);
  const colEta = findColumn(parsed.headers, ['tanggal eta', 'week eta', 'eta']);
  const colDesc = findColumn(parsed.headers, ['description', 'deskripsi', 'grup']);
  const colPo = findColumn(parsed.headers, ['po', 'po no', 'no po']);
  const colPr = findColumn(parsed.headers, ['nopr', 'no pr', 'pr no', 'pr']);
  const colBl = findColumn(parsed.headers, ['bl', 'no bl', 'bill of lading', 'booking', 'no booking']);
  const colCarrier = findColumn(parsed.headers, ['shipping line', 'shipping_line', 'pelayaran', 'carrier', 'maskapai', 'line']);

  if (!colCont) return;
  
  const containers = parsed.data
    .filter(row => row[colCont] && String(row[colCont]).trim() !== '' && String(row[colCont]).trim() !== '-' && String(row[colCont]).trim() !== '0' && String(row[colCont]).toUpperCase() !== 'N/A')
    .map((row, index) => {
      const no = String(row[colCont]).trim().toUpperCase();
      const carrierRaw = colCarrier ? String(row[colCarrier] || '') : '';
      const blVal = colBl ? String(row[colBl] || '') : '';
      const info = getDirectTrackingUrl(no, carrierRaw);
      return {
        id: 'sync-' + Date.now() + '-' + index,
        no: no,
        bl: blVal,
        carrier: info.carrier,
        cabang: colBranch ? String(row[colBranch] || 'Unknown') : 'Unknown',
        status: colStatus ? String(row[colStatus] || 'Sedang Berlayar') : 'Sedang Berlayar',
        pol: '',
        pod: colBranch ? `Gudang ${String(row[colBranch])}` : '',
        etd: '',
        eta: colEta ? String(row[colEta] || '') : '',
        notes: `Sinkronisasi PR Update: PO ${colPo ? row[colPo] : '-'} | PR ${colPr ? row[colPr] : '-'} | ${colDesc ? row[colDesc] : ''}`,
        lastChecked: new Date().toISOString().slice(0, 10)
      };
    });

  if (containers.length > 0) {
    const payload = {
      processed_at: new Date().toISOString(),
      containers
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_tracking_containers', JSON.stringify(payload));
    }
    try {
      await set('last_tracking_containers_v3', payload);
    } catch (e) {
      console.warn("Failed syncing to tracking containers IndexDB", e);
    }
  }
};

function generateDemoPRUpdate(): ParsedData {
  const cabangs = ['Surabaya', 'Jakarta', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar'];
  const grups = ['Minyak Goreng Premium', 'Beras Setra Ramos', 'Gula Pasir Kristal', 'Tepung Terigu Serbaguna', 'Kopi Bubuk Murni', 'Susu Kental Manis'];
  const categories = ['Food Basic', 'Beverages & Dairy', 'Baking Ingredients', 'Groceries Premium'];
  // Ditambahkan status SPJM sesuai permintaan pengguna
  const statuses = ['ON VESSEL', 'HOLD DELIVERY', 'SPJM', 'READY', 'PLAN LOADING', 'IN PROCESS'];
  const etas = ['Week 1 Agu', 'Week 2 Agu', 'Week 3 Agu', 'Week 4 Agu'];
  const containers = ['MRTU1234567', 'TEMU7654321', 'SPIL8899001', 'MAEU9988776', 'MSCU4455667', 'CMAU1122334', 'ONEY7788990', 'EGLV3344556'];
  const carriers = ['Meratus Line', 'Temas Line', 'SPIL (mySPIL)', 'Maersk', 'MSC', 'CMA CGM', 'ONE', 'Evergreen Line'];
  const bls = ['BL-MRT-9988', 'BL-TMS-7766', 'BL-SPL-5544', 'BL-MAE-3322', 'BL-MSC-1100', 'BL-CMA-8899', 'BL-ONE-6677', 'BL-EVG-4455'];
  
  const data: any[] = [];
  let poCounter = 1001;

  cabangs.forEach((cab, cIdx) => {
    grups.forEach((grp, idx) => {
      const stat = statuses[(idx + cIdx) % statuses.length];
      const eta = etas[(idx + Math.floor(cIdx / 2)) % etas.length];
      const qty = Math.round(500 + Math.random() * 3500);
      const cat = categories[idx % categories.length];
      const cont = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM') ? containers[(idx + cIdx) % containers.length] : '-';
      const bl = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM') ? bls[(idx + cIdx) % bls.length] : '-';
      const carrier = (stat === 'ON VESSEL' || stat === 'READY' || stat === 'SPJM') ? carriers[(idx + cIdx) % carriers.length] : '-';
      
      data.push({
        'PO': `PO-2026-${poCounter++}`,
        'NoPR': `PR-08-${poCounter}`,
        'Branch Name': cab,
        'GRUP': grp,
        'Category': cat,
        'Description': `${grp} - ${cat} (Kemasan Karton 24x)`,
        'STATUS Compile': stat,
        'No Container': cont,
        'bl': bl,
        'Shipping Line': carrier,
        'Tanggal ETA': new Date(Date.now() + (idx * 2 - 1) * 86400000).toISOString().slice(0, 10),
        'Week ETA': eta,
        'Qty': qty
      });
    });
  });

  const parsedDemo: ParsedData = {
    headers: ['PO', 'NoPR', 'Branch Name', 'GRUP', 'Category', 'Description', 'STATUS Compile', 'No Container', 'bl', 'Shipping Line', 'Tanggal ETA', 'Week ETA', 'Qty'],
    targetColumns: [
      { index: 12, name: 'Qty' }
    ],
    data,
    processed_at: new Date().toISOString()
  };

  syncToTrackingContainer(parsedDemo);
  return parsedDemo;
}

export default function PRUpdatePage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('current');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');
  
  // Filter khusus 3 status krusial pada tabel komparasi
  const [onlyCrucialStatus, setOnlyCrucialStatus] = useState<boolean>(true);

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedEta, setSelectedEta] = useState<string[]>(['All']);
  const [selectedStatusCompile, setSelectedStatusCompile] = useState<string[]>(['All']);
  const [chartViewMode, setChartViewMode] = useState<'eta' | 'cabang'>('eta');

  // Excel-like column filters for Table Detail
  const [colFilters, setColFilters] = useState<Record<string, { search: string; selected: string[] }>>({});
  const [activeFilterModalCol, setActiveFilterModalCol] = useState<string | null>(null);
  const [modalSearchInput, setModalSearchInput] = useState<string>('');

  useEffect(() => {
    get('last_pr_update').then(saved => {
      if (saved && saved.data && saved.data.length > 0) {
        setParsed(saved);
      } else {
        setParsed(generateDemoPRUpdate());
      }
    }).catch(err => {
      console.warn('Failed to load PR Update state from IndexDB', err);
      setParsed(generateDemoPRUpdate());
    });
  }, []);

  const handleGenerateDemo = () => {
    const demo = generateDemoPRUpdate();
    setParsed(demo);
    setColFilters({});
    toast.success('🎉 Data Demo PR Update & Status SPJM Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const headers = 'PO,NoPR,Branch Name,GRUP,Category,Description,STATUS Compile,No Container,bl,Shipping Line,Tanggal ETA,Week ETA,Qty';
    const row1 = 'PO-2026-101,PR-08-01,Surabaya,Minyak Goreng Premium,Food Basic,Minyak Goreng 2L,ON VESSEL,MRTU1234567,BL-MRT-9988,Meratus Line,2026-08-10,Week 2 Agu,2500';
    const row2 = 'PO-2026-102,PR-08-02,Jakarta,Beras Setra Ramos,Groceries Premium,Beras Premium 5kg,SPJM,TEMU7654321,BL-TMS-7766,Temas Line,2026-08-15,Week 3 Agu,1800';
    const row3 = 'PO-2026-103,PR-08-03,Bandung,Gula Pasir Kristal,Baking Ingredients,Gula Kristal 1kg,HOLD DELIVERY,-,-,-,2026-08-18,Week 3 Agu,3200';
    const blob = new Blob(['\ufeff' + headers + '\n' + row1 + '\n' + row2 + '\n' + row3], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_pr_update_tracking_13col.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📁 Template CSV PR Update & Tracking Container (13 Kolom) Berhasil Diunduh');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    toast.loading('Membaca file PR Update (Excel/CSV)...', { id: 'pr' });
    try {
      const parsedData = await parseDynamicCSV(file);
      setParsed(parsedData);
      setColFilters({});
      try {
        await set('last_pr_update', parsedData);
        await syncToTrackingContainer(parsedData);
      } catch (e) {
        console.warn('Data terlalu besar untuk disimpan di IndexDB', e);
      }
      toast.success('✅ Data PR Update Berhasil Diproses!', { id: 'pr' });
    } catch (err: any) {
      toast.error(err.message || 'Gagal memproses file', { id: 'pr' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Identify column names dynamically & distinctly
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['branch name', 'branch_name', 'cabang', 'branch', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colGrup = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'group', 'divisi', 'grup barang']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['category', 'kategori', 'item category', 'kategori produk']) : undefined, [parsed]);
  const colPo = useMemo(() => parsed ? findColumn(parsed.headers, ['po', 'no po', 'nomor po', 'po no']) : undefined, [parsed]);
  const colDesc = useMemo(() => parsed ? findColumn(parsed.headers, ['description', 'deskripsi', 'nama barang', 'item description']) : undefined, [parsed]);
  const colEta = useMemo(() => parsed ? findColumn(parsed.headers, ['week eta', 'eta fix', 'tanggal eta', 'eta']) : undefined, [parsed]);
  const colStatus = useMemo(() => parsed ? findColumn(parsed.headers, ['status compile', 'status', 'state']) : undefined, [parsed]);
  const colQty = useMemo(() => parsed ? findColumn(parsed.headers, ['qty', 'quantity', 'jumlah']) : undefined, [parsed]);
  const colContainer = useMemo(() => parsed ? findColumn(parsed.headers, ['no container', 'nocontainer', 'no_kontainer', 'no kontainer', 'container', 'nomor container']) : undefined, [parsed]);
  const colBl = useMemo(() => parsed ? findColumn(parsed.headers, ['bl', 'no bl', 'bill of lading', 'booking', 'no booking']) : undefined, [parsed]);
  const colCarrier = useMemo(() => parsed ? findColumn(parsed.headers, ['shipping line', 'shipping_line', 'pelayaran', 'carrier', 'maskapai', 'line']) : undefined, [parsed]);

  // Linked Filter options
  const cabangs = useMemo(() => {
    if (!parsed || !colCabang) return [];
    const source = parsed.data.filter(d =>
      (!colCategory || selectedCategory.includes('All') || selectedCategory.includes(d[colCategory])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colCabang]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua cabang'))).sort()];
  }, [parsed, colCabang, selectedCategory, selectedEta, colCategory, colEta]);

  const categories = useMemo(() => {
    if (!parsed) return [];
    const colToUse = colCategory || colGrup;
    if (!colToUse) return ['All'];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta]))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colToUse]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua kategori'))).sort()];
  }, [parsed, colCategory, colGrup, selectedCabang, selectedEta, colCabang, colEta]);

  const etas = useMemo(() => {
    if (!parsed || !colEta) return [];
    const source = parsed.data.filter(d =>
      (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
      (!colCategory || selectedCategory.includes('All') || (colCategory && selectedCategory.includes(d[colCategory])) || (colGrup && selectedCategory.includes(d[colGrup])))
    );
    return ['All', ...Array.from(new Set(source.map(d => d[colEta]).filter(v => v && !String(v).includes('#N/A') && !String(v).includes('#REF!') && String(v).toLowerCase() !== 'semua eta'))).sort()];
  }, [parsed, colEta, selectedCabang, selectedCategory, colCabang, colCategory, colGrup]);

  const statusCompiles = useMemo(() => {
    if (!parsed || !colStatus) return ['All'];
    return ['All', ...Array.from(new Set(parsed.data.map(d => String(d[colStatus] || '').trim()).filter(v => v && !v.includes('#N/A') && !v.includes('#REF!') && v !== '-'))).sort()];
  }, [parsed, colStatus]);

  // Filtered Data with Scenario adjustments
  const filtered = useMemo(() => {
    if (!parsed) return [];
    const sc = SCENARIOS.find(s => s.id === activeScenario) || SCENARIOS[0];
    const colCatUse = colCategory || colGrup;
    return parsed.data
      .filter(d =>
        (!colCabang || selectedCabang.includes('All') || selectedCabang.includes(d[colCabang])) &&
        (!colCatUse || selectedCategory.includes('All') || selectedCategory.includes(d[colCatUse])) &&
        (!colEta || selectedEta.includes('All') || selectedEta.includes(d[colEta])) &&
        (!colStatus || selectedStatusCompile.includes('All') || selectedStatusCompile.includes(String(d[colStatus] || '').trim()))
      )
      .map(row => {
        const copy = { ...row };
        if (colQty && copy[colQty] != null && copy[colQty] !== '') {
          copy[colQty] = Math.round(Number(String(copy[colQty]).replace(/[^0-9.-]+/g, '')) * sc.multiplier || 0);
        }
        if (colStatus && sc.statusModifier === 'expedite' && String(copy[colStatus]).toUpperCase().includes('HOLD')) {
          copy[colStatus] = 'READY / EXPEDITED';
        }
        if (colStatus && sc.statusModifier === 'delay' && String(copy[colStatus]).toUpperCase().includes('VESSEL')) {
          copy[colStatus] = 'HOLD DELIVERY (DELAY)';
        }
        return copy;
      });
  }, [parsed, selectedCabang, selectedCategory, selectedEta, selectedStatusCompile, colCabang, colCategory, colGrup, colEta, colQty, colStatus, activeScenario]);

  // Chart data: Grouped by Cabang, Week ETA & by Category, Count by STATUS Compile
  const { chartData, chartEtaData, chartCategoryData, statusList, totalQty, holdCount } = useMemo(() => {
    if (!parsed || filtered.length === 0) return { chartData: [], chartEtaData: [], chartCategoryData: [], statusList: [], totalQty: 0, holdCount: 0 };
    const mapCabang: Record<string, any> = {};
    const mapEta: Record<string, any> = {};
    const mapCat: Record<string, any> = {};
    const statuses = new Set<string>();
    let qtySum = 0;
    let holdSum = 0;

    const colCatUse = colCategory || colGrup;

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const cat = colCatUse ? (row[colCatUse] || 'Umum / No Kategori') : 'Umum';
      const eta = colEta ? (row[colEta] || 'Unscheduled / Tanpa ETA') : 'Unscheduled';
      
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      const stat = colStatus ? (String(row[colStatus] || 'Unknown').toUpperCase()) : 'TOTAL';
      const q = colQty && row[colQty] != null ? Math.round(Number(String(row[colQty]).replace(/[^0-9.-]+/g, '')) || 0) : 1;
      
      statuses.add(stat);
      qtySum += q;
      if (stat.includes('HOLD') || stat.includes('DELAY') || stat.includes('TUNDA')) {
        holdSum += 1;
      }

      // Group by Cabang
      if (!mapCabang[cbg]) {
        mapCabang[cbg] = { cabang: cbg };
      }
      mapCabang[cbg][stat] = Math.round((mapCabang[cbg][stat] || 0) + q);

      // Group by Week ETA
      if (!mapEta[eta]) {
        mapEta[eta] = { eta: eta };
      }
      mapEta[eta][stat] = Math.round((mapEta[eta][stat] || 0) + q);

      // Group by Category
      if (!mapCat[cat]) {
        mapCat[cat] = { category: cat };
      }
      mapCat[cat][stat] = Math.round((mapCat[cat][stat] || 0) + q);
    }

    return { 
      chartData: Object.values(mapCabang), 
      chartEtaData: Object.values(mapEta).sort((a, b) => String(a.eta).localeCompare(String(b.eta))),
      chartCategoryData: Object.values(mapCat), 
      statusList: Array.from(statuses), 
      totalQty: Math.round(qtySum), 
      holdCount: holdSum 
    };
  }, [parsed, filtered, colCabang, colCategory, colGrup, colEta, colStatus, colQty, selectedCabangForChart]);

  // Pivot Table Data (Grouped by Cabang - PO - Grup - Category - Description)
  const pivotData = useMemo(() => {
    if (!parsed || filtered.length === 0) return [];
    const map: Record<string, any> = {};

    for (const row of filtered) {
      const stat = colStatus ? (String(row[colStatus] || 'Unknown').toUpperCase()) : 'UNKNOWN';
      
      // Filter khusus status ON VESSEL, HOLD DELIVERY, SPJM (atau simulasi delay/expedite dari status tsb)
      if (onlyCrucialStatus) {
        const isCrucial = stat.includes('VESSEL') || stat.includes('HOLD') || stat.includes('SPJM') || stat.includes('DELAY') || stat.includes('EXPEDITED');
        if (!isCrucial) continue;
      }

      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const po = colPo ? (row[colPo] || '-') : '-';
      const grup = colGrup ? (row[colGrup] || '-') : '-';
      const cat = colCategory ? (row[colCategory] || '-') : '-';
      const desc = colDesc ? (row[colDesc] || 'Unknown') : 'Unknown';
      const eta = colEta ? (row[colEta] || 'Unknown') : 'Unknown';
      const q = colQty && row[colQty] != null ? Math.round(Number(String(row[colQty]).replace(/[^0-9.-]+/g, '')) || 0) : 0;

      const key = `${cbg}_${po}_${grup}_${cat}_${desc}_${stat}_${eta}`;
      if (!map[key]) {
        map[key] = {
          'Cabang': cbg,
          'PO': po,
          'Grup': grup,
          'Category': cat,
          'Deskripsi': desc,
          'Status': stat,
          'ETA': eta,
          'Total Qty': 0,
          'Jumlah Dokumen': 0
        };
      }
      map[key]['Total Qty'] = Math.round(map[key]['Total Qty'] + q);
      map[key]['Jumlah Dokumen'] += 1;
    }
    return Object.values(map).sort((a: any, b: any) => b['Total Qty'] - a['Total Qty']);
  }, [parsed, filtered, colCabang, colPo, colGrup, colCategory, colDesc, colStatus, colEta, colQty, onlyCrucialStatus]);

  // Excel-like Filtered Rows for Table Detail
  const displayedDetailRows = useMemo(() => {
    if (!filtered || filtered.length === 0) return [];
    const activeRules = Object.entries(colFilters).filter(([_, rule]) => rule && (rule.search.trim() !== '' || (rule.selected && rule.selected.length > 0)));
    if (activeRules.length === 0) return filtered;

    return filtered.filter(row => {
      for (const [col, rule] of activeRules) {
        let val = row[col];
        if (val === undefined || val === null) val = '-';
        const strVal = String(val).trim();
        
        if (rule.search && rule.search.trim() !== '') {
          if (!strVal.toLowerCase().includes(rule.search.toLowerCase().trim())) return false;
        }
        if (rule.selected && rule.selected.length > 0) {
          if (!rule.selected.includes(strVal)) return false;
        }
      }
      return true;
    });
  }, [filtered, colFilters]);

  // Unique values for Active Filter Modal
  const currentModalUniqueValues = useMemo(() => {
    if (!activeFilterModalCol || !filtered) return [];
    const setVals = new Set<string>();
    filtered.forEach(r => {
      let val = r[activeFilterModalCol];
      if (val === undefined || val === null || val === '') val = '-';
      setVals.add(String(val).trim());
    });
    return Array.from(setVals).sort();
  }, [activeFilterModalCol, filtered]);

  const handleApplyModalFilter = (selectedVals: string[]) => {
    if (!activeFilterModalCol) return;
    setColFilters(prev => ({
      ...prev,
      [activeFilterModalCol]: {
        search: modalSearchInput,
        selected: selectedVals.length === currentModalUniqueValues.length ? [] : selectedVals
      }
    }));
    setActiveFilterModalCol(null);
    setModalSearchInput('');
    toast.success(`Filter kolom ${activeFilterModalCol} diaplikasikan!`);
  };

  const handleExport = () => {
    if (!parsed || !parsed.data) return;
    const header = parsed.headers.map(h => `"${h}"`).join(',');
    const lines = [header];

    displayedDetailRows.forEach(row => {
      const line = parsed.headers.map(h => {
        let val = row[h];
        if (val === undefined || val === null) val = '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return val;
      }).join(',');
      lines.push(line);
    });

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getStandardFilename(`PR_Update_${activeScenario}`, new Date().toISOString(), 'csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('📊 Hasil Analisis PR Update Berhasil Diekspor!');
  };

  return (
    <div className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HERO BANNER HEADER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-6 sm:p-8 border border-purple-500/20 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#a855f7_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
              <FileBarChart className="w-3.5 h-3.5" /> Dashboard Data Harian • PR Update & Tracking Container
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              PR Update & Tracking Container <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300">(Integrated Tracker)</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              Modul gabungan pemantauan Purchase Requisition dan Live Tracking Container kapal (On Vessel, SPJM, Hold) dengan format <b>13 kolom terpadu</b>. Kini dilengkapi grafik persebaran Category dan filter kolom ala Excel.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
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

      {/* ─── PANDUAN, TEMPLATE & UPLOAD SECTION ─── */}
      {showHowTo && (
        <GlassCard className="p-6 border-purple-500/30 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" /> Panduan Upload Data PR Update (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo (+ SPJM)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-300 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-white">📌 Pelacakan Status Pengadaan & SPJM:</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Modul ini memantau kolom <i>STATUS Compile</i> seperti <i>ON VESSEL, HOLD DELIVERY, SPJM, READY,</i> atau <i>PLAN LOADING</i> untuk mendeteksi bottleneck per cabang dan minggu ETA.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-white">⚙️ Engine Pembacaan Excel (XLSX & CSV):</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Dilengkapi parsing XLSX ArrayBuffer, Anda dapat mengunggah file Excel (.xlsx) maupun CSV hasil ekstraksi sistem procurement tanpa kendala kerusakan karakter atau format numerik.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unggah File PR Update Anda:</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data PR Update (Excel / CSV)"
              description="Drag & drop file di sini. Sistem otomatis merekap total Qty dan dokumen per status."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Rantai Pasok PR/PO:
          </h2>
          <span className="text-xs text-slate-400 italic hidden sm:inline">Klik tab untuk memproyeksikan percepatan atau delay lead time!</span>
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
                    ? `bg-gradient-to-br ${sc.color} text-white border-transparent ring-2 ring-white/20 shadow-purple-500/25 scale-[1.02]`
                    : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-base tracking-wide flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-purple-400'}`} />
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

      {/* ─── EXECUTIVE KPI SUMMARY CHIPS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total Qty Pesanan PR"
          value={`${totalQty.toLocaleString('id-ID')} Qty`}
          trend="Total Kuantitas Order Masuk"
          icon={<Truck className="w-5 h-5 text-purple-400" />}
          className="border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition"
        />
        <KPICard
          title="Total Dokumen PO/PR"
          value={`${filtered.length.toLocaleString('id-ID')} Dokumen`}
          trend="Berdasarkan Filter Aktif"
          icon={<FileBarChart className="w-5 h-5 text-blue-400" />}
          className="border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition"
        />
        <KPICard
          title="Item Hold Delivery / SPJM"
          value={`${holdCount} Dokumen`}
          trend={holdCount === 0 ? "Aliran Pasokan Lancar" : "Perlu Tindak Lanjut / Cek Port"}
          isAlert={holdCount > 0}
          icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
          className="border-rose-500/20 bg-rose-500/5 hover:border-rose-500/40 transition"
        />
        <KPICard
          title="Variasi Status Compile"
          value={`${statusList.length} Status`}
          trend={statusList.join(', ').slice(0, 25) + (statusList.join(', ').length > 25 ? '...' : '')}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          className="border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition"
        />
      </div>

      {/* ─── FILTER CONTROLS & SELECTION (EXPANDED & OVERFLOW-VISIBLE) ─── */}
      <GlassCard allowOverflow={true} className="p-6 border-slate-800 bg-slate-900/90 backdrop-blur-xl mb-10 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">🏢 Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
              placeholder="Pilih Cabang..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">📦 Filter Kategori / Grup:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
              placeholder="Pilih Kategori..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">🗓️ Filter Week ETA:</label>
            <MultiSelect
              options={etas}
              selected={selectedEta}
              onChange={setSelectedEta}
              selectAllLabel="Semua ETA"
              placeholder="Pilih ETA..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">⚡ Filter Status Compile:</label>
            <MultiSelect
              options={statusCompiles}
              selected={selectedStatusCompile}
              onChange={setSelectedStatusCompile}
              selectAllLabel="Semua Status"
              placeholder="Pilih Status..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 mb-1 block uppercase tracking-wider">📍 Sorot Grafik Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950/90 px-3.5 py-2 text-sm text-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
            >
              <option value="All">🌐 Seluruh Cabang (All)</option>
              {cabangs.filter(c => c !== 'All').map((cab) => (
                <option key={cab} value={cab}>🏢 {cab}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART 1: STATUS COMPILE PER WEEK ETA / CABANG ─── */}
      {((chartViewMode === 'eta' && chartEtaData.length > 0) || (chartViewMode === 'cabang' && chartData.length > 0)) && (
        <GlassCard className="p-6 border-purple-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                1. Grafik Distribusi Status Compile (Total Qty) {chartViewMode === 'eta' ? 'per Week ETA' : 'per Cabang'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Sorotan: <b className="text-cyan-400">{selectedCabangForChart === 'All' ? 'Seluruh Cabang' : selectedCabangForChart}</b> • Skenario Aktif: <b className="text-amber-300">{activeScenario.toUpperCase()}</b> • Mode: <b className="text-emerald-400">{chartViewMode === 'eta' ? 'Persebaran Week ETA' : 'Persebaran Cabang'}</b>
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700">
                <button
                  onClick={() => setChartViewMode('eta')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'eta' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🗓️ Week ETA
                </button>
                <button
                  onClick={() => setChartViewMode('cabang')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'cabang' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🏢 Cabang
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700">
                <span>📊 Menampilkan {statusList.length} status pada {chartViewMode === 'eta' ? `${chartEtaData.length} periode ETA` : `${chartData.length} cabang`}</span>
              </div>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartViewMode === 'eta' ? chartEtaData : chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey={chartViewMode === 'eta' ? 'eta' : 'cabang'} stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#a855f7', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  labelStyle={{ color: '#38bdf8', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                {statusList.map((stat, idx) => (
                  <Bar
                    key={stat}
                    dataKey={stat}
                    name={stat}
                    fill={COLORS[idx % COLORS.length]}
                    stackId="pr"
                    radius={idx === statusList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={55}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── VISUALIZATION CHART 2: STATUS COMPILE PER CATEGORY (SUMBU X CATEGORY) ─── */}
      {chartCategoryData && chartCategoryData.length > 0 && (
        <GlassCard className="p-6 border-sky-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-sky-400" />
                2. Grafik Persebaran Status Compile (Total Qty) per Category
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Grafik bertingkat (Stacked Bar) dengan sumbu X adalah <b className="text-sky-300">Category / Kategori Produk</b> untuk mengidentifikasi kategori apa yang sedang On Vessel, Hold, atau SPJM.
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-xl border border-slate-700">
              <span>🏷️ {chartCategoryData.length} Kategori Produk</span>
            </div>
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartCategoryData} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="category" stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 12, fontWeight: 600 }} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                  labelStyle={{ color: '#a855f7', fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '16px', fontSize: '12px' }} />
                {statusList.map((stat, idx) => (
                  <Bar
                    key={stat}
                    dataKey={stat}
                    name={stat}
                    fill={COLORS[(idx + 2) % COLORS.length]}
                    stackId="cat"
                    radius={idx === statusList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={60}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── TABEL COMPLEMENTARY: ANALISIS KOMPARATIF PR & STATUS COMPILE (CABANG - PO - GRUP - CATEGORY - DESCRIPTION) ─── */}
      <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                Tabel Analisis Komparatif PR & Status Compile ({pivotData.length} Kombinasi Item)
              </h3>
              <button
                onClick={() => setOnlyCrucialStatus(!onlyCrucialStatus)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 border shadow-md ${
                  onlyCrucialStatus
                    ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800/80 text-slate-300 border-slate-600 hover:bg-slate-700'
                }`}
                title="Klik untuk mengubah filter status"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{onlyCrucialStatus ? '🎯 Khusus: On Vessel • Hold • SPJM' : '📋 Semua Status Compile'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Dikelompokkan berdasarkan: <b className="text-amber-300">Cabang ➔ No PO ➔ Grup ➔ Category ➔ Description</b>. Menampilkan kuota dan zonasi tindak lanjut supply chain.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1100px]">
            <thead className="bg-slate-950/90 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-amber-400">No. PO</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-left">Grup & Kategori</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-left">Deskripsi Barang</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-purple-400">Status Compile</th>
                <th className="py-3.5 px-3 border-l border-slate-800 text-cyan-400">Week ETA</th>
                <th className="py-3.5 px-4 border-l border-slate-800 text-emerald-400">Total Qty</th>
                <th className="py-3.5 px-3 border-l border-slate-800 bg-slate-800 text-white">Jumlah Dokumen</th>
                <th className="py-3.5 px-4 border-l border-slate-800">Zonasi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center">
              {pivotData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    Tidak ada item yang memenuhi kriteria filter. Cobalah nonaktifkan filter status krusial atau perluas filter cabang/ETA.
                  </td>
                </tr>
              ) : pivotData.slice(0, 150).map((row: any, idx: number) => {
                const stat = String(row['Status']).toUpperCase();
                const isHold = stat.includes('HOLD') || stat.includes('DELAY');
                const isVessel = stat.includes('VESSEL') || stat.includes('SHIP');
                const isSpjm = stat.includes('SPJM');
                const isReady = stat.includes('READY') || stat.includes('DONE') || stat.includes('EXPEDITED');
                
                return (
                  <tr
                    key={idx}
                    className="hover:bg-slate-800/40 transition cursor-pointer font-medium"
                    onClick={() => setSelectedCabangForChart(row['Cabang'] === selectedCabangForChart ? 'All' : row['Cabang'])}
                  >
                    <td className="py-3 px-4 text-left font-bold text-white align-middle">
                      {row['Cabang']}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-800 font-mono font-bold text-amber-300 align-middle">
                      {row['PO']}
                    </td>
                    <td className="py-3 px-4 border-l border-slate-800 text-left align-middle">
                      <div className="font-semibold text-slate-200 text-xs">{row['Grup']}</div>
                      <div className="text-[11px] text-purple-300 mt-0.5 font-mono">{row['Category']}</div>
                    </td>
                    <td className="py-3 px-4 border-l border-slate-800 text-left text-slate-300 max-w-[220px] truncate align-middle" title={row['Deskripsi']}>
                      {row['Deskripsi']}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-800 font-extrabold text-slate-200 align-middle">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold inline-block ${
                        isHold ? 'bg-rose-950/60 text-rose-300 border border-rose-500/30' :
                        isSpjm ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30' :
                        isVessel ? 'bg-blue-950/60 text-blue-300 border border-blue-500/30' : ''
                      }`}>
                        {row['Status']}
                      </span>
                    </td>
                    <td className="py-3 px-3 border-l border-slate-800 font-mono font-bold text-cyan-300 align-middle">
                      {row['ETA']}
                    </td>
                    <td className="py-3 px-4 border-l border-slate-800 font-mono font-black text-emerald-400 text-base align-middle">
                      {Number(row['Total Qty']).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-800 bg-slate-950/50 font-bold font-mono text-white text-base align-middle">
                      {Number(row['Jumlah Dokumen']).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 border-l border-slate-800 align-middle">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider inline-block ${
                        isHold ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
                        isSpjm ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-sm' :
                        isVessel ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' :
                        isReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                        'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}>
                        {isHold ? '🔴 HOLD (ESKALASI VENDOR)' : isSpjm ? '🟣 SPJM (SIAP KELUAR PORT)' : isVessel ? '🔵 ON VESSEL (PANTAU PORT)' : isReady ? '🟢 READY (SIAP BONGKAR)' : '🟡 IN PROCESS (FOLLOW UP)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pivotData.length > 150 && (
          <p className="text-xs text-slate-400 mt-4 italic text-center">
            *Menampilkan 150 baris pertama dengan Qty terbesar dari total {pivotData.length} kombinasi item...
          </p>
        )}
      </GlassCard>

      {/* ─── TABEL DETAIL PR UPDATE & LIVE TRACKING CONTAINER (DENGAN EXCEL-STYLE COLUMN FILTER) ─── */}
      {parsed && parsed.headers && (
        <GlassCard className="p-6 border-slate-800 bg-slate-900/80 shadow-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-sky-400" />
                  Tabel Detail PR & Live Tracking Container ({displayedDetailRows.length} dari {filtered.length} Dokumen)
                </h3>
                {Object.keys(colFilters).some(k => colFilters[k]?.search || colFilters[k]?.selected?.length > 0) && (
                  <button
                    onClick={() => { setColFilters({}); toast.success('Semua filter kolom dibersihkan!'); }}
                    className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Filter Kolom
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Dilengkapi <b className="text-emerald-400">Filter Kolom ala Excel</b> (klik ikon filter di setiap header untuk cari & pilih data) dan kolom <b className="text-teal-300">Shipping Line / Pelayarań</b>.
              </p>
            </div>

            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-sky-600/20 shrink-0"
            >
              <Download className="w-4 h-4" /> Ekspor Data 13 Kolom ({displayedDetailRows.length} baris)
            </button>
          </div>

          {/* Excel Filter Modal Popover */}
          {activeFilterModalCol && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-slate-200">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-400" /> Filter Kolom: <span className="text-emerald-400">{activeFilterModalCol}</span>
                  </h4>
                  <button onClick={() => setActiveFilterModalCol(null)} className="text-slate-400 hover:text-white transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={modalSearchInput}
                      onChange={e => setModalSearchInput(e.target.value)}
                      placeholder={`Cari teks dalam ${activeFilterModalCol}...`}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    {modalSearchInput && (
                      <button onClick={() => setModalSearchInput('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-white text-xs">
                        Hapus
                      </button>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/50 p-2 space-y-1 text-xs">
                    <div className="text-[11px] font-semibold text-slate-400 mb-1 px-1 flex justify-between">
                      <span>Daftar Nilai Unik ({currentModalUniqueValues.length}):</span>
                    </div>
                    {currentModalUniqueValues.filter(val => !modalSearchInput || val.toLowerCase().includes(modalSearchInput.toLowerCase())).slice(0, 50).map((val, idx) => {
                      const isChecked = !colFilters[activeFilterModalCol]?.selected?.length || colFilters[activeFilterModalCol]?.selected?.includes(val);
                      return (
                        <label
                          key={idx}
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-800/60 cursor-pointer text-slate-300 truncate"
                          onClick={(e) => {
                            e.preventDefault();
                            const currentSel = colFilters[activeFilterModalCol]?.selected?.length
                              ? [...colFilters[activeFilterModalCol].selected]
                              : [...currentModalUniqueValues];
                            const idxPos = currentSel.indexOf(val);
                            if (idxPos > -1) {
                              currentSel.splice(idxPos, 1);
                            } else {
                              currentSel.push(val);
                            }
                            handleApplyModalFilter(currentSel);
                          }}
                        >
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600 bg-slate-900'}`}>
                            {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <span className="truncate">{val}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setColFilters(prev => {
                          const copy = { ...prev };
                          delete copy[activeFilterModalCol];
                          return copy;
                        });
                        setActiveFilterModalCol(null);
                        setModalSearchInput('');
                        toast.success(`Filter kolom ${activeFilterModalCol} dibersihkan.`);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                    >
                      Reset Kolom Ini
                    </button>
                    <button
                      onClick={() => handleApplyModalFilter(colFilters[activeFilterModalCol]?.selected || [])}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20"
                    >
                      Terapkan Filter
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[580px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1300px]">
              <thead className="bg-slate-950/95 text-slate-300 uppercase font-bold sticky top-0 z-20 shadow-md">
                <tr className="border-b border-slate-800 text-[11px] tracking-wider text-center">
                  {parsed.headers.map((h) => {
                    const isFiltered = colFilters[h]?.search || (colFilters[h]?.selected && colFilters[h]?.selected.length > 0);
                    const isShippingLine = h.toLowerCase().includes('shipping') || h.toLowerCase().includes('carrier') || h.toLowerCase().includes('pelayaran');
                    const isContainer = h.toLowerCase().includes('container') || h.toLowerCase().includes('kontainer');
                    
                    return (
                      <th
                        key={h}
                        className={`py-3 px-3 border-l border-slate-800 whitespace-nowrap align-middle ${
                          isShippingLine ? 'text-teal-300 bg-teal-950/30' : isContainer ? 'text-sky-300 bg-sky-950/30' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{h}</span>
                          <button
                            onClick={() => {
                              setActiveFilterModalCol(h);
                              setModalSearchInput(colFilters[h]?.search || '');
                            }}
                            className={`p-1 rounded transition ${
                              isFiltered ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                            title={`Filter Kolom ala Excel: ${h}`}
                          >
                            <Filter className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {isFiltered && (
                          <div className="text-[9px] text-emerald-300 font-normal normal-case italic mt-0.5 truncate max-w-[100px]">
                            {colFilters[h]?.search ? `"${colFilters[h].search}"` : `Filteraktif`}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="py-3 px-4 border-l border-slate-800 text-sky-400 bg-sky-950/50 align-middle">🛰️ Action Track</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center font-medium">
                {displayedDetailRows.length === 0 ? (
                  <tr>
                    <td colSpan={parsed.headers.length + 1} className="py-12 text-center text-slate-400 font-medium">
                      Tidak ada baris yang cocok dengan kombinasi filter kolom aktif. <span className="text-rose-400 underline cursor-pointer" onClick={() => setColFilters({})}>Klik di sini untuk mereset filter</span>.
                    </td>
                  </tr>
                ) : displayedDetailRows.slice(0, 150).map((row, idx) => {
                  const contVal = colContainer ? String(row[colContainer] || '') : '';
                  const carrierVal = colCarrier ? String(row[colCarrier] || '') : '';
                  const hasCont = contVal && contVal.trim() !== '' && contVal.trim() !== '-' && contVal.trim() !== '0' && contVal.toUpperCase() !== 'N/A';
                  const trackInfo = hasCont ? getDirectTrackingUrl(contVal.trim(), carrierVal.trim()) : null;

                  return (
                    <tr key={idx} className="hover:bg-slate-800/50 transition">
                      {parsed.headers.map((h) => {
                        let val = row[h];
                        const isShippingLine = h.toLowerCase().includes('shipping') || h.toLowerCase().includes('carrier') || h.toLowerCase().includes('pelayaran');
                        
                        if (colQty && h === colQty && val != null && val !== '') {
                          val = Math.round(Number(String(val).replace(/[^0-9.-]+/g, '')) || 0).toLocaleString('id-ID');
                        } else if (typeof val === 'number') {
                          val = val.toLocaleString('id-ID');
                        }
                        return (
                          <td
                            key={h}
                            className={`py-2.5 px-3 border-l border-slate-800 whitespace-nowrap ${
                              h === colContainer && hasCont ? 'font-mono font-bold text-sky-300' : 
                              isShippingLine ? 'font-semibold text-teal-300' : ''
                            }`}
                          >
                            {h === colContainer && hasCont && trackInfo && trackInfo.url ? (
                              <a href={trackInfo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline hover:text-white transition group font-bold" title={`Lacak ${val} di ${trackInfo.carrier}`}>
                                <span>{val}</span>
                                <ExternalLink className="w-3 h-3 text-sky-400 group-hover:text-white inline ml-0.5 shrink-0" />
                              </a>
                            ) : (val !== undefined && val !== null && val !== '' ? val : '-')}
                          </td>
                        );
                      })}
                      <td className="py-2 px-4 border-l border-slate-800 bg-slate-950/30 whitespace-nowrap">
                        {hasCont && trackInfo && trackInfo.url ? (
                          <a
                            href={trackInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 hover:text-white border border-sky-500/40 font-bold transition shadow-sm"
                            title={`Lacak ${contVal} via ${trackInfo.carrier}`}
                          >
                            <span>Lacak ({trackInfo.carrier.split(' ')[0]})</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Belum Ada Cont</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {displayedDetailRows.length > 150 && (
            <p className="text-xs text-slate-400 mt-4 italic text-center">
              * Menampilkan 150 baris pertama dari total {displayedDetailRows.length} dokumen pesanan yang tersaring...
            </p>
          )}
        </GlassCard>
      )}
    </div>
  );
}
