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
  TrendingUp, Truck, AlertCircle, ExternalLink, Globe, Filter, Search, X, Check, RefreshCw,
  Package, Timer, ShieldAlert
, Cloud } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Line
} from 'recharts';
import { get, set } from 'idb-keyval';
import { supabase } from '@/lib/supabase';
import { parseDynamicCSV, findColumn, ParsedData } from '@/lib/csvParser';
import { getStandardFilename } from '@/utils/export';
import { ExportHtmlButton } from '@/components/ui/ExportHtmlButton';
import * as XLSX from 'xlsx';

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

function parseEtaRank(etaStr: string): number {
  if (!etaStr || etaStr.toLowerCase().includes('unscheduled') || etaStr.toLowerCase().includes('tanpa')) return -1;
  const lower = etaStr.toLowerCase();
  const months: Record<string, number> = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'mei': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'agu': 8, 'sep': 9, 'oct': 10, 'okt': 10, 'nov': 11, 'dec': 12, 'des': 12
  };
  let monthVal = 0;
  for (const [key, val] of Object.entries(months)) {
    if (lower.includes(key)) {
      monthVal = val;
      break;
    }
  }
  let weekVal = 0;
  const matchW = lower.match(/w(eek)?\s*(\d+)/i) || lower.match(/minggu\s*(\d+)/i) || lower.match(/ke\s*(\d+)/i);
  if (matchW && matchW[2]) {
    weekVal = parseInt(matchW[2], 10);
  }
  if (monthVal > 0) {
    return monthVal * 100 + weekVal;
  }
  return 9999 + weekVal;
}

const CustomStackedTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const validItems = payload.filter((item: any) => Number(item.value || 0) > 0);
    const totalQty = validItems.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0);

    return (
      <div className="bg-[#090e1a] text-white p-3.5 rounded-xl border-2 border-purple-500 shadow-[0_15px_60px_rgba(0,0,0,1)] z-[999999] opacity-100 max-h-[300px] overflow-y-auto max-w-[340px] pointer-events-none select-none backdrop-blur-none" style={{ backgroundColor: '#090e1a', opacity: 1, zIndex: 999999 }}>
        <div className="border-b border-slate-200/80 pb-2 mb-2 sticky -top-3.5 bg-[#090e1a] pt-1 z-10 flex items-center justify-between gap-3">
          <span className="text-sky-400 font-extrabold text-sm tracking-wide">{label}</span>
          <span className="text-xs px-2 py-0.5 bg-purple-950/90 border border-purple-500/50 rounded-md font-bold text-purple-300 shadow-sm">
            Total: {totalQty.toLocaleString('id-ID')} Qty
          </span>
        </div>
        {validItems.length === 0 ? (
          <div className="text-xs text-slate-400 font-medium py-2">Tidak ada data kuantitas (0 Qty)</div>
        ) : (
          <div className="space-y-1.5 text-xs">
            {validItems.map((entry: any, index: number) => (
              <div key={index} className="flex items-start justify-between gap-3 py-1 border-b border-slate-700/60 last:border-0 font-medium">
                <span className="flex items-center gap-2 text-white flex-1 min-w-0">
                  <span className="w-3 h-3 rounded-full inline-block shrink-0 border border-slate-600/50 shadow-sm mt-0.5" style={{ backgroundColor: entry.color }}></span>
                  <span className="whitespace-normal leading-tight font-semibold text-white" title={entry.name}>{entry.name}</span>
                </span>
                <span className="font-extrabold text-slate-900 shrink-0 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {Number(entry.value).toLocaleString('id-ID')} Qty
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
};

const CustomContainerTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const poList: string[] = data.poList || [];
    return (
      <div className="bg-[#090e1a] text-slate-900 p-4 rounded-xl border-2 border-cyan-500 shadow-[0_15px_60px_rgba(0,182,212,0.35)] z-[999999] max-w-[340px] pointer-events-none select-none">
        <div className="border-b border-slate-200/80 pb-2 mb-2 flex items-center justify-between gap-3">
          <span className="text-cyan-400 font-extrabold text-sm tracking-wide">🏢 {label}</span>
          <span className="text-xs px-2 py-0.5 bg-cyan-950/90 border border-cyan-500/50 rounded-md font-bold text-cyan-300 shadow-sm">
            {data["Jumlah Container"]} Container
          </span>
        </div>
        <div className="text-xs text-slate-300 font-medium space-y-2">
          <div className="flex items-center justify-between bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-700">
            <span className="text-slate-200 font-semibold">Total Container (Distinct PO):</span>
            <span className="font-extrabold text-cyan-300 text-sm bg-cyan-500/20 px-2.5 py-0.5 rounded border border-cyan-500/40">
              {data["Jumlah Container"]} Unit
            </span>
          </div>
          {poList.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-300 mb-1">Daftar No. PO di Cabang Ini:</div>
              <div className="max-h-[140px] overflow-y-auto bg-slate-800/80 p-2 rounded-lg border border-slate-700 space-y-1 font-mono text-[11px] text-amber-300">
                {poList.slice(0, 10).map((po, i) => (
                  <div key={i} className="truncate">• {po}</div>
                ))}
                {poList.length > 10 && (
                  <div className="text-slate-400 font-sans italic text-[10px]">...+ {poList.length - 10} PO lainnya</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

function parseDateVal(val: any): Date | null {
  if (val === undefined || val === null || val === '' || val === '-') return null;
  const str = String(val).trim();
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    const parts = str.split('T')[0].split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setHours(0, 0, 0, 0);
    return !isNaN(d.getTime()) ? d : null;
  }
  const matchIndo = str.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
  if (matchIndo) {
    const d = new Date(Number(matchIndo[3]), Number(matchIndo[2]) - 1, Number(matchIndo[1]));
    d.setHours(0, 0, 0, 0);
    return !isNaN(d.getTime()) ? d : null;
  }
  const dFallback = new Date(str);
  if (!isNaN(dFallback.getTime())) {
    dFallback.setHours(0, 0, 0, 0);
    return dFallback;
  }
  return null;
}

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

  // 1. Shipping Line Aktif (Pelacakan Langsung)
  if (carrier.includes("anl")) return { url: "https://www.anl.com.au/tracking/", carrier: "ANL" };
  if (carrier.includes("apl")) return { url: "https://www.apl.com/tracking/", carrier: "APL" };
  if (carrier.includes("cma") || carrier.includes("cgm")) return { url: "https://www.cma-cgm.com/ebusiness/tracking", carrier: "CMA CGM" };
  if (carrier.includes("cosco") || carrier.includes("china shipping") || carrier.includes("cscl")) return { url: "https://lines.coscoshipping.com/home/Services/tracking", carrier: carrier.includes("china") ? "China Shipping (COSCO)" : "COSCO" };
  if (carrier.includes("evergreen")) return { url: "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do", carrier: "EVERGREEN" };
  if (carrier.includes("hapag") || carrier.includes("lloyd") || carrier.includes("llyod") || carrier.includes("uasc")) return { url: "https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html", carrier: carrier.includes("uasc") ? "UASC (Hapag-Lloyd)" : "HAPAG-LLOYD" };
  if (carrier.includes("hmm") || carrier.includes("hyundai")) return { url: "https://www.hmm21.com/", carrier: "HMM (Track & Trace)" };
  if (carrier.includes("interasia") || carrier.includes("ial")) return { url: "https://www.interasia.cc/", carrier: "Interasia" };
  if (carrier.includes("kmtc")) return { url: "http://www.ekmtc.com/", carrier: "KMTC" };
  if (carrier.includes("maersk")) return { url: "https://www.maersk.com/tracking/", carrier: "MAERSK" };
  if (carrier.includes("meratus")) return { url: "https://www.meratusline.com/", carrier: "Meratus Line" };
  if (carrier.includes("msc")) return { url: "https://www.msc.com/en/track-a-shipment", carrier: "MSC" };
  if (carrier.includes("one") || carrier.includes("ocean network") || carrier.includes("k-line") || carrier.includes("k line") || carrier.includes("kline") || carrier.includes("mol") || carrier.includes("nyk")) {
    let label = "ONE (Ocean Network Express)";
    if (carrier.includes("k-line") || carrier.includes("k line") || carrier.includes("kline")) label = "K-LINE (ONE)";
    else if (carrier.includes("mol")) label = "MOL (ONE)";
    return { url: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking", carrier: label };
  }
  if (carrier.includes("oocl")) return { url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx", carrier: "OOCL" };
  if (carrier.includes("pil") || carrier.includes("pacific int") || carrier.includes("pilship")) return { url: "https://www.pilship.com/en-our-track-and-trace/120.html", carrier: "PilShip (Pacific Int'l Lines)" };
  if (carrier.includes("sinokor")) return { url: "http://www.sinokor.co.kr/", carrier: "SINOKOR" };
  if (carrier.includes("wan hai") || carrier.includes("wanhai")) return { url: "https://www.wanhai.com/", carrier: "Wan Hai (Cargo Tracking)" };
  if (carrier.includes("yang ming") || carrier.includes("yangming")) return { url: "https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx", carrier: "YANG MING" };

  // Domestic & Other Shipping Lines
  if (carrier.includes("temas") || carrier.includes("kliktemas")) return { url: "https://apps.kliktemas.com/", carrier: "Temas Line (KlikTemas)" };
  if (carrier.includes("spil") || carrier.includes("salam pacific") || carrier.includes("myspil")) return { url: "https://www.myspil.com/", carrier: "SPIL (mySPIL)" };
  if (carrier.includes("samudera")) return { url: "https://samuderaconnect.com/", carrier: "Samudera Indonesia" };
  if (carrier.includes("tanto")) return { url: "https://www.tantonet.com/", carrier: "Tanto Intim Line" };
  if (carrier.includes("zim")) return { url: `https://www.zim.com/tools/track-a-shipment?consignmentNumber=${no}`, carrier: "ZIM" };

  // 3. Container Leasing Companies (Perusahaan Penyewaan - Direct Official Website)
  if (carrier.includes("seaco") || carrier.includes("seacube")) return { url: "https://www.seacoglobal.com/equipment/unit-enquiry/", carrier: "Seaco (Unit Enquiry)" };
  if (carrier.includes("triton")) return { url: "https://www.tritoncontainer.com/unit-inquiry", carrier: "TRITON" };
  if (carrier.includes("cai")) return { url: "https://www.caiintl.com/", carrier: "CAI International" };
  if (carrier.includes("beacon")) return { url: "https://www.beaconintermodal.com/", carrier: "Beacon Intermodal" };
  if (carrier.includes("florens")) return { url: "http://www.florens.com/", carrier: "Florens" };
  if (carrier.includes("textainer")) return { url: "https://www.textainer.com/equipment/unit-inquiry", carrier: "Textainer" };
  if (carrier.includes("ues")) return { url: "https://www.ues-int.com/", carrier: "UES International" };
  if (carrier.includes("leasing")) return { url: `https://www.searates.com/container/tracking/?number=${no}`, carrier: carrierName || "Container Leasing" };

  // Default Universal Container Tracking
  return { url: `https://www.searates.com/container/tracking/?number=${no}`, carrier: carrierName && carrierName !== '-' ? carrierName : "Container Tracking" };
}

const syncToTrackingContainer = async (parsed: ParsedData) => {
  const colCont = findColumn(parsed.headers, ['no container', 'nocontainer', 'no. container', 'no_kontainer', 'no kontainer', 'container', 'nomor container']);
  const colBranch = findColumn(parsed.headers, ['branch name', 'branch_name', 'branchname', 'branch', 'cabang', 'cab', 'regional', 'region']);
  const colStatus = findColumn(parsed.headers, ['status compile', 'status', 'state']);
  const colEta = findColumn(parsed.headers, ['tanggal eta', 'week eta', 'eta']);
  const colDesc = findColumn(parsed.headers, ['description', 'deskripsi', 'grup', 'nama barang']);
  const colPo = findColumn(parsed.headers, ['po', 'po no', 'no po', 'nomor po']);
  const colPr = findColumn(parsed.headers, ['nopr', 'no pr', 'pr no', 'pr', 'nomor pr']);
  const colBl = findColumn(parsed.headers, ['bill of lading', 'no bl', 'no. bl', 'no_bl', 'nomor bl', 'b/l', 'no b/l', 'bl no', 'bl_no', 'no booking', 'booking', 'nomor booking', 'bl']);
  const colCarrier = findColumn(parsed.headers, ['shipping line', 'shipping_line', 'shippingline', 'pelayaran', 'carrier', 'maskapai', 'shipping', 'line']);

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
      
      const isOverdueTarget = (stat === 'SPJM' || stat === 'HOLD DELIVERY' || stat === 'ON VESSEL') && ((idx + cIdx) % 2 === 0 || cIdx <= 2);
      const dayOffset = isOverdueTarget ? -((idx * 3 + cIdx * 2) % 25 + 3) : ((idx + 1) * 4 + (cIdx % 3));
      const tglEta = new Date(Date.now() + dayOffset * 86400000).toISOString().slice(0, 10);
      
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
        'Tanggal ETA': tglEta,
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
    processed_at: new Date().toISOString(),
    sheetNames: ['PR Update', 'Lead Time'],
    sheets: {
      'PR Update': {
        headers: ['PO', 'NoPR', 'Branch Name', 'GRUP', 'Category', 'Description', 'STATUS Compile', 'No Container', 'bl', 'Shipping Line', 'Tanggal ETA', 'Week ETA', 'Qty'],
        targetColumns: [{ index: 12, name: 'Qty' }],
        data: data
      },
      'Lead Time': {
        headers: ['YEAR ETA', 'MONTH ETA', 'REGION RCPT', 'BRANCH RCPT BRANCH', 'CONTAINER', 'TGL SPPB', 'TGL ETA BY PIB', 'TOR DATE', 'DAYS SPPB - ETA', 'DAYS BONGKAR - SPPB - 1', 'TOTAL DAYS'],
        targetColumns: [],
        data: [
          { 'YEAR ETA': 2026, 'MONTH ETA': '08. Aug', 'REGION RCPT': 'REG-1', 'BRANCH RCPT BRANCH': 'Surabaya', 'CONTAINER': 'MRTU1234567', 'TGL SPPB': '2026-08-01', 'TGL ETA BY PIB': '2026-07-25', 'TOR DATE': '2026-08-05', 'DAYS SPPB - ETA': 7, 'DAYS BONGKAR - SPPB - 1': 3, 'TOTAL DAYS': 10 },
          { 'YEAR ETA': 2026, 'MONTH ETA': '08. Aug', 'REGION RCPT': 'REG-2', 'BRANCH RCPT BRANCH': 'Jakarta', 'CONTAINER': 'TEMU7654321', 'TGL SPPB': '2026-08-02', 'TGL ETA BY PIB': '2026-07-28', 'TOR DATE': '2026-08-06', 'DAYS SPPB - ETA': 5, 'DAYS BONGKAR - SPPB - 1': 3, 'TOTAL DAYS': 8 },
          { 'YEAR ETA': 2026, 'MONTH ETA': '08. Aug', 'REGION RCPT': 'REG-3', 'BRANCH RCPT BRANCH': 'Bandung', 'CONTAINER': 'SPIL8899001', 'TGL SPPB': '2026-08-03', 'TGL ETA BY PIB': '2026-07-20', 'TOR DATE': '2026-08-10', 'DAYS SPPB - ETA': 14, 'DAYS BONGKAR - SPPB - 1': 6, 'TOTAL DAYS': 20 },
        ]
      }
    }
  };

  syncToTrackingContainer(parsedDemo);
  return parsedDemo;
}

export default function PRUpdatePage() {
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHowTo, setShowHowTo] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'pr_update' | 'lead_time'>('pr_update');
  const [activeScenario, setActiveScenario] = useState<ScenarioType>('current');
  const [selectedCabangForChart, setSelectedCabangForChart] = useState<string>('All');
  
  // Filter khusus 3 status krusial pada tabel komparasi
  const [onlyCrucialStatus, setOnlyCrucialStatus] = useState<boolean>(true);

  // Filter states
  const [selectedCabang, setSelectedCabang] = useState<string[]>(['All']);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['All']);
  const [selectedEta, setSelectedEta] = useState<string[]>(['All']);
  const [selectedStatusCompile, setSelectedStatusCompile] = useState<string[]>(['All']);
  const [chartViewMode, setChartViewMode] = useState<'eta' | 'cabang' | 'container'>('eta');

  
  const leadTimeData = useMemo(() => {
    if (!parsed || !parsed.sheets) return null;
    const ltKey = Object.keys(parsed.sheets).find(k => k.toLowerCase().includes('lead time'));
    if (!ltKey) return null;

    const data = parsed.sheets[ltKey].data || [];
    if (data.length === 0) return null;

    let totalDaysSum = 0;
    let bongkarDaysSum = 0;
    let sppbEtaDaysSum = 0;
    let countTotal = 0;
    let countBongkar = 0;
    let countSppbEta = 0;

    const trendByMonth: Record<string, { totalDays: number, sppbEta: number, bongkar: number, countTotal: number, countSppbEta: number, countBongkar: number }> = {};
    const branchComparison: Record<string, { totalDays: number, count: number }> = {};

    data.forEach(r => {
      const td = Number(r['TOTAL DAYS']);
      if (!isNaN(td)) {
        totalDaysSum += td;
        countTotal++;
      }
      
      const bongkar = Number(r['DAYS BONGKAR - SPPB - 1']);
      if (!isNaN(bongkar)) {
        bongkarDaysSum += bongkar;
        countBongkar++;
      }
      
      const sppbEta = Number(r['DAYS SPPB - ETA']);
      if (!isNaN(sppbEta)) {
        sppbEtaDaysSum += sppbEta;
        countSppbEta++;
      }

      const month = String(r['YEAR ETA/MONTH ETA'] || r['MONTH ETA'] || 'Unknown');
      if (!trendByMonth[month]) trendByMonth[month] = { totalDays: 0, sppbEta: 0, bongkar: 0, countTotal: 0, countSppbEta: 0, countBongkar: 0 };
      if (!isNaN(td)) {
        trendByMonth[month].totalDays += td;
        trendByMonth[month].countTotal++;
      }
      if (!isNaN(sppbEta)) {
        trendByMonth[month].sppbEta += sppbEta;
        trendByMonth[month].countSppbEta++;
      }
      if (!isNaN(bongkar)) {
        trendByMonth[month].bongkar += bongkar;
        trendByMonth[month].countBongkar++;
      }

      const branch = String(r['BRANCH RCPT BRANCH'] || 'Unknown');
      if (!branchComparison[branch]) branchComparison[branch] = { totalDays: 0, count: 0 };
      if (!isNaN(td)) {
        branchComparison[branch].totalDays += td;
        branchComparison[branch].count++;
      }
    });

    const urgentList: any[] = [];
    data.forEach(r => {
      const waitDays = Number(r['TOTAL DAYS']) || 0;
      if (waitDays > 0) {
        urgentList.push({
          container: r['CONTAINER'] || '-',
          region: r['REGION RCPT'] || '-',
          branch: r['BRANCH RCPT BRANCH'] || '-',
          waitDays: waitDays
        });
      }
    });
    urgentList.sort((a, b) => b.waitDays - a.waitDays);

    return {
      avgTotalDays: countTotal ? (totalDaysSum / countTotal).toFixed(1) : '0',
      avgBongkarDays: countBongkar ? (bongkarDaysSum / countBongkar).toFixed(1) : '0',
      avgSppbEtaDays: countSppbEta ? (sppbEtaDaysSum / countSppbEta).toFixed(1) : '0',
      trendData: Object.entries(trendByMonth).map(([k, v]) => ({
        month: k,
        avgDays: v.countTotal ? Math.round((v.totalDays / v.countTotal) * 10) / 10 : 0,
        avgSppbEta: v.countSppbEta ? Math.round((v.sppbEta / v.countSppbEta) * 10) / 10 : 0,
        avgBongkar: v.countBongkar ? Math.round((v.bongkar / v.countBongkar) * 10) / 10 : 0
      })).sort((a, b) => a.month.localeCompare(b.month)),
      branchData: Object.entries(branchComparison).map(([k, v]) => ({
        branch: k,
        avgDays: v.count ? Math.round((v.totalDays / v.count) * 10) / 10 : 0
      })).sort((a, b) => b.avgDays - a.avgDays),
      urgentContainers: urgentList.slice(0, 10),
      raw: data
    };
  }, [parsed]);


  // Excel-like column filters for Table Detail
  const [colFilters, setColFilters] = useState<Record<string, { search: string; selected: string[] }>>({});
  const [activeFilterModalCol, setActiveFilterModalCol] = useState<string | null>(null);
  const [modalSearchInput, setModalSearchInput] = useState<string>('');

  useEffect(() => {
    const fetchGlobalData = async () => {
      const { data, error } = await supabase
        .from('processed_results')
        .select('*')
        .eq('module', 'pr_update')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data && data.result_json) {
        const parsedData = JSON.parse(data.result_json);
        setParsed(parsedData);
      } else {
        get('last_pr_update').then(saved => {
          if (saved && saved.data && saved.data.length > 0) {
            setParsed(saved);
          } else {
            handleGenerateDemo();
          }
        }).catch(err => {
          console.warn('Failed to load state from IndexDB', err);
          handleGenerateDemo();
        });
      }
    };

    fetchGlobalData();

    const channel = supabase
      .channel('pr_update_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'processed_results', filter: "module=eq.pr_update" },
        (payload) => {
          const timestampStr = sessionStorage.getItem('last_processed_at_pr_update');
          if (payload.new && payload.new.result_json) {
            const parsedData = JSON.parse(payload.new.result_json);
            if (!timestampStr || parsedData.processed_at !== timestampStr) {
              setParsed(parsedData);
              toast.success('🔄 Pembaruan data dari pengguna lain diterima!', {
                icon: '🔄',
                style: { background: '#10B981', color: '#fff' },
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSaveToGlobal = async () => {
    if (!parsed) {
      toast.error("Tidak ada data untuk disimpan.");
      return;
    }
    toast.loading('Menyimpan ke Global DB...', { id: 'save-global' });
    const timestamp = new Date().toISOString();
    const dataCopy = { ...parsed, processed_at: timestamp };
        const { error } = 
    if (error) {
      toast.error('Gagal menyimpan ke Global DB', { id: 'save-global' });
    } else {
      toast.success('Berhasil disimpan ke Global DB!', { id: 'save-global' });
    }
  };

  const handleGenerateDemo = () => {
    const demo = generateDemoPRUpdate();
    setParsed(demo);
    setColFilters({});
    toast.success('🎉 Data Demo PR Update & Status SPJM Berhasil Dimuat!');
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: PR Update
    const ws1Data = [
      ['PO','NoPR','Branch Name','GRUP','Category','Description','STATUS Compile','No Container','bl','Shipping Line','Tanggal ETA','Week ETA','Qty'],
      ['PO-2026-101','PR-08-01','Surabaya','Minyak Goreng Premium','Food Basic','Minyak Goreng 2L','ON VESSEL','MRTU1234567','BL-MRT-9988','Meratus Line','2026-08-10','Week 2 Agu',2500],
      ['PO-2026-102','PR-08-02','Jakarta','Beras Setra Ramos','Groceries Premium','Beras Premium 5kg','SPJM','TEMU7654321','BL-TMS-7766','Temas Line','2026-08-15','Week 3 Agu',1800],
      ['PO-2026-103','PR-08-03','Bandung','Gula Pasir Kristal','Baking Ingredients','Gula Kristal 1kg','HOLD DELIVERY','-','-','-','2026-08-18','Week 3 Agu',3200]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "PR Update");

    // Sheet 2: Lead Time
    const ws2Data = [
      ['YEAR ETA','MONTH ETA','REGION RCPT','BRANCH RCPT BRANCH','CONTAINER','TGL SPPB','TGL ETA BY PIB','TOR DATE','DAYS SPPB - ETA','DAYS BONGKAR - SPPB - 1','TOTAL DAYS'],
      [2026,'08. Aug','REG-1','Surabaya','MRTU1234567','2026-08-01','2026-07-25','2026-08-05',7,3,10],
      [2026,'08. Aug','REG-2','Jakarta','TEMU7654321','2026-08-02','2026-07-28','2026-08-06',5,3,8],
      [2026,'08. Aug','REG-3','Bandung','SPIL8899001','2026-08-03','2026-07-20','2026-08-10',14,6,20]
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "Lead Time");

    XLSX.writeFile(wb, "template_pr_update_leadtime.xlsx");
    toast.success('📁 Template Excel PR Update & Lead Time Berhasil Diunduh');
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
  const colCabang = useMemo(() => parsed ? findColumn(parsed.headers, ['branch name', 'branch_name', 'branchname', 'branch', 'cabang', 'cab', 'regional', 'region']) : undefined, [parsed]);
  const colGrup = useMemo(() => parsed ? findColumn(parsed.headers, ['grup', 'group', 'divisi', 'grup barang']) : undefined, [parsed]);
  const colCategory = useMemo(() => parsed ? findColumn(parsed.headers, ['category', 'kategori', 'item category', 'kategori produk']) : undefined, [parsed]);
  const colPo = useMemo(() => parsed ? findColumn(parsed.headers, ['po', 'no po', 'nomor po', 'po no', 'no_po']) : undefined, [parsed]);
  const colPr = useMemo(() => parsed ? findColumn(parsed.headers, ['nopr', 'no pr', 'pr no', 'pr', 'nomor pr', 'no_pr']) : undefined, [parsed]);
  const colDesc = useMemo(() => parsed ? findColumn(parsed.headers, ['description', 'deskripsi', 'nama barang', 'item description', 'nama produk']) : undefined, [parsed]);
  const colEta = useMemo(() => parsed ? findColumn(parsed.headers, ['week eta', 'eta fix', 'tanggal eta', 'eta_port', 'eta']) : undefined, [parsed]);
  const colStatus = useMemo(() => parsed ? findColumn(parsed.headers, ['status compile', 'status', 'state', 'posisi']) : undefined, [parsed]);
  const colQty = useMemo(() => parsed ? findColumn(parsed.headers, ['qty', 'quantity', 'jumlah', 'qty order', 'kuantitas']) : undefined, [parsed]);
  const colContainer = useMemo(() => parsed ? findColumn(parsed.headers, ['no container', 'nocontainer', 'no. container', 'no_kontainer', 'no kontainer', 'container', 'nomor container']) : undefined, [parsed]);
  const colBl = useMemo(() => parsed ? findColumn(parsed.headers, ['bill of lading', 'no bl', 'no. bl', 'no_bl', 'nomor bl', 'b/l', 'no b/l', 'bl no', 'bl_no', 'no booking', 'booking', 'nomor booking', 'bl']) : undefined, [parsed]);
  const colCarrier = useMemo(() => parsed ? findColumn(parsed.headers, ['shipping line', 'shipping_line', 'shippingline', 'pelayaran', 'carrier', 'maskapai', 'shipping', 'line']) : undefined, [parsed]);

  const colTanggalEta = useMemo(() => {
    if (!parsed) return undefined;
    const explicit = findColumn(parsed.headers, ['tanggal eta', 'tgl eta', 'eta date', 'eta_date', 'tanggal_eta', 'tgl_eta', 'eta fix', 'eta_port']);
    if (explicit) return explicit;
    return parsed.headers.find(h => h.toLowerCase().includes('eta') && !h.toLowerCase().includes('week') && !h.toLowerCase().includes('minggu'));
  }, [parsed]);

  const rawDataProcessingDate = useMemo(() => {
    if (parsed?.processed_at) {
      const d = parseDateVal(parsed.processed_at);
      if (d) return d;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, [parsed]);

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

  // Insight PO Overdue ETA (SPJM, Hold Delivery, On Vessel)
  const overdueInsights = useMemo(() => {
    if (!parsed || filtered.length === 0 || !colTanggalEta) return [];
    const results: any[] = [];

    for (const row of filtered) {
      const stat = colStatus ? (String(row[colStatus] || '').trim().toUpperCase()) : '';
      const isTargetStatus = stat.includes('SPJM') || stat.includes('HOLD') || stat.includes('VESSEL') || stat.includes('DELAY') || stat.includes('SHIP');
      if (!isTargetStatus) continue;

      const rawEta = row[colTanggalEta];
      const etaDate = parseDateVal(rawEta);
      if (!etaDate) continue;

      const diffMillis = rawDataProcessingDate.getTime() - etaDate.getTime();
      const diffDays = Math.floor(diffMillis / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        const q = colQty && row[colQty] != null ? Math.round(Number(String(row[colQty]).replace(/[^0-9.-]+/g, '')) || 0) : 0;
        const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'Unknown';
        const po = colPo ? (row[colPo] || '-') : '-';
        const desc = colDesc ? (row[colDesc] || '-') : '-';
        const grup = colGrup ? (row[colGrup] || '-') : '-';
        const cat = colCategory ? (row[colCategory] || '-') : '-';
        const cont = colContainer ? (row[colContainer] || '-') : '-';
        const carrier = colCarrier ? (row[colCarrier] || '-') : '-';
        
        let statusCategory = 'VESSEL';
        if (stat.includes('SPJM')) statusCategory = 'SPJM';
        else if (stat.includes('HOLD') || stat.includes('DELAY')) statusCategory = 'HOLD';
        
        results.push({
          cabang: cbg,
          po: po,
          deskripsi: desc,
          grup: grup,
          category: cat,
          status: stat,
          statusCategory,
          etaRaw: rawEta,
          etaFormatted: etaDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
          overdueDays: diffDays,
          qty: q,
          container: cont,
          carrier: carrier
        });
      }
    }
    return results.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [parsed, filtered, colTanggalEta, colStatus, colQty, colCabang, colPo, colDesc, colGrup, colCategory, colContainer, colCarrier, rawDataProcessingDate]);

  // Chart data: Grouped by Cabang, Week ETA & by Category, Count by STATUS Compile and Category
  const { chartData, chartEtaData, chartContainerData, totalContainers, chartCategoryData, statusList, categoryList, totalQty, holdCount } = useMemo(() => {
    if (!parsed || filtered.length === 0) return { chartData: [], chartEtaData: [], chartContainerData: [], totalContainers: 0, chartCategoryData: [], statusList: [], categoryList: [], totalQty: 0, holdCount: 0 };
    const mapCabang: Record<string, any> = {};
    const mapEta: Record<string, any> = {};
    const mapCat: Record<string, any> = {};
    const statuses = new Set<string>();
    const categories = new Set<string>();
    let qtySum = 0;
    let holdSum = 0;

    const colCatUse = colCategory || colGrup;

    for (const row of filtered) {
      const cbg = colCabang ? (row[colCabang] || 'Unknown') : 'All';
      const cat = colCatUse ? (String(row[colCatUse] || 'Umum / No Kategori').trim()) : 'Umum';
      const eta = colEta ? (row[colEta] || 'Unscheduled / Tanpa ETA') : 'Unscheduled';
      
      if (selectedCabangForChart !== 'All' && cbg !== selectedCabangForChart) continue;

      const stat = colStatus ? (String(row[colStatus] || 'Unknown').toUpperCase()) : 'TOTAL';
      const q = colQty && row[colQty] != null ? Math.round(Number(String(row[colQty]).replace(/[^0-9.-]+/g, '')) || 0) : 1;
      
      statuses.add(stat);
      categories.add(cat);
      qtySum += q;
      if (stat.includes('HOLD') || stat.includes('DELAY') || stat.includes('TUNDA')) {
        holdSum += 1;
      }

      // Group by Cabang
      if (!mapCabang[cbg]) {
        mapCabang[cbg] = { cabang: cbg, distinctPOs: new Set<string>() };
      }
      mapCabang[cbg][stat] = Math.round((mapCabang[cbg][stat] || 0) + q);
      mapCabang[cbg][cat] = Math.round((mapCabang[cbg][cat] || 0) + q);

      // Record distinct PO per Cabang
      const poVal = colPo && row[colPo] ? String(row[colPo]).trim() : '';
      if (poVal && poVal !== '-' && poVal !== '0' && poVal.toUpperCase() !== 'N/A') {
        mapCabang[cbg].distinctPOs.add(poVal);
      }

      // Group by Week ETA
      if (!mapEta[eta]) {
        mapEta[eta] = { eta: eta };
      }
      mapEta[eta][stat] = Math.round((mapEta[eta][stat] || 0) + q);
      mapEta[eta][cat] = Math.round((mapEta[eta][cat] || 0) + q);

      // Group by Category
      if (!mapCat[cat]) {
        mapCat[cat] = { category: cat };
      }
      mapCat[cat][stat] = Math.round((mapCat[cat][stat] || 0) + q);
    }

    const chartContainerData = Object.values(mapCabang).map((item: any) => ({
      cabang: item.cabang,
      "Jumlah Container": item.distinctPOs ? item.distinctPOs.size : 0,
      poList: item.distinctPOs ? Array.from(item.distinctPOs) : []
    })).sort((a: any, b: any) => b["Jumlah Container"] - a["Jumlah Container"]);

    const totalContainers = chartContainerData.reduce((sum, d) => sum + d["Jumlah Container"], 0);

    return { 
      chartData: Object.values(mapCabang), 
      chartEtaData: Object.values(mapEta).sort((a, b) => parseEtaRank(String(a.eta)) - parseEtaRank(String(b.eta))),
      chartContainerData,
      totalContainers,
      chartCategoryData: Object.values(mapCat), 
      statusList: Array.from(statuses), 
      categoryList: Array.from(categories),
      totalQty: Math.round(qtySum), 
      holdCount: holdSum 
    };
  }, [parsed, filtered, colCabang, colCategory, colGrup, colEta, colStatus, colQty, colPo, selectedCabangForChart]);

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
    return Object.values(map).sort((a: any, b: any) => {
      const cabA = String(a['Cabang'] || '').trim();
      const cabB = String(b['Cabang'] || '').trim();
      const diffCab = cabA.localeCompare(cabB, 'id', { numeric: true });
      if (diffCab !== 0) return diffCab;

      const poA = String(a['PO'] || '').trim();
      const poB = String(b['PO'] || '').trim();
      const diffPo = poA.localeCompare(poB, 'id', { numeric: true });
      if (diffPo !== 0) return diffPo;

      return (Number(b['Total Qty']) || 0) - (Number(a['Total Qty']) || 0);
    });
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
    <div id="export-container" className="space-y-8 pb-16 min-h-screen animate-fade-in text-foreground">
      {/* ─── HERO BANNER HEADER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-6 sm:p-8 border border-purple-500/20 shadow-2xl no-export">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#a855f7_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
              <FileBarChart className="w-3.5 h-3.5" /> Dashboard Data Harian • PR Update & Tracking Container
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              PR Update & Tracking Container <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300">(Integrated Tracker)</span>
            </h1>
            <p className="text-slate-700 text-sm sm:text-base max-w-3xl font-normal leading-relaxed">
              <span className="bg-amber-100 text-amber-900 px-2 py-1 rounded font-medium shadow-sm inline-block">
                Modul gabungan pemantauan Purchase Requisition dan Live Tracking Container kapal (On Vessel, SPJM, Hold).
              </span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <TimestampBadge timestamp={parsed?.processed_at || new Date().toISOString()} label="Olah Terakhir:" />
            <ExportHtmlButton 
              elementId="export-container" 
              moduleName="PR_Update_Lead_Time" 
              processedAt={parsed?.processed_at} 
            />
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
        <GlassCard className="p-6 border-purple-500/30 bg-white backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-purple-400" /> Panduan Upload Data PR Update (Excel / CSV)
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20"
              >
                <Download className="w-4 h-4" /> Unduh Template CSV
              </button>
              <button
                onClick={handleGenerateDemo}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-slate-900 font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Sparkles className="w-4 h-4" /> Gunakan Data Demo (+ SPJM)
              </button>
              <button
                onClick={handleSaveToGlobal}
                disabled={!parsed}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg"
              >
                <Cloud className="w-4 h-4" /> Simpan ke Global
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700 mb-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">📌 Pelacakan Status Pengadaan & SPJM:</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Modul ini memantau kolom <i>STATUS Compile</i> seperti <i>ON VESSEL, HOLD DELIVERY, SPJM, READY,</i> atau <i>PLAN LOADING</i> untuk mendeteksi bottleneck per cabang dan minggu ETA.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">⚙️ Engine Pembacaan Excel (XLSX & CSV):</h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Dilengkapi parsing XLSX ArrayBuffer, Anda dapat mengunggah file Excel (.xlsx) maupun CSV hasil ekstraksi sistem procurement tanpa kendala kerusakan karakter atau format numerik.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Unggah File PR Update Anda:</h4>
            <FileUploader
              onFileUpload={handleFileUpload}
              isLoading={isProcessing}
              label="Upload Data PR Update (Excel / CSV)"
              description="Drag & drop file di sini. Sistem otomatis merekap total Qty dan dokumen per status."
            />
          </div>
        </GlassCard>
      )}

      {/* ─── MAIN MODULE TAB SWITCHER ─── */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-900/50 p-2 rounded-xl border border-slate-700/50">
        <button
          onClick={() => setActiveTab('pr_update')}
          className={`flex-1 py-3 px-6 rounded-lg font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'pr_update' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25' : 'bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
        >
          <FileBarChart className="w-4 h-4" /> Analisa PR & Status
        </button>
        <button
          onClick={() => setActiveTab('lead_time')}
          className={`flex-1 py-3 px-6 rounded-lg font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'lead_time' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
        >
          <Timer className="w-4 h-4" /> Analisa Lead Time
        </button>
      </div>

      {activeTab === 'pr_update' && (
        <div className="space-y-8 animate-fade-in">
          {/* ─── TAB SWITCHER 3 JALUR SKENARIO ANALISIS ─── */}
          <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Pilih 3 Jalur Simulasi Rantai Pasok PR/PO:
          </h2>
          <span className="text-xs text-slate-600 italic hidden sm:inline">Klik tab untuk memproyeksikan percepatan atau delay lead time!</span>
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
      <GlassCard allowOverflow={true} className="p-6 border-slate-200 bg-white backdrop-blur-xl mb-10 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🏢 Filter Cabang:</label>
            <MultiSelect
              options={cabangs}
              selected={selectedCabang}
              onChange={setSelectedCabang}
              selectAllLabel="Semua Cabang"
              placeholder="Pilih Cabang..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📦 Filter Kategori / Grup:</label>
            <MultiSelect
              options={categories}
              selected={selectedCategory}
              onChange={setSelectedCategory}
              selectAllLabel="Semua Kategori"
              placeholder="Pilih Kategori..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">🗓️ Filter Week ETA:</label>
            <MultiSelect
              options={etas}
              selected={selectedEta}
              onChange={setSelectedEta}
              selectAllLabel="Semua ETA"
              placeholder="Pilih ETA..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">⚡ Filter Status Compile:</label>
            <MultiSelect
              options={statusCompiles}
              selected={selectedStatusCompile}
              onChange={setSelectedStatusCompile}
              selectAllLabel="Semua Status"
              placeholder="Pilih Status..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wider">📍 Sorot Grafik Cabang:</label>
            <select
              value={selectedCabangForChart}
              onChange={(e) => setSelectedCabangForChart(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none transition font-semibold cursor-pointer shadow-md"
            >
              <option value="All">🌐 Seluruh Cabang (All)</option>
              {cabangs.filter(c => c !== 'All').map((cab) => (
                <option key={cab} value={cab}>🏢 {cab}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* ─── VISUALIZATION CHART: TERPADU WEEK ETA & STACKED CATEGORY ─── */}
      {((chartViewMode === 'eta' && chartEtaData.length > 0) || (chartViewMode === 'cabang' && chartData.length > 0) || (chartViewMode === 'container' && chartContainerData.length > 0)) && (
        <GlassCard className="p-6 border-purple-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                Grafik Distribusi Status Compile & Persebaran Category ({chartViewMode === 'eta' ? 'per Week ETA' : chartViewMode === 'cabang' ? 'per Cabang' : 'Jumlah Container per Cabang'})
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                {chartViewMode === 'container' ? (
                  <>Sumbu X: <b className="text-emerald-400">Cabang</b> • Sumbu Y: <b className="text-cyan-300">Jumlah Container</b> (dihitung otomatis dari distinct count nomor PO per cabang).</>
                ) : (
                  <>Sumbu X: <b className="text-emerald-400">{chartViewMode === 'eta' ? 'Week ETA' : 'Cabang'}</b> • Batang bertingkat (Stacked Bar): <b className="text-sky-300">Category Barang</b> sesuai filter terpilih.</>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-md">
                <button
                  onClick={() => setChartViewMode('eta')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'eta' ? 'bg-purple-600 text-slate-900 shadow-md ring-1 ring-purple-400' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🗓️ Week ETA
                </button>
                <button
                  onClick={() => setChartViewMode('cabang')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'cabang' ? 'bg-purple-600 text-slate-900 shadow-md ring-1 ring-purple-400' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🏢 Cabang
                </button>
                <button
                  onClick={() => setChartViewMode('container')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    chartViewMode === 'container' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-slate-900 shadow-md ring-1 ring-cyan-400' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📦 Jumlah Container
                </button>
              </div>
              
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300 bg-cyan-950/60 px-3.5 py-2 rounded-xl border border-cyan-500/50 shadow-sm" title="Total container dari distinct count nomor PO per Cabang">
                <Package className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Jumlah Container: {totalContainers?.toLocaleString('id-ID') || 0} (Distinct PO)</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <span>🏷️ Menampilkan {chartViewMode === 'container' ? `${chartContainerData.length} cabang (Distinct PO)` : `${categoryList.length} kategori pada ${chartViewMode === 'eta' ? `${chartEtaData.length} periode ETA` : `${chartData.length} cabang`}`}</span>
              </div>
            </div>
          </div>

          <div className="w-full pb-4" style={{ minHeight: '520px' }}>
            <ResponsiveContainer width="100%" height={520}>
              <BarChart data={chartViewMode === 'eta' ? chartEtaData : chartViewMode === 'container' ? chartContainerData : chartData} margin={{ top: 20, right: 60, left: 40, bottom: 60 }}>
                <defs>
                  <linearGradient id="containerBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey={chartViewMode === 'eta' ? 'eta' : 'cabang'} stroke="#94a3b8" tick={{ fill: '#e2e8f0', fontSize: 11, fontWeight: 600 }} angle={-35} textAnchor="end" height={90} />
                <YAxis stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 12 }} width={100} tickFormatter={(val) => Number(val).toLocaleString('en-US')} />
                <Tooltip
                  content={chartViewMode === 'container' ? <CustomContainerTooltip /> : <CustomStackedTooltip />}
                  wrapperStyle={{ zIndex: 999999, pointerEvents: 'none', outline: 'none' }}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                />
                <Legend wrapperStyle={{ paddingTop: '24px', fontSize: '11px', maxHeight: '120px', overflowY: 'auto' }} />
                {chartViewMode === 'container' ? (
                  <Bar
                    dataKey="Jumlah Container"
                    name="Jumlah Container (Distinct Count No. PO per Cabang)"
                    fill="url(#containerBarGradient)"
                    maxBarSize={60}
                    radius={[8, 8, 0, 0]}
                  />
                ) : (
                  categoryList.map((cat, idx) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      name={cat}
                      fill={COLORS[idx % COLORS.length]}
                      stackId="pr_cat_stack"
                      maxBarSize={50}
                    />
                  ))
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ─── INSIGHT ALERT: PO OVERDUE ETA (SPJM, HOLD DELIVERY & ON VESSEL) ─── */}
      <GlassCard className="p-6 border-rose-500/40 bg-gradient-to-br from-slate-900 via-rose-950/20 to-slate-900 shadow-2xl overflow-hidden relative">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200/80 pb-4 mb-6 gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider mb-1 shadow-sm">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" /> Warning Supply Chain • Monitoring Keterlambatan Port & Vendor
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
              Insight PO Overdue: SPJM, Hold Delivery & On Vessel
            </h3>
            <p className="text-xs sm:text-sm text-slate-700">
              Mendeteksi dokumen dengan status krusial yang <b className="text-rose-400 underline">sudah melewati Tanggal ETA</b> dari tanggal pengolahan raw data (<b>{rawDataProcessingDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</b>).
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-4 py-2 rounded-xl bg-amber-500/20 border-2 border-amber-500/60 font-black text-xs sm:text-sm text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] flex items-center gap-2">
              <Timer className="w-4 h-4 text-amber-400 animate-spin-slow" />
              Total Overdue: {overdueInsights.length} PO
            </span>
          </div>
        </div>

        {/* Mini KPI Cards for Overdue Insights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/80 to-slate-900 border border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.25)] flex items-center justify-between transition-all hover:scale-[1.02]">
            <div>
              <div className="text-xs text-purple-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span>🟣 SPJM Overdue</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white mt-1.5 drop-shadow-md">
                {overdueInsights.filter(x => x.statusCategory === 'SPJM').length} <span className="text-xs font-semibold text-purple-300">Dokumen</span>
              </div>
              <div className="text-[11px] text-purple-100 font-mono font-bold mt-1 bg-purple-900/60 px-2 py-0.5 rounded border border-purple-500/50 inline-block shadow-sm">
                Total Qty: {overdueInsights.filter(x => x.statusCategory === 'SPJM').reduce((s, x) => s + x.qty, 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-400/50 flex items-center justify-center text-purple-300 text-2xl font-black shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              🟣
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/80 to-slate-900 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.25)] flex items-center justify-between transition-all hover:scale-[1.02]">
            <div>
              <div className="text-xs text-rose-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span>🔴 Hold Delivery Overdue</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white mt-1.5 drop-shadow-md">
                {overdueInsights.filter(x => x.statusCategory === 'HOLD').length} <span className="text-xs font-semibold text-rose-300">Dokumen</span>
              </div>
              <div className="text-[11px] text-rose-100 font-mono font-bold mt-1 bg-rose-900/60 px-2 py-0.5 rounded border border-rose-500/50 inline-block shadow-sm">
                Total Qty: {overdueInsights.filter(x => x.statusCategory === 'HOLD').reduce((s, x) => s + x.qty, 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-rose-300 text-2xl font-black shadow-[0_0_15px_rgba(244,63,94,0.4)]">
              🔴
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/80 to-slate-900 border border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.25)] flex items-center justify-between transition-all hover:scale-[1.02]">
            <div>
              <div className="text-xs text-blue-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <span>🔵 On Vessel Overdue</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white mt-1.5 drop-shadow-md">
                {overdueInsights.filter(x => x.statusCategory === 'VESSEL').length} <span className="text-xs font-semibold text-blue-300">Dokumen</span>
              </div>
              <div className="text-[11px] text-blue-100 font-mono font-bold mt-1 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-500/50 inline-block shadow-sm">
                Total Qty: {overdueInsights.filter(x => x.statusCategory === 'VESSEL').reduce((s, x) => s + x.qty, 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/50 flex items-center justify-center text-blue-300 text-2xl font-black shadow-[0_0_15px_rgba(59,130,246,0.4)]">
              🔵
            </div>
          </div>
        </div>

        {/* Table of Overdue POs */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[420px] overflow-y-auto shadow-inner">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1050px]">
            <thead className="bg-slate-800/80 text-slate-200 uppercase font-bold sticky top-0 z-20 shadow-md text-center text-[11px] tracking-wider">
              <tr className="border-b border-slate-700">
                <th className="py-3.5 px-3 text-left">Cabang</th>
                <th className="py-3.5 px-3 border-l border-slate-700 text-amber-400">No. PO</th>
                <th className="py-3.5 px-3 border-l border-slate-700 text-purple-400">Status Compile</th>
                <th className="py-3.5 px-3 border-l border-slate-700 text-cyan-300">Tanggal ETA</th>
                <th className="py-3.5 px-4 border-l border-slate-700 text-rose-400 bg-rose-950/40 font-extrabold">Durasi Terlewat</th>
                <th className="py-3.5 px-3 border-l border-slate-700 text-left">Deskripsi & Kategori</th>
                <th className="py-3.5 px-3 border-l border-slate-700 text-emerald-400">Total Qty</th>
                <th className="py-3.5 px-4 border-l border-slate-700">Action & Rekomendasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300 text-center font-medium">
              {overdueInsights.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-emerald-400 font-bold bg-slate-900/40 text-sm">
                    🎉 Tidak ada dokumen SPJM, Hold Delivery, atau On Vessel yang melewati Tanggal ETA! Seluruh rantai pasok tepat waktu.
                  </td>
                </tr>
              ) : overdueInsights.map((item: any, idx: number) => {
                const isSevere = item.overdueDays >= 14;
                const isMod = item.overdueDays >= 7 && !isSevere;
                return (
                  <tr key={idx} className="hover:bg-slate-800/50 transition font-semibold">
                    <td className="py-3 px-3 text-left font-extrabold align-middle">
                      <span className="bg-slate-800 text-slate-100 px-2 py-1 rounded-md">{item.cabang}</span>
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 font-mono font-bold text-amber-300 align-middle text-sm">
                      {item.po}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 align-middle">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black inline-block shadow-sm ${
                        item.statusCategory === 'SPJM' ? 'bg-purple-950/90 text-purple-300 border border-purple-500/50' :
                        item.statusCategory === 'HOLD' ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50' :
                        'bg-blue-950/90 text-blue-300 border border-blue-500/50'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 font-mono text-cyan-300 align-middle font-bold">
                      {item.etaFormatted}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 bg-rose-950/30 align-middle">
                      <span className={`px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1.5 shadow-md border ${
                        isSevere ? 'bg-rose-600 text-white border-rose-400 animate-pulse' :
                        isMod ? 'bg-orange-500 text-slate-900 border-orange-300' :
                        'bg-amber-500/30 text-amber-300 border-amber-500/50'
                      }`}>
                        <Timer className="w-3.5 h-3.5 shrink-0" />
                        Terlewat {item.overdueDays} Hari
                      </span>
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 text-left align-middle max-w-[240px]">
                      <div className="truncate text-xs" title={item.deskripsi}>
                        <span className="font-bold text-slate-100 bg-slate-800 px-1.5 py-0.5 rounded">{item.deskripsi}</span>
                      </div>
                      <div className="mt-1 truncate">
                        <span className="text-[11px] text-purple-200 bg-purple-900/60 px-1.5 py-0.5 rounded font-mono border border-purple-700/50">{item.grup} • {item.category}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 font-mono font-black text-emerald-400 text-base align-middle">
                      {item.qty.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-700 align-middle">
                      <div className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 shadow-sm inline-block">
                        {item.statusCategory === 'SPJM' ? '🚛 Desak Trucking Port' :
                         item.statusCategory === 'HOLD' ? '📞 Eskalasi Vendor/Port' :
                         '⚓ Cek Sandar / Bea Cukai'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ─── TABEL COMPLEMENTARY: ANALISIS KOMPARATIF PR & STATUS COMPILE (CABANG - PO - GRUP - CATEGORY - DESCRIPTION) ─── */}
      <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                Tabel Analisis Komparatif PR & Status Compile ({pivotData.length} Kombinasi Item)
              </h3>
              <button
                onClick={() => setOnlyCrucialStatus(!onlyCrucialStatus)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 border shadow-md ${
                  onlyCrucialStatus
                    ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-100 text-slate-700 border-slate-600 hover:bg-slate-700'
                }`}
                title="Klik untuk mengubah filter status"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{onlyCrucialStatus ? '🎯 Khusus: On Vessel • Hold • SPJM' : '📋 Semua Status Compile'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Diurutkan rapi berdasarkan: <b className="text-amber-300">Cabang (A-Z) ➔ No PO (A-Z)</b>. Menampilkan kuota dan zonasi tindak lanjut supply chain.
            </p>
          </div>

          <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-slate-900 font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-purple-600/20 shrink-0"
          >
            <Download className="w-4 h-4" /> Ekspor Hasil ke Excel / CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1100px]">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-200 text-[11px] tracking-wider text-center">
                <th className="py-3.5 px-4 text-left">Cabang</th>
                <th className="py-3.5 px-3 border-l border-slate-200 text-amber-400">No. PO</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-left">Grup & Kategori</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-left">Deskripsi Barang</th>
                <th className="py-3.5 px-3 border-l border-slate-200 text-purple-400">Status Compile</th>
                <th className="py-3.5 px-3 border-l border-slate-200 text-cyan-400">Week ETA</th>
                <th className="py-3.5 px-4 border-l border-slate-200 text-emerald-400">Total Qty</th>
                <th className="py-3.5 px-3 border-l border-slate-200 bg-slate-100 text-slate-900">Jumlah Dokumen</th>
                <th className="py-3.5 px-4 border-l border-slate-200">Zonasi Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-700 text-center">
              {pivotData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-600 font-medium">
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
                    className="hover:bg-slate-100 transition cursor-pointer font-medium"
                    onClick={() => setSelectedCabangForChart(row['Cabang'] === selectedCabangForChart ? 'All' : row['Cabang'])}
                  >
                    <td className="py-3 px-4 text-left font-bold text-slate-900 align-middle">
                      {row['Cabang']}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-200 font-mono font-bold text-amber-300 align-middle">
                      {row['PO']}
                    </td>
                    <td className="py-3 px-4 border-l border-slate-200 text-left align-middle">
                      <div className="font-semibold text-slate-800 text-xs">{row['Grup']}</div>
                      <div className="text-[11px] text-purple-300 mt-0.5 font-mono">{row['Category']}</div>
                    </td>
                    <td className="py-3 px-4 border-l border-slate-200 text-left text-slate-700 max-w-[220px] truncate align-middle" title={row['Deskripsi']}>
                      {row['Deskripsi']}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-200 font-extrabold text-slate-800 align-middle">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold inline-block ${
                        isHold ? 'bg-rose-950/60 text-rose-300 border border-rose-500/30' :
                        isSpjm ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30' :
                        isVessel ? 'bg-blue-950/60 text-blue-300 border border-blue-500/30' : ''
                      }`}>
                        {row['Status']}
                      </span>
                    </td>
                    <td className="py-3 px-3 border-l border-slate-200 font-mono font-bold text-cyan-300 align-middle">
                      {row['ETA']}
                    </td>
                    <td className="py-3 px-4 border-l border-slate-200 font-mono font-black text-emerald-400 text-base align-middle">
                      {Number(row['Total Qty']).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 border-l border-slate-200 bg-slate-50 font-bold font-mono text-slate-900 text-base align-middle">
                      {Number(row['Jumlah Dokumen']).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 border-l border-slate-200 align-middle">
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
          <p className="text-xs text-slate-600 mt-4 italic text-center">
            *Menampilkan 150 baris pertama dengan Qty terbesar dari total {pivotData.length} kombinasi item...
          </p>
        )}
      </GlassCard>

      {/* ─── TABEL DETAIL PR UPDATE & LIVE TRACKING CONTAINER (DENGAN EXCEL-STYLE COLUMN FILTER) ─── */}
      {parsed && parsed.headers && (
        <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-4 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
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
              <p className="text-xs text-slate-600 mt-1">
                Dilengkapi <b className="text-emerald-400">Filter Kolom ala Excel</b> (klik ikon filter di setiap header untuk cari & pilih data) dan kolom <b className="text-teal-300">Shipping Line / Pelayarań</b>.
              </p>
            </div>

            <button
              onClick={handleExport}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-slate-900 font-semibold text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-sky-600/20 shrink-0"
            >
              <Download className="w-4 h-4" /> Ekspor Data 13 Kolom ({displayedDetailRows.length} baris)
            </button>
          </div>

          {/* Excel Filter Modal Popover */}
          {activeFilterModalCol && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-400" /> Filter Kolom: <span className="text-emerald-400">{activeFilterModalCol}</span>
                  </h4>
                  <button onClick={() => setActiveFilterModalCol(null)} className="text-slate-600 hover:text-slate-900 transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-600" />
                    <input
                      type="text"
                      value={modalSearchInput}
                      onChange={e => setModalSearchInput(e.target.value)}
                      placeholder={`Cari teks dalam ${activeFilterModalCol}...`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    {modalSearchInput && (
                      <button onClick={() => setModalSearchInput('')} className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900 text-xs">
                        Hapus
                      </button>
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1 text-xs">
                    <div className="text-[11px] font-semibold text-slate-600 mb-1 px-1 flex justify-between">
                      <span>Daftar Nilai Unik ({currentModalUniqueValues.length}):</span>
                    </div>
                    {currentModalUniqueValues.filter(val => !modalSearchInput || val.toLowerCase().includes(modalSearchInput.toLowerCase())).slice(0, 50).map((val, idx) => {
                      const isChecked = !colFilters[activeFilterModalCol]?.selected?.length || colFilters[activeFilterModalCol]?.selected?.includes(val);
                      return (
                        <label
                          key={idx}
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer text-slate-700 truncate"
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
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${isChecked ? 'bg-emerald-500 border-emerald-500 text-slate-900' : 'border-slate-600 bg-white'}`}>
                            {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <span className="truncate">{val}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
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
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-700 text-slate-700 text-xs font-semibold transition"
                    >
                      Reset Kolom Ini
                    </button>
                    <button
                      onClick={() => handleApplyModalFilter(colFilters[activeFilterModalCol]?.selected || [])}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-900 text-xs font-bold transition shadow-lg shadow-emerald-600/20"
                    >
                      Terapkan Filter
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[580px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1300px]">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 z-20 shadow-md">
                <tr className="border-b border-slate-200 text-[11px] tracking-wider text-center">
                  {parsed.headers.map((h) => {
                    const isFiltered = colFilters[h]?.search || (colFilters[h]?.selected && colFilters[h]?.selected.length > 0);
                    const isShippingLine = h.toLowerCase().includes('shipping') || h.toLowerCase().includes('carrier') || h.toLowerCase().includes('pelayaran');
                    const isContainer = h.toLowerCase().includes('container') || h.toLowerCase().includes('kontainer');
                    
                    return (
                      <th
                        key={h}
                        className={`py-3 px-3 border-l border-slate-200 whitespace-nowrap align-middle ${
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
                              isFiltered ? 'bg-emerald-500 text-slate-900 shadow-sm ring-2 ring-emerald-400' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                  <th className="py-3 px-4 border-l border-slate-200 text-sky-400 bg-sky-950/50 align-middle">🛰️ Action Track</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-700 text-center font-medium">
                {displayedDetailRows.length === 0 ? (
                  <tr>
                    <td colSpan={parsed.headers.length + 1} className="py-12 text-center text-slate-600 font-medium">
                      Tidak ada baris yang cocok dengan kombinasi filter kolom aktif. <span className="text-rose-400 underline cursor-pointer" onClick={() => setColFilters({})}>Klik di sini untuk mereset filter</span>.
                    </td>
                  </tr>
                ) : displayedDetailRows.slice(0, 150).map((row, idx) => {
                  const contVal = colContainer ? String(row[colContainer] || '') : '';
                  const carrierVal = colCarrier ? String(row[colCarrier] || '') : '';
                  const hasCont = contVal && contVal.trim() !== '' && contVal.trim() !== '-' && contVal.trim() !== '0' && contVal.toUpperCase() !== 'N/A';
                  const trackInfo = hasCont ? getDirectTrackingUrl(contVal.trim(), carrierVal.trim()) : null;

                  return (
                    <tr key={idx} className="hover:bg-slate-100 transition">
                      {parsed.headers.map((h) => {
                        let val = row[h];
                        const isShippingLine = h.toLowerCase().includes('shipping') || h.toLowerCase().includes('carrier') || h.toLowerCase().includes('pelayaran') || h === colCarrier;
                        const isBl = h === colBl || h.toLowerCase().includes('bl') || h.toLowerCase().includes('lading') || h.toLowerCase().includes('booking');
                        const isDateCol = (h.toLowerCase().includes('eta') && !h.toLowerCase().includes('week')) || h.toLowerCase().includes('tanggal') || h.toLowerCase().includes('date') || h.toLowerCase().includes('tgl') || h.toLowerCase().includes('waktu');
                        
                        if (isDateCol && val != null && val !== '') {
                          const numVal = Number(val);
                          if (!isNaN(numVal) && numVal > 30000 && numVal < 70000) {
                            const d = new Date((numVal - 25569) * 86400 * 1000);
                            const days = String(d.getUTCDate()).padStart(2, '0');
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                            const month = months[d.getUTCMonth()];
                            val = `${days} ${month} ${d.getUTCFullYear()}`;
                          }
                        } else if (colQty && h === colQty && val != null && val !== '') {
                          val = Math.round(Number(String(val).replace(/[^0-9.-]+/g, '')) || 0).toLocaleString('id-ID');
                        } else if (typeof val === 'number' && h !== colBl && h !== colContainer && h !== colPo && h !== colPr && !isBl && h !== colCabang && !isDateCol) {
                          val = val.toLocaleString('id-ID');
                        }
                        return (
                          <td
                            key={h}
                            className={`py-2.5 px-3 border-l border-slate-200 whitespace-nowrap ${
                              h === colContainer && hasCont ? 'font-mono font-bold text-sky-300' : 
                              isShippingLine ? 'font-semibold text-teal-300' : 
                              isBl ? 'font-mono text-purple-300 font-medium' : 
                              h === colCabang || h.toLowerCase().includes('branch') || h.toLowerCase().includes('cabang') ? 'font-bold text-slate-800' : ''
                            }`}
                          >
                            {h === colContainer && hasCont && trackInfo && trackInfo.url ? (
                              <a href={trackInfo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline hover:text-slate-900 transition group font-bold" title={`Lacak ${val} di ${trackInfo.carrier}`}>
                                <span>{val}</span>
                                <ExternalLink className="w-3 h-3 text-sky-400 group-hover:text-slate-900 inline ml-0.5 shrink-0" />
                              </a>
                            ) : (val !== undefined && val !== null && val !== '' ? val : '-')}
                          </td>
                        );
                      })}
                      <td className="py-2 px-4 border-l border-slate-200 bg-slate-50 whitespace-nowrap">
                        {hasCont && trackInfo && trackInfo.url ? (
                          <a
                            href={trackInfo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 hover:text-slate-900 border border-sky-500/40 font-bold transition shadow-sm"
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
            <p className="text-xs text-slate-600 mt-4 italic text-center">
              * Menampilkan 150 baris pertama dari total {displayedDetailRows.length} dokumen pesanan yang tersaring...
            </p>
          )}
        </GlassCard>
      )}
      </div>
      )}

      {/* ─── LEAD TIME MODULE ─── */}
      {activeTab === 'lead_time' && leadTimeData && (
        <div className="space-y-8 animate-fade-in">
          <GlassCard className="p-6 border-slate-200 bg-white shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 mb-4 border-b border-slate-200 pb-3">
              <Timer className="w-6 h-6 text-indigo-600" /> Analisa Lead Time Aktual
            </h2>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 shadow-md">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600"><Clock className="w-6 h-6"/></div>
                <div>
                  <div className="text-sm text-slate-500 font-bold tracking-wide">Avg Total Days (SPPB to Bongkar)</div>
                  <div className="text-3xl font-black text-slate-800 drop-shadow-sm">{leadTimeData.avgTotalDays} <span className="text-sm text-slate-500 font-normal">hari</span></div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 shadow-md">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600"><Truck className="w-6 h-6"/></div>
                <div>
                  <div className="text-sm text-slate-500 font-bold tracking-wide">Avg Days SPPB to ETA</div>
                  <div className="text-3xl font-black text-slate-800 drop-shadow-sm">{leadTimeData.avgSppbEtaDays} <span className="text-sm text-slate-500 font-normal">hari</span></div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-xl flex items-center gap-4 shadow-md">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600"><Package className="w-6 h-6"/></div>
                <div>
                  <div className="text-sm text-slate-500 font-bold tracking-wide">Avg Days ETA to Bongkar</div>
                  <div className="text-3xl font-black text-slate-800 drop-shadow-sm">{leadTimeData.avgBongkarDays} <span className="text-sm text-slate-500 font-normal">hari</span></div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-md">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Tren History Lead Time (per Bulan)</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={leadTimeData.trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={12} fontWeight="bold" />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#1e293b' }} />
                      <Legend />
                      <Bar dataKey="avgDays" name="Avg Total Days" fill="#4f46e5" radius={[4,4,0,0]} barSize={40} />
                      <Line type="monotone" dataKey="avgSppbEta" name="Avg SPPB to ETA" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="avgBongkar" name="Avg ETA to Bongkar" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-md">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Perbandingan Cabang (Avg Total Days)</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadTimeData.branchData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" stroke="#64748b" fontSize={12} />
                      <YAxis dataKey="branch" type="category" stroke="#64748b" fontSize={12} width={100} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#1e293b' }} />
                      <Bar dataKey="avgDays" name="Avg Total Days" fill="#10b981" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Urgent Containers */}
            <div className="mt-8 bg-white rounded-xl p-6 border border-rose-200 shadow-md">
              <h3 className="text-sm font-bold text-rose-600 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Top 10 Kontainer Urgent Untuk Segera Dibongkar (Berdasarkan Total Hari Menunggu)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="p-3 text-slate-700 font-semibold rounded-tl-lg">Region</th>
                      <th className="p-3 text-slate-700 font-semibold">Cabang</th>
                      <th className="p-3 text-slate-700 font-semibold">No. Kontainer</th>
                      <th className="p-3 text-slate-700 font-semibold text-right rounded-tr-lg">Total Days (Tunggu)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadTimeData.urgentContainers.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-600">{c.region}</td>
                        <td className="p-3 text-slate-900 font-medium">{c.branch}</td>
                        <td className="p-3 text-indigo-600 font-mono text-xs">{c.container}</td>
                        <td className="p-3 text-right font-bold text-rose-600">{c.waitDays} <span className="text-xs font-normal text-slate-400">Hari</span></td>
                      </tr>
                    ))}
                    {leadTimeData.urgentContainers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500 italic">Tidak ada data kontainer urgent.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </GlassCard>
        </div>
      )}
      
      {activeTab === 'lead_time' && !leadTimeData && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] bg-slate-900/50 rounded-2xl border border-slate-700/50 text-slate-400 p-8 text-center">
          <Timer className="w-12 h-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-300">Data Lead Time Tidak Ditemukan</h3>
          <p className="text-sm mt-2 max-w-md">Sheet "Lead Time" tidak ditemukan di dalam file Excel yang diunggah. Pastikan Anda mengunggah file Excel terbaru menggunakan format template yang baru.</p>
        </div>
      )}
    </div>
  );
}

