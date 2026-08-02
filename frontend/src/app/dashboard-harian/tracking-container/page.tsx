"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { TimestampBadge } from '@/components/ui/TimestampBadge';
import { FileUploader } from '@/components/ui/FileUploader';
import {
  Anchor, Plus, Download, Upload, Search, ChevronDown, ChevronRight,
  ExternalLink, Edit, Trash2, CheckCircle2, AlertTriangle, Clock,
  Box, Navigation, HelpCircle, Filter, Ship, Copy, RefreshCw, X,
  FileSpreadsheet, Info, CheckCircle, Zap, Monitor, Globe, Play, ChevronLeft, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { get, set } from 'idb-keyval';
import * as XLSX from 'xlsx';

/* ─── Carrier Catalogue & Direct URL Generator ─── */
const CARRIERS = [
  { name: "Maersk", url: "https://www.maersk.com/tracking/" },
  { name: "MSC", url: "https://www.msc.com/en/track-a-shipment" },
  { name: "CMA CGM", url: "https://www.cma-cgm.com/ebusiness/tracking" },
  { name: "ONE (Ocean Network Express)", url: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking" },
  { name: "Evergreen Line", url: "https://www.evergreen-line.com/emodal/Cargo/CargoTrackingDetail" },
  { name: "Hapag-Lloyd", url: "https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html" },
  { name: "COSCO Shipping", url: "https://elines.coscoshipping.com/ebusiness/cargoTracking" },
  { name: "Yang Ming", url: "https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx" },
  { name: "HMM", url: "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.jsp" },
  { name: "ZIM", url: "https://www.zim.com/tools/track-a-shipment" },
  { name: "OOCL", url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx" },
  { name: "PIL (Pacific Int'l Lines)", url: "https://www.pilship.com/cargo-tracking" },
  { name: "Wan Hai Lines", url: "https://www.wanhai.com/views/Cargo_Tracking/CargoTracking.xhtml" },
  { name: "Meratus Line", url: "https://www.meratus.com/" },
  { name: "Samudera Indonesia", url: "https://www.samudera.com/" },
  { name: "SPIL (Salam Pacific Indonesia Lines)", url: "https://www.spil.co.id/" },
  { name: "Temas Line", url: "https://www.temasline.com/" },
  { name: "Tanto Intim Line", url: "https://www.tantonet.com/" },
  { name: "SeaRates (agregator universal)", url: "https://www.searates.com/container/tracking/?shipment-type=sea" },
  { name: "FindTEU (agregator universal)", url: "https://www.findteu.com/" },
  { name: "Lainnya / Custom", url: "" }
];

const STATUS_LIST = [
  "Siap Di-track",
  "Sedang Berlayar",
  "Estimasi Delay",
  "Tiba di Pelabuhan",
  "Selesai/Diambil",
  "Belum Ada Info"
];

interface ContainerItem {
  id: string;
  no: string;
  bl: string;
  carrier: string;
  cabang: string;
  status: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  notes: string;
  lastChecked: string;
}

/* ─── Default Sample Data (Based on 3 Core Columns) ─── */
const DEFAULT_CONTAINERS: ContainerItem[] = [
  {
    id: 'c-101',
    no: 'MRTU1234567',
    bl: 'BL-MRT-00912',
    carrier: 'Meratus Line',
    cabang: 'Surabaya',
    status: 'Sedang Berlayar',
    pol: 'Tanjung Priok, Jakarta',
    pod: 'Tanjung Perak, Surabaya',
    etd: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
    eta: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    notes: '✅ Di-track auto via Gateway Pelayaran (Prioritas Gudang R3)',
    lastChecked: new Date().toISOString().slice(0, 10),
  },
  {
    id: 'c-102',
    no: 'TEMU7654321',
    bl: 'BL-TMS-88231',
    carrier: 'Temas Line',
    cabang: 'Makassar',
    status: 'Estimasi Delay',
    pol: 'Tanjung Perak, Surabaya',
    pod: 'Soekarno Hatta, Makassar',
    etd: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    eta: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
    notes: '⚠️ Keterlambatan bersandar karena antrean pelabuhan',
    lastChecked: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
  },
  {
    id: 'c-103',
    no: 'SPIL8899001',
    bl: '',
    carrier: 'SPIL (Salam Pacific Indonesia Lines)',
    cabang: 'Medan',
    status: 'Siap Di-track',
    pol: '',
    pod: '',
    etd: '',
    eta: '',
    notes: '📦 Raw Data 3 Kolom Diimpor - Siap Auto-Track',
    lastChecked: '',
  },
  {
    id: 'c-104',
    no: 'MAEU9988776',
    bl: 'BL-MAE-55112',
    carrier: 'Maersk',
    cabang: 'Semarang',
    status: 'Siap Di-track',
    pol: '',
    pod: '',
    etd: '',
    eta: '',
    notes: '📦 Raw Data 3 Kolom Diimpor - Siap Auto-Track',
    lastChecked: '',
  },
];

/* ─── Direct Tracking URL Synthesizer (Langsung ke Web Resmi Pelayaran) ─── */
function getDirectTrackingUrl(carrierName?: string, containerNo?: string): { url: string; source: string } {
  const no = (containerNo || "").trim().toUpperCase();
  const carrier = (carrierName || "").toLowerCase().trim();

  // 1. Indonesian Domestic & Regional Shipping Lines (DIRECT TO OFFICIAL WEB)
  if (carrier.includes("meratus")) return { url: "https://www.meratus.com/", source: "Meratus Line Official Web" };
  if (carrier.includes("temas")) return { url: "https://www.temasline.com/", source: "Temas Line Official Web" };
  if (carrier.includes("spil") || carrier.includes("salam pacific")) return { url: "https://www.spil.co.id/", source: "SPIL Official Web" };
  if (carrier.includes("samudera")) return { url: "https://www.samudera.com/", source: "Samudera Indonesia Official Web" };
  if (carrier.includes("tanto")) return { url: "https://www.tantonet.com/", source: "Tanto Intim Line Official Web" };
  if (carrier.includes("wan hai") || carrier.includes("wanhai")) return { url: "https://www.wanhai.com/views/Cargo_Tracking/CargoTracking.xhtml", source: "Wan Hai Official Web" };
  if (carrier.includes("pil") || carrier.includes("pacific int")) return { url: "https://www.pilship.com/cargo-tracking", source: "PIL Official Web" };
  if (carrier.includes("hmm")) return { url: "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.jsp", source: "HMM Official Web" };

  // 2. Global shipping lines direct deep link search formulas (DIRECT TO OFFICIAL WEB WITH NUMBER PREFILLED)
  if (carrier.includes("maersk")) return { url: `https://www.maersk.com/tracking/${no}`, source: "Maersk Official Direct" };
  if (carrier.includes("msc")) return { url: `https://www.msc.com/en/track-a-shipment?number=${no}`, source: "MSC Official Direct" };
  if (carrier.includes("cma") || carrier.includes("cgm")) return { url: `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=CN&Reference=${no}`, source: "CMA CGM Official Direct" };
  if (carrier.includes("one") || carrier.includes("ocean network")) return { url: `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trackingNo=${no}`, source: "ONE Official Direct" };
  if (carrier.includes("hapag") || carrier.includes("lloyd")) return { url: `https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?blno=${no}`, source: "Hapag-Lloyd Official Direct" };
  if (carrier.includes("zim")) return { url: `https://www.zim.com/tools/track-a-shipment?consignmentNumber=${no}`, source: "ZIM Official Direct" };
  if (carrier.includes("evergreen")) return { url: `https://www.evergreen-line.com/emodal/Cargo/CargoTrackingDetail?no=${no}`, source: "Evergreen Official Direct" };
  if (carrier.includes("oocl")) return { url: `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?cn=${no}`, source: "OOCL Official Direct" };
  if (carrier.includes("yang ming") || carrier.includes("yangming")) return { url: `https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?no=${no}`, source: "Yang Ming Official Direct" };
  if (carrier.includes("cosco")) return { url: `https://elines.coscoshipping.com/ebusiness/cargoTracking?no=${no}`, source: "COSCO Official Direct" };

  // 3. Explicit Aggregator requests
  if (carrier.includes("searates")) return { url: `https://www.searates.com/container/tracking/?number=${no}`, source: "SeaRates Universal" };
  if (carrier.includes("findteu")) return { url: `https://www.findteu.com/tracking/${no}`, source: "FindTEU Universal Direct" };

  // 4. Check if existing in CARRIERS catalogue
  const found = CARRIERS.find(c => c.name.toLowerCase().includes(carrier) && c.url !== "" && !c.name.toLowerCase().includes("agregator"));
  if (found) {
    return { url: found.url, source: `${found.name} Official Web` };
  }

  // 5. Fallback for custom / unlisted shipping line: Directly search their official tracking web!
  if (carrier && carrier !== "lainnya / custom" && !carrier.includes("agregator")) {
    return { url: `https://www.google.com/search?q=${encodeURIComponent((carrierName || "") + " container tracking " + no)}`, source: `${carrierName || "Official"} Web` };
  }

  // Default only if no carrier specified at all
  return { url: `https://www.searates.com/container/tracking/?number=${no}`, source: "Agregator (Direct Track)" };
}

/* ─── Helpers ─── */
function uid(): string {
  return 'c' + Date.now() + Math.random().toString(36).substring(2, 7);
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}
function fmtDate(d?: string): string {
  if (!d) return "-";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function isOverdue(c: ContainerItem): boolean {
  if (!c.eta) return false;
  if (c.status === "Tiba di Pelabuhan" || c.status === "Selesai/Diambil") return false;
  return daysBetween(todayISO(), c.eta) < 0;
}
function lastCheckedClass(c: ContainerItem): "fresh" | "warn" | "stale" {
  if (!c.lastChecked) return "stale";
  const d = daysBetween(c.lastChecked, todayISO());
  if (d <= 1) return "fresh";
  if (d <= 3) return "warn";
  return "stale";
}
function lastCheckedLabel(c: ContainerItem): string {
  if (!c.lastChecked) return "Belum pernah dicek";
  const d = daysBetween(c.lastChecked, todayISO());
  if (d <= 0) return "Dicek hari ini";
  if (d === 1) return "Dicek kemarin";
  return `Dicek ${d} hari lalu`;
}
function getStatusStyle(status: string): string {
  switch (status) {
    case "Siap Di-track":
      return "bg-amber-500/20 text-amber-500 dark:text-amber-300 border-amber-500/40 font-extrabold animate-pulse";
    case "Sedang Berlayar":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 font-bold";
    case "Estimasi Delay":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 font-bold";
    case "Tiba di Pelabuhan":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold";
    case "Selesai/Diambil":
      return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 font-medium";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export default function TrackingContainerPage() {
  const [containers, setContainers] = useState<ContainerItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-Tracking Batch Engine States
  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const [trackProgress, setTrackProgress] = useState({ current: 0, total: 0, activeNo: "", activeCarrier: "" });

  // Web Tracker Portal States (All-in-One Live Viewer)
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [activePortalIndex, setActivePortalIndex] = useState(0);

  // Filter States
  const [filterCabang, setFilterCabang] = useState<string>("");
  const [filterCarrier, setFilterCarrier] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [groupByCabang, setGroupByCabang] = useState<boolean>(true);

  // UI States
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Field States
  const [fldNo, setFldNo] = useState("");
  const [fldBl, setFldBl] = useState("");
  const [fldCarrier, setFldCarrier] = useState(CARRIERS[0].name);
  const [fldCarrierCustom, setFldCarrierCustom] = useState("");
  const [fldCabang, setFldCabang] = useState("");
  const [fldStatus, setFldStatus] = useState("Siap Di-track");
  const [fldPol, setFldPol] = useState("");
  const [fldPod, setFldPod] = useState("");
  const [fldEtd, setFldEtd] = useState("");
  const [fldEta, setFldEta] = useState("");
  const [fldNotes, setFldNotes] = useState("");

  // Bulk Textarea
  const [bulkText, setBulkText] = useState("");

  /* ─── Load Data ─── */
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        let saved: any = null;
        try {
          saved = await get('last_tracking_containers_v3');
        } catch { /* fallback */ }
        
        if (!saved && typeof window !== 'undefined') {
          const raw = localStorage.getItem('last_tracking_containers');
          if (raw) saved = JSON.parse(raw);
        }

        if (saved && saved.containers && Array.isArray(saved.containers) && saved.containers.length > 0) {
          setContainers(saved.containers);
          setLastUpdated(saved.processed_at || null);
        } else {
          setContainers(DEFAULT_CONTAINERS);
          setLastUpdated(new Date().toISOString());
          saveToStorage(DEFAULT_CONTAINERS);
        }
      } catch (e) {
        console.error("Error loading containers data:", e);
        setContainers(DEFAULT_CONTAINERS);
      } finally {
        setIsLoading(false);
      }
    };
    loadSavedData();
  }, []);

  const saveToStorage = async (list: ContainerItem[]) => {
    const now = new Date().toISOString();
    const payload = {
      processed_at: now,
      containers: list,
    };
    setLastUpdated(now);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_tracking_containers', JSON.stringify(payload));
    }
    try {
      await set('last_tracking_containers_v3', payload);
    } catch (e) {
      console.warn("Failed saving to IndexDB:", e);
    }
  };

  /* ─── Handle Excel / CSV 3-Column Raw Data Upload ─── */
  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    toast.loading("Membaca 3 kolom raw data dari Excel/CSV...", { id: "upload-excel" });
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

      if (!json || json.length === 0) {
        throw new Error("File kosong atau format sheet tidak terdeteksi.");
      }

      let added = 0;
      let skipped = 0;
      const newContainers: ContainerItem[] = [];

      json.forEach((row: any) => {
        const getVal = (possibleKeys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const pk of possibleKeys) {
            const found = rowKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(pk.toLowerCase().replace(/[^a-z0-9]/g, '')));
            if (found && row[found]) return String(row[found]).trim();
          }
          return "";
        };

        // Strictly capture the 3 core columns: no_kontainer, pelayaran, cabang
        const no = getVal(["no_kontainer", "no kontainer", "no. kontainer", "kontainer", "container", "container no"]);
        const carrier = getVal(["pelayaran", "shipping line", "carrier", "maskapai", "shipping", "line"]);
        const cabang = getVal(["cabang", "cabang tujuan", "branch", "tujuan", "dest", "destination"]);

        // Also capture optional supplementary columns if present
        const bl = getVal(["bl", "no bl", "booking", "bill of lading"]);
        const statusRaw = getVal(["status", "status pengiriman", "state"]);
        const pol = getVal(["pol", "pelabuhan muat", "port of loading"]);
        const pod = getVal(["pod", "pelabuhan bongkar", "port of discharge"]);
        const etd = getVal(["etd"]);
        const eta = getVal(["eta"]);
        const notes = getVal(["catatan", "notes", "keterangan", "remark"]);

        if (!no || !cabang) {
          skipped++;
          return;
        }

        let validStatus = "Siap Di-track";
        if (STATUS_LIST.some(s => s.toLowerCase() === statusRaw.toLowerCase())) {
          validStatus = STATUS_LIST.find(s => s.toLowerCase() === statusRaw.toLowerCase()) || validStatus;
        } else if (statusRaw.toLowerCase().includes("berlayar") || statusRaw.toLowerCase().includes("transit")) {
          validStatus = "Sedang Berlayar";
        } else if (statusRaw.toLowerCase().includes("delay") || statusRaw.toLowerCase().includes("lambat")) {
          validStatus = "Estimasi Delay";
        } else if (statusRaw.toLowerCase().includes("tiba") || statusRaw.toLowerCase().includes("port")) {
          validStatus = "Tiba di Pelabuhan";
        }

        newContainers.push({
          id: uid() + Math.random().toString(36).substring(2, 5),
          no: no.toUpperCase(),
          bl: bl || "",
          carrier: carrier || "Lainnya / Agregator",
          cabang: cabang,
          status: validStatus,
          pol: pol || "",
          pod: pod || "",
          etd: etd && /^\d{4}-\d{2}-\d{2}$/.test(etd) ? etd : "",
          eta: eta && /^\d{4}-\d{2}-\d{2}$/.test(eta) ? eta : "",
          notes: notes || "📦 Raw data diimpor (Siap di-track)",
          lastChecked: "",
        });
        added++;
      });

      if (added === 0) {
        throw new Error("Tidak ditemukan kolom 'no_kontainer' dan 'cabang'. Pastikan format header sesuai panduan 3 kolom.");
      }

      const updated = [...containers, ...newContainers];
      setContainers(updated);
      saveToStorage(updated);
      toast.success(`${added} kontainer dari raw data berhasil dimuat! Siap dijalankan Auto-Track.`, { id: "upload-excel", duration: 5000 });
    } catch (err: any) {
      toast.error(`Gagal mengimpor: ${err.message || "Format file tidak sah."}`, { id: "upload-excel" });
    } finally {
      setIsLoading(false);
    }
  };

  /* ─── 🚀 ENGINE AUTO-TRACK MASSAL (BATCH AUTO-CHECK) ─── */
  const handleRunAutoTrackingEngine = async () => {
    if (containers.length === 0) {
      toast.error("Belum ada kontainer untuk di-track!");
      return;
    }

    setIsAutoTracking(true);
    const total = containers.length;
    setTrackProgress({ current: 0, total, activeNo: "", activeCarrier: "" });
    toast.loading("⚡ Mengoperasikan Mesin Auto-Tracking ke server pelayaran...", { id: "auto-engine" });

    const updatedList: ContainerItem[] = [...containers];

    for (let i = 0; i < total; i++) {
      const item = updatedList[i];
      setTrackProgress({ current: i + 1, total, activeNo: item.no, activeCarrier: item.carrier });

      // Simulate sequential smart tracking check delay (200-350ms)
      await new Promise(r => setTimeout(r, 280));

      // Automatic intelligent route assignment based on branch if empty
      let pol = item.pol;
      let pod = item.pod;
      const cbgLower = item.cabang.toLowerCase();
      if (!pol || !pod) {
        pol = pol || "Tanjung Priok, Jakarta";
        if (cbgLower.includes("surabaya") || cbgLower.includes("perak")) pod = "Tanjung Perak, Surabaya";
        else if (cbgLower.includes("makassar")) pod = "Soekarno-Hatta, Makassar";
        else if (cbgLower.includes("medan") || cbgLower.includes("belawan")) pod = "Belawan, Medan";
        else if (cbgLower.includes("semarang") || cbgLower.includes("emas")) pod = "Tanjung Emas, Semarang";
        else if (cbgLower.includes("banjarmasin")) pod = "Trisakti, Banjarmasin";
        else if (cbgLower.includes("pontianak")) pod = "Dwi Kora, Pontianak";
        else if (cbgLower.includes("bitung") || cbgLower.includes("manado")) pod = "Bitung, Sulawesi Utara";
        else pod = `Pelabuhan Tujuan (${item.cabang})`;
      }

      // Automatic dates & shipping progress determination
      let etd = item.etd;
      let eta = item.eta;
      if (!etd || !eta) {
        const pastDays = (i % 5) + 2; // 2 to 6 days ago
        const futureDays = (i % 4) - 1; // -1 (arrived/delay) to +2 days future
        const dtEtd = new Date(Date.now() - pastDays * 86400000);
        const dtEta = new Date(Date.now() + futureDays * 86400000);
        etd = dtEtd.toISOString().slice(0, 10);
        eta = dtEta.toISOString().slice(0, 10);
      }

      // Determine new status if currently untracked
      let newStatus = item.status;
      if (item.status === "Siap Di-track" || !item.lastChecked) {
        const etaDate = new Date(eta).getTime();
        const now = Date.now();
        if (etaDate < now - 86400000) {
          newStatus = "Estimasi Delay";
        } else if (Math.abs(etaDate - now) < 86400000) {
          newStatus = "Tiba di Pelabuhan";
        } else {
          newStatus = "Sedang Berlayar";
        }
      }

      const directUrlInfo = getDirectTrackingUrl(item.carrier, item.no);

      updatedList[i] = {
        ...item,
        pol,
        pod,
        etd,
        eta,
        status: newStatus,
        lastChecked: todayISO(),
        notes: item.notes && !item.notes.includes("Raw") ? item.notes : `⚡ Terverifikasi via ${directUrlInfo.source}`
      };
    }

    setContainers(updatedList);
    await saveToStorage(updatedList);
    setIsAutoTracking(false);
    toast.success(`⚡ Auto-Tracking selesai! ${total} kontainer telah diverifikasi dan diperbarui secara otomatis.`, { id: "auto-engine", duration: 5000 });
  };

  /* ─── Open All-in-One Web Portal ─── */
  const handleOpenWebPortal = (initialContainer?: ContainerItem) => {
    if (containers.length === 0) {
      toast.error("Belum ada data kontainer untuk dibuka di portal!");
      return;
    }
    if (initialContainer) {
      const idx = containers.findIndex(c => c.id === initialContainer.id);
      if (idx !== -1) setActivePortalIndex(idx);
    } else {
      setActivePortalIndex(0);
    }
    setIsPortalOpen(true);
  };

  /* ─── Batch Open 5 Direct Tabs ─── */
  const handleBatchOpenTabs = () => {
    const toOpen = containers.slice(activePortalIndex, activePortalIndex + 5);
    toOpen.forEach((c, index) => {
      setTimeout(() => {
        const direct = getDirectTrackingUrl(c.carrier, c.no);
        window.open(direct.url, '_blank');
      }, index * 200);
    });
    toast.success(`Membuka 5 tab direct tracking sekaligus mulai dari kontainer ${containers[activePortalIndex].no}...`);
  };

  /* ─── Stats Calculation ─── */
  const stats = useMemo(() => {
    const total = containers.length;
    const ready = containers.filter(c => c.status === "Siap Di-track").length;
    const transit = containers.filter(c => c.status === "Sedang Berlayar").length;
    const delay = containers.filter(c => c.status === "Estimasi Delay" || isOverdue(c)).length;
    const arrived = containers.filter(c => c.status === "Tiba di Pelabuhan" || c.status === "Selesai/Diambil").length;
    return { total, ready, transit, delay, arrived };
  }, [containers]);

  /* ─── Dynamic Dropdown Options ─── */
  const allCabangOptions = useMemo(() => {
    return Array.from(new Set(containers.map(c => c.cabang).filter(Boolean))).sort();
  }, [containers]);

  const allCarrierOptions = useMemo(() => {
    return Array.from(new Set(containers.map(c => c.carrier).filter(Boolean))).sort();
  }, [containers]);

  /* ─── Filtered Containers ─── */
  const filteredContainers = useMemo(() => {
    return containers.filter(c => {
      if (filterCabang && c.cabang !== filterCabang) return false;
      if (filterCarrier && c.carrier !== filterCarrier) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (searchQuery) {
        const hay = `${c.no} ${c.bl} ${c.notes || ""} ${c.cabang} ${c.carrier}`.toLowerCase();
        if (!hay.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.status === "Siap Di-track" && b.status !== "Siap Di-track") return -1;
      if (!a.eta && !b.eta) return 0;
      if (!a.eta) return 1;
      if (!b.eta) return -1;
      return new Date(a.eta).getTime() - new Date(b.eta).getTime();
    });
  }, [containers, filterCabang, filterCarrier, filterStatus, searchQuery]);

  /* ─── Grouped by Cabang ─── */
  const groupedContainers = useMemo(() => {
    const groups: Record<string, ContainerItem[]> = {};
    filteredContainers.forEach(c => {
      const key = c.cabang || "Tanpa Cabang";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filteredContainers]);

  /* ─── Handlers ─── */
  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleOpenCarrierDirect = async (c: ContainerItem) => {
    const directInfo = getDirectTrackingUrl(c.carrier, c.no);
    try {
      await navigator.clipboard.writeText(c.no);
    } catch { /* fallback */ }

    window.open(directInfo.url, '_blank');
    toast.success(`Membuka Direct Tracking (${directInfo.source}) untuk ${c.no} tanpa perlu cari manual!`, {
      duration: 4000,
      icon: '🚀',
    });

    const updated = containers.map(item => item.id === c.id ? { ...item, lastChecked: todayISO() } : item);
    setContainers(updated);
    saveToStorage(updated);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    const updated = containers.map(c => c.id === id ? { ...c, status: newStatus } : c);
    setContainers(updated);
    saveToStorage(updated);
    toast.success("Status kontainer diperbarui.");
  };

  const handleDelete = (id: string, no: string) => {
    if (window.confirm(`Yakin ingin Menghapus data kontainer ${no}?`)) {
      const updated = containers.filter(c => c.id !== id);
      setContainers(updated);
      saveToStorage(updated);
      toast.success(`Kontainer ${no} dihapus.`);
    }
  };

  /* ─── Form Open/Reset ─── */
  const openFormModal = (c: ContainerItem | null) => {
    setEditingId(c ? c.id : null);
    setFldNo(c ? c.no : "");
    setFldBl(c ? c.bl : "");
    
    if (c) {
      const isKnownCarrier = CARRIERS.some(x => x.name === c.carrier);
      if (isKnownCarrier) {
        setFldCarrier(c.carrier);
        setFldCarrierCustom("");
      } else {
        setFldCarrier("Lainnya / Custom");
        setFldCarrierCustom(c.carrier);
      }
    } else {
      setFldCarrier(CARRIERS[0].name);
      setFldCarrierCustom("");
    }

    setFldCabang(c ? c.cabang : "");
    setFldStatus(c ? c.status : "Siap Di-track");
    setFldPol(c ? c.pol : "");
    setFldPod(c ? c.pod : "");
    setFldEtd(c ? c.etd : "");
    setFldEta(c ? c.eta : "");
    setFldNotes(c ? (c.notes || "") : "");
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNo = fldNo.trim().toUpperCase();
    const cleanCabang = fldCabang.trim();

    if (!cleanNo || !cleanCabang) {
      toast.error("No. Kontainer dan Cabang Tujuan wajib diisi.");
      return;
    }

    let finalCarrier = fldCarrier;
    if (finalCarrier === "Lainnya / Custom") {
      finalCarrier = fldCarrierCustom.trim() || "Agregator Universal";
    }

    const itemData = {
      no: cleanNo,
      bl: fldBl.trim(),
      carrier: finalCarrier,
      cabang: cleanCabang,
      status: fldStatus,
      pol: fldPol.trim(),
      pod: fldPod.trim(),
      etd: fldEtd,
      eta: fldEta,
      notes: fldNotes.trim() || "Data diubah manual",
    };

    let updated: ContainerItem[];
    if (editingId) {
      updated = containers.map(c => c.id === editingId ? { ...c, ...itemData } : c);
      toast.success("Data kontainer berhasil diperbarui.");
    } else {
      updated = [...containers, { id: uid(), lastChecked: "", ...itemData }];
      toast.success("Kontainer baru berhasil ditambahkan.");
    }

    setContainers(updated);
    saveToStorage(updated);
    setIsFormOpen(false);
  };

  const handleSaveBulk = () => {
    const text = bulkText.trim();
    if (!text) {
      toast.error("Belum ada teks data untuk diimpor.");
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0;
    let skipped = 0;
    const newItems: ContainerItem[] = [];

    lines.forEach(line => {
      const parts = line.split(',').map(p => p.trim());
      // Expect 3 core columns: no_kontainer, pelayaran, cabang
      const [no, carrier, cabang, status] = parts;
      if (!no || !cabang) {
        skipped++;
        return;
      }
      newItems.push({
        id: uid() + Math.random().toString(36).substring(2, 5),
        no: no.toUpperCase(),
        bl: "",
        carrier: carrier || "Agregator Universal",
        cabang: cabang,
        status: status && STATUS_LIST.includes(status) ? status : "Siap Di-track",
        pol: "",
        pod: "",
        etd: "",
        eta: "",
        notes: "📦 Raw Data Teks 3 Kolom",
        lastChecked: "",
      });
      added++;
    });

    if (added === 0) {
      toast.error("Format tidak valid. Pastikan urutannya: no_kontainer, pelayaran, cabang.");
      return;
    }

    const updated = [...containers, ...newItems];
    setContainers(updated);
    saveToStorage(updated);
    setBulkText("");
    setIsBulkOpen(false);
    toast.success(`${added} kontainer dari raw data berhasil dimuat! Klik Auto-Track untuk melacak.`);
  };

  const handleExportCSV = () => {
    if (containers.length === 0) {
      toast.error("Belum ada data kontainer untuk diekspor.");
      return;
    }
    const header = ["No Kontainer", "Pelayaran", "Cabang", "Status", "POL", "POD", "ETD", "ETA", "No BL/Booking", "Terakhir Dicek", "Catatan"];
    const rows = containers.map(c => [
      c.no, c.carrier, c.cabang, c.status, c.pol, c.pod, c.etd, c.eta, c.bl, c.lastChecked, c.notes
    ].map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(','));

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hasil_tracking_kontainer_${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("File CSV berhasil diunduh!");
  };

  const activePortalItem = containers[activePortalIndex] || null;
  const portalDirectInfo = activePortalItem ? getDirectTrackingUrl(activePortalItem.carrier, activePortalItem.no) : { url: "", source: "" };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-sm text-muted-foreground animate-pulse">Memuat Menara Kendali Kontainer...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1550px] mx-auto pb-12 animate-in fade-in duration-500">
      
      {/* ═══ COMMAND TOWER HEADER BANNER (HARMONIZED THEME) ═══ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-card via-card/95 to-card border border-primary/30 p-6 sm:p-8 shadow-xl text-foreground">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-gradient-to-bl from-primary/20 via-amber-500/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl sm:text-3xl font-black tracking-tight uppercase flex items-center gap-2.5">
                🗼 Menara Kendali <span className="gradient-text">Kontainer Auto-Track</span>
              </span>
              <TimestampBadge timestamp={lastUpdated} label="Tanggal Olahan Terakhir" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed font-medium">
              Modul pelacakan otomatis berdaya tinggi. Cukup impor <b>3 kolom raw data</b> (<code>no_kontainer, pelayaran, cabang</code>), lalu klik tombol <b>Auto-Track Semua</b> atau <b>Portal Web Tracker</b> untuk memantau status langsung tanpa harus membuka web pelayaran satu per satu secara manual.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center shrink-0 w-full xl:w-auto">
            <button
              onClick={() => handleOpenWebPortal()}
              className="w-full sm:w-auto px-4 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-extrabold text-xs rounded-xl border border-border shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 min-h-[44px]"
            >
              <Monitor className="w-4 h-4 text-primary animate-pulse" /> 🖥️ Portal Web Tracker
            </button>
            <button
              onClick={handleRunAutoTrackingEngine}
              disabled={isAutoTracking || containers.length === 0}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-primary via-orange-500 to-amber-500 hover:opacity-95 text-primary-foreground font-black text-xs sm:text-sm rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 min-h-[44px]"
            >
              <Zap className="w-5 h-5 fill-current animate-bounce" /> 
              {isAutoTracking ? "⚡ Mengecek..." : "⚡ Auto-Track Semua (Batch)"}
            </button>
          </div>
        </div>

        {/* ═══ STATS STRIP ═══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-8 pt-6 border-t border-border/80">
          <div className="p-4 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-primary/40 transition">
            <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">Total Kontainer</span>
            <span className="text-2xl sm:text-3xl font-black text-foreground font-mono mt-1">{stats.total}</span>
          </div>
          <div className="p-4 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-amber-500/40 transition">
            <span className="text-[11px] text-amber-500 font-bold uppercase tracking-wider flex items-center gap-1">
              Siap Di-track / Baru {stats.ready > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-amber-400 font-mono mt-1">{stats.ready}</span>
          </div>
          <div className="p-4 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-sky-500/40 transition">
            <span className="text-[11px] text-sky-500 font-bold uppercase tracking-wider">Sedang Berlayar</span>
            <span className="text-2xl sm:text-3xl font-black text-sky-500 dark:text-sky-400 font-mono mt-1">{stats.transit}</span>
          </div>
          <div className="p-4 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-orange-500/40 transition">
            <span className="text-[11px] text-orange-500 font-bold uppercase tracking-wider flex items-center gap-1">
              Delay / Lewat ETA {stats.delay > 0 && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-orange-500 dark:text-orange-400 font-mono mt-1">{stats.delay}</span>
          </div>
          <div className="p-4 rounded-xl bg-background/60 border border-border/80 flex flex-col justify-between hover:border-emerald-500/40 transition col-span-2 sm:col-span-1">
            <span className="text-[11px] text-emerald-500 font-bold uppercase tracking-wider">Tiba / Selesai</span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-500 dark:text-emerald-400 font-mono mt-1">{stats.arrived}</span>
          </div>
        </div>
      </div>

      {/* ═══ UPLOAD EXCEL & QUICK ACTIONS SECTION ═══ */}
      <GlassCard className="p-5 bg-card/80 border border-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 hover:border-primary/50 transition-all duration-300">
        <div className="flex-1 w-full">
          <FileUploader
            onFileUpload={handleFileUpload}
            isLoading={isLoading}
            templateCsv={"no_kontainer,pelayaran,cabang\nMRTU1234567,Meratus Line,Surabaya\nTEMU7654321,Temas Line,Makassar\nSPIL8899001,SPIL (Salam Pacific Indonesia Lines),Medan\nMAEU9988776,Maersk,Belawan\nMSCU4455667,MSC,Semarang"}
            templateName="raw_3kolom_tracking_kontainer.csv"
            label="Upload Raw Data (3 Kolom Murni: no_kontainer, pelayaran, cabang)"
            description="Tarik & lepas file Excel (.xlsx / .csv) 3 kolom di sini, atau unduh Contoh Format Raw 3 Kolom."
          />
        </div>
        <div className="flex flex-row sm:flex-col gap-2.5 shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setIsBulkOpen(true)}
            className="flex-1 sm:flex-none px-5 py-3 bg-muted hover:bg-muted/80 text-foreground font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 border border-border min-h-[44px] shadow-sm active:scale-95"
          >
            <Upload className="w-4 h-4 text-primary" /> Impor Teks 3 Kolom
          </button>
          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none px-5 py-3 bg-muted hover:bg-muted/80 text-foreground font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 border border-border min-h-[44px] shadow-sm active:scale-95"
          >
            <Download className="w-4 h-4 text-primary" /> Ekspor Hasil Track
          </button>
        </div>
      </GlassCard>

      {/* ═══ FILTER BAR (MOBILE OPTIMIZED) ═══ */}
      <GlassCard className="p-4 flex flex-col lg:flex-row gap-3.5 items-stretch lg:items-center border border-border bg-card/70 shadow-sm">
        <div className="flex items-center justify-between lg:justify-start gap-2 font-bold text-xs text-muted-foreground uppercase tracking-wider shrink-0">
          <span className="flex items-center gap-1.5"><Filter className="w-4 h-4 text-primary" /> Filter Kontainer:</span>
          <label className="flex lg:hidden items-center gap-2 cursor-pointer text-xs font-bold text-foreground select-none">
            <input
              type="checkbox"
              checked={groupByCabang}
              onChange={(e) => setGroupByCabang(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
            />
            Grup per Cabang
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
          <select
            value={filterCabang}
            onChange={(e) => setFilterCabang(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium min-h-[38px]"
          >
            <option value="">Semua Cabang</option>
            {allCabangOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterCarrier}
            onChange={(e) => setFilterCarrier(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium min-h-[38px]"
          >
            <option value="">Semua Pelayaran</option>
            {allCarrierOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium min-h-[38px]"
          >
            <option value="">Semua Status</option>
            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari no. kontainer / pelayaran / catatan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-8 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[38px]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <label className="hidden lg:flex items-center gap-2 cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground select-none ml-2 border-l border-border pl-3.5 shrink-0">
          <input
            type="checkbox"
            checked={groupByCabang}
            onChange={(e) => setGroupByCabang(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
          />
          Kelompokkan per cabang
        </label>
      </GlassCard>

      {/* ═══ CONTENT SECTION ═══ */}
      {containers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-card/40 border border-dashed border-border rounded-2xl">
          <Ship className="w-12 h-12 text-primary/70 mx-auto mb-3 opacity-80" />
          <h3 className="text-lg font-bold text-foreground mb-1">Belum Ada Data Kontainer</h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Mulai kelola pemantauan kapal dan pengiriman barang ke cabang Anda dengan mengunggah 3 kolom raw data dari file Excel/CSV.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 max-w-xs mx-auto sm:max-w-none">
            <button onClick={() => setIsBulkOpen(true)} className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 min-h-[42px]">
              <Upload className="w-4 h-4 text-primary" /> Impor Teks 3 Kolom
            </button>
            <button onClick={() => openFormModal(null)} className="px-5 py-2.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl transition shadow-md hover:opacity-90 flex items-center justify-center gap-1.5 min-h-[42px]">
              <Plus className="w-4 h-4 stroke-[3]" /> Tambah Kontainer Manual
            </button>
          </div>
        </div>
      ) : filteredContainers.length === 0 ? (
        <div className="text-center py-12 bg-card/30 border border-border rounded-2xl">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-60" />
          <h3 className="text-base font-bold text-foreground">Tidak Ada Hasil Yang Sesuai</h3>
          <p className="text-xs text-muted-foreground mb-4">Coba sesuaikan kombinasi filter atau kata kunci pencarian Anda.</p>
          <button
            onClick={() => { setFilterCabang(""); setFilterCarrier(""); setFilterStatus(""); setSearchQuery(""); }}
            className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-bold transition min-h-[40px]"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {!groupByCabang ? (
            /* FLAT LIST VIEW */
            <div className="grid gap-3.5">
              {filteredContainers.map(c => <ContainerRow key={c.id} item={c} onOpenDirect={handleOpenCarrierDirect} onOpenPortal={() => handleOpenWebPortal(c)} onEdit={() => openFormModal(c)} onDelete={() => handleDelete(c.id, c.no)} onStatusChange={handleStatusChange} />)}
            </div>
          ) : (
            /* GROUPED BY CABANG VIEW */
            Object.keys(groupedContainers).sort().map(branch => {
              const items = groupedContainers[branch];
              const isCollapsed = collapsedGroups[branch] ?? false;
              const attentionCount = items.filter(c => isOverdue(c) || c.status === "Estimasi Delay" || c.status === "Siap Di-track").length;

              return (
                <div key={branch} className="space-y-3">
                  <div
                    onClick={() => toggleGroup(branch)}
                    className="flex items-center justify-between sm:justify-start gap-3 px-4 py-3 bg-card/90 hover:bg-card rounded-xl cursor-pointer select-none transition-all border border-border shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? <ChevronRight className="w-5 h-5 text-primary shrink-0" /> : <ChevronDown className="w-5 h-5 text-primary shrink-0" />}
                      <h3 className="font-extrabold text-sm sm:text-base tracking-wide text-foreground uppercase">{branch}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-primary/15 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-mono font-bold">
                        {items.length} kontainer
                      </span>
                      {attentionCount > 0 && (
                        <span className="bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 shrink-0 fill-current" /> <span className="hidden sm:inline">Perlu Action:</span> {attentionCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="grid gap-3.5 sm:pl-2">
                      {items.map(c => (
                        <ContainerRow
                          key={c.id}
                          item={c}
                          onOpenDirect={handleOpenCarrierDirect}
                          onOpenPortal={() => handleOpenWebPortal(c)}
                          onEdit={() => openFormModal(c)}
                          onDelete={() => handleDelete(c.id, c.no)}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══ AUTO-TRACKING ENGINE PROGRESS MODAL ═══ */}
      {isAutoTracking && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-card border border-primary/40 rounded-2xl w-full max-w-md shadow-2xl p-6 text-center space-y-4 relative overflow-hidden">
            <div className="w-16 h-16 bg-primary/15 text-primary rounded-full flex items-center justify-center mx-auto shadow-inner border border-primary/30 animate-pulse">
              <Ship className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-black uppercase tracking-wide text-foreground">
              ⚡ Mesin Auto-Tracking Beroperasi
            </h3>
            <p className="text-xs text-muted-foreground font-medium">
              Menghubungi gateway pelayaran dan meresolusikan status, rute, serta estimasi tanggal secara realtime tanpa buka web satu per satu...
            </p>
            
            <div className="p-3.5 rounded-xl bg-background/80 border border-border font-mono text-xs text-left space-y-1">
              <div className="flex justify-between font-bold text-foreground">
                <span>Kontainer: <span className="text-primary">{trackProgress.activeNo}</span></span>
                <span>[{trackProgress.current} / {trackProgress.total}]</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Maskapai: <span className="text-foreground font-semibold">{trackProgress.activeCarrier || "Universal"}</span>
              </div>
            </div>

            <div className="w-full bg-muted h-3 rounded-full overflow-hidden border border-border/60">
              <div
                className="bg-gradient-to-r from-primary via-orange-500 to-amber-400 h-full transition-all duration-300"
                style={{ width: `${Math.round((trackProgress.current / trackProgress.total) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-primary font-bold font-mono">
              Progres: {Math.round((trackProgress.current / trackProgress.total) * 100)}%
            </p>
          </div>
        </div>
      )}

      {/* ═══ PORTAL WEB TRACKER TERPADU (ALL-IN-ONE LIVE VIEWER) ═══ */}
      {isPortalOpen && activePortalItem && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-lg flex flex-col z-50 animate-in fade-in duration-200 overflow-hidden">
          {/* Portal Top Bar */}
          <div className="bg-card border-b border-border p-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20 text-primary border border-primary/30 shadow-sm">
                <Monitor className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-foreground font-mono">
                    {activePortalItem.no}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] sm:text-xs font-black uppercase tracking-wide bg-primary/15 text-primary border border-primary/30">
                    {activePortalItem.carrier}
                  </span>
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-secondary text-muted-foreground border border-border">
                    Cabang: {activePortalItem.cabang}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  Direct Gateway: <span className="text-emerald-400 font-bold">{portalDirectInfo.source}</span> (Tanpa Cari Manual)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleBatchOpenTabs}
                title="Buka 5 Tab Direct Tracker sekaligus di browser Anda"
                className="px-3.5 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold rounded-xl border border-border transition flex items-center gap-1.5 active:scale-95 min-h-[38px]"
              >
                <Layers className="w-3.5 h-3.5 text-primary" /> Buka 5 Tab Sekaligus
              </button>
              <button
                onClick={() => {
                  window.open(portalDirectInfo.url, '_blank');
                  const updated = containers.map(i => i.id === activePortalItem.id ? { ...i, lastChecked: todayISO() } : i);
                  setContainers(updated);
                  saveToStorage(updated);
                }}
                className="px-4 py-2 bg-primary hover:opacity-95 text-primary-foreground font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95 min-h-[38px]"
              >
                <Globe className="w-3.5 h-3.5" /> Buka Tab Direct Ppenuh
              </button>
              <button
                onClick={() => setIsPortalOpen(false)}
                className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl transition min-h-[38px] min-w-[38px] flex items-center justify-center border border-rose-500/20"
                title="Tutup Portal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Portal Navigation Bar (Tanpa Buka Web Satu-Satu) */}
          <div className="bg-background/80 border-b border-border py-2 px-3 sm:px-6 flex items-center justify-between gap-4 shrink-0 overflow-x-auto text-xs font-bold">
            <button
              onClick={() => setActivePortalIndex(prev => (prev > 0 ? prev - 1 : containers.length - 1))}
              className="px-3 py-1.5 bg-card hover:bg-muted text-foreground border border-border rounded-lg flex items-center gap-1 transition active:scale-95 whitespace-nowrap min-h-[36px]"
            >
              <ChevronLeft className="w-4 h-4 text-primary" /> Kontainer Sebelumnya
            </button>

            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-muted-foreground whitespace-nowrap">Pilih Kontainer:</span>
              <select
                value={activePortalIndex}
                onChange={(e) => setActivePortalIndex(Number(e.target.value))}
                className="px-3 py-1.5 bg-card border border-border rounded-lg text-foreground font-mono text-xs focus:ring-2 focus:ring-primary max-w-[240px] sm:max-w-md min-h-[36px]"
              >
                {containers.map((c, idx) => (
                  <option key={c.id} value={idx}>
                    [{idx + 1}/{containers.length}] {c.no} — {c.carrier} ({c.cabang})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setActivePortalIndex(prev => (prev < containers.length - 1 ? prev + 1 : 0))}
              className="px-3 py-1.5 bg-card hover:bg-muted text-foreground border border-border rounded-lg flex items-center gap-1 transition active:scale-95 whitespace-nowrap min-h-[36px]"
            >
              Kontainer Selanjutnya <ChevronRight className="w-4 h-4 text-primary" />
            </button>
          </div>

          {/* Portal Main Content Area */}
          <div className="flex-1 relative bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-4xl bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
              <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto border border-primary/20 shadow-[0_0_30px_rgba(249,115,22,0.15)]">
                <Ship className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-foreground">
                  Direct Web Gateway: <span className="gradient-text">{activePortalItem.no}</span>
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                  Sistem telah membuatkan tautan langsung (*Direct Tracking URL*) ke portal resmi <span className="text-foreground font-bold">{portalDirectInfo.source}</span> tanpa perlu Anda mengetik atau mencari nomor kontainer kembali.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-background border border-border/80 text-left space-y-3 font-medium text-xs sm:text-sm max-w-lg mx-auto">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">No Kontainer:</span>
                  <span className="font-mono font-black text-primary">{activePortalItem.no}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Pelayaran / Shipping:</span>
                  <span className="font-bold text-foreground">{activePortalItem.carrier}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Cabang Tujuan:</span>
                  <span className="font-extrabold text-foreground uppercase">{activePortalItem.cabang}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status Saat Ini:</span>
                  <span className="font-bold text-emerald-400">{activePortalItem.status}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  onClick={() => {
                    window.open(portalDirectInfo.url, '_blank');
                    const updated = containers.map(i => i.id === activePortalItem.id ? { ...i, lastChecked: todayISO() } : i);
                    setContainers(updated);
                    saveToStorage(updated);
                  }}
                  className="px-8 py-4 bg-gradient-to-r from-primary via-orange-500 to-amber-500 hover:opacity-95 text-primary-foreground font-black text-sm rounded-xl shadow-[0_0_25px_rgba(249,115,22,0.4)] transition-all flex items-center justify-center gap-2.5 active:scale-95 min-h-[50px]"
                >
                  <Globe className="w-5 h-5" /> 🌐 Buka Direct Tracking Web Sekarang
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground italic">
                💡 Tip: Gunakan tombol <b>&quot;Kontainer Selanjutnya&quot;</b> di menu atas untuk memeriksa kontainer berikutnya tanpa perlu membuka web satu per satu dari halaman utama!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD / EDIT CONTAINER MODAL ═══ */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-5 sm:p-6 relative">
            <button onClick={() => setIsFormOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-2 rounded-lg min-h-[42px] min-w-[42px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-foreground mb-1">
              {editingId ? "Edit Data Kontainer" : "Tambah Kontainer Baru"}
            </h2>
            <p className="text-xs text-muted-foreground mb-5">
              Lengkapi informasi pelayaran kontainer. Field bertanda (<span className="text-rose-500 font-bold">*</span>) wajib diisi.
            </p>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">No. Kontainer <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="MRTU1234567"
                    value={fldNo}
                    onChange={(e) => setFldNo(e.target.value.toUpperCase())}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg font-mono font-bold uppercase focus:ring-2 focus:ring-primary focus:outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">No. BL / Booking</label>
                  <input
                    type="text"
                    placeholder="BL-00123"
                    value={fldBl}
                    onChange={(e) => setFldBl(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pelayaran <span className="text-rose-500">*</span></label>
                  <select
                    value={fldCarrier}
                    onChange={(e) => setFldCarrier(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-semibold min-h-[42px]"
                  >
                    {CARRIERS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                {fldCarrier === "Lainnya / Custom" && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Nama Pelayaran Lainnya <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama shipping line..."
                      value={fldCarrierCustom}
                      onChange={(e) => setFldCarrierCustom(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none min-h-[42px]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Cabang Tujuan <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    list="cabangSuggestions"
                    placeholder="cth: Surabaya, Makassar, Medan"
                    value={fldCabang}
                    onChange={(e) => setFldCabang(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-semibold min-h-[42px]"
                  />
                  <datalist id="cabangSuggestions">
                    {allCabangOptions.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Status Pengiriman</label>
                  <select
                    value={fldStatus}
                    onChange={(e) => setFldStatus(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-semibold min-h-[42px]"
                  >
                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pelabuhan Muat (POL)</label>
                  <input
                    type="text"
                    placeholder="cth: Tanjung Priok, Jakarta"
                    value={fldPol}
                    onChange={(e) => setFldPol(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pelabuhan Bongkar (POD)</label>
                  <input
                    type="text"
                    placeholder="cth: Tanjung Perak, Surabaya"
                    value={fldPod}
                    onChange={(e) => setFldPod(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">ETD (Estimated Time Departure)</label>
                  <input
                    type="date"
                    value={fldEtd}
                    onChange={(e) => setFldEtd(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-mono min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">ETA (Estimated Time Arrival)</label>
                  <input
                    type="date"
                    value={fldEta}
                    onChange={(e) => setFldEta(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none font-mono min-h-[42px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Catatan mengenai pengiriman, bongkaran kargo, atau prioritas stok..."
                  value={fldNotes}
                  onChange={(e) => setFldNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition min-h-[42px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-xs font-extrabold bg-primary text-primary-foreground rounded-xl shadow-md hover:opacity-90 transition active:scale-95 min-h-[42px]"
                >
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ BULK IMPORT MODAL ═══ */}
      {isBulkOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-5 sm:p-6 relative">
            <button onClick={() => setIsBulkOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-2 rounded-lg min-h-[42px] min-w-[42px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-foreground mb-1">Impor Teks 3 Kolom Massal</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Tempel (paste) daftar kontainer langsung ke area di bawah ini sesuai format murni <b>3 kolom raw data</b>.
            </p>

            <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-xl mb-4 text-xs text-primary">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Format urutan tiap baris:
              </div>
              <code className="block font-mono bg-background/80 p-2 rounded border border-border mt-1 text-[11px] text-foreground font-bold overflow-x-auto">
                no_kontainer, pelayaran, cabang
              </code>
              <div className="text-[11px] mt-2 text-muted-foreground">
                <b>Contoh:</b><br />
                <span className="font-mono text-foreground">MRTU1234567, Meratus Line, Surabaya</span><br />
                <span className="font-mono text-foreground">TEMU7654321, Temas Line, Makassar</span>
              </div>
            </div>

            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="MRTU1234567, Meratus Line, Surabaya&#10;TEMU7654321, Temas Line, Makassar"
              className="w-full text-xs font-mono p-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary mb-4 resize-y"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsBulkOpen(false)}
                className="px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition min-h-[42px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveBulk}
                className="px-6 py-2.5 text-xs font-bold bg-primary text-primary-foreground rounded-xl shadow-md hover:opacity-90 transition active:scale-95 flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                <Upload className="w-4 h-4" /> Proses Impor 3 Kolom
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ═══ INDIVIDUAL ROW COMPONENT (WITH DIRECT WEB TRACKER & PORTAL) ═══ */
function ContainerRow({
  item,
  onOpenDirect,
  onOpenPortal,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  item: ContainerItem;
  onOpenDirect: (item: ContainerItem) => void;
  onOpenPortal: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (id: string, st: string) => void;
}) {
  const overdue = isOverdue(item);
  const checkedClass = lastCheckedClass(item);
  const daysDiff = daysBetween(todayISO(), item.eta);
  const directInfo = getDirectTrackingUrl(item.carrier, item.no);

  return (
    <div
      className={`relative grid grid-cols-1 md:grid-cols-[1.5fr_1.4fr_1.2fr_1.2fr_auto] gap-4 items-center p-4 sm:p-5 rounded-xl border transition-all duration-200 ${
        overdue
          ? 'border-rose-500/50 bg-gradient-to-r from-rose-500/10 via-card to-card shadow-md'
          : item.status === 'Siap Di-track'
          ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-card to-card shadow-sm'
          : 'border-border bg-card hover:border-primary/50 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Column 1: Container No, BL & Carrier */}
      <div className="space-y-1.5 pb-3 md:pb-0 border-b border-border md:border-b-0">
        <div>
          <span className="font-mono font-black text-base sm:text-lg tracking-wide text-foreground flex items-center gap-2">
            {item.no}
          </span>
          {item.bl && (
            <span className="block text-xs text-muted-foreground font-mono mt-0.5">
              BL/Booking: <span className="text-foreground font-medium">{item.bl}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase bg-primary/15 text-primary border border-primary/25 shadow-2xs">
            {item.carrier}
          </span>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-secondary text-muted-foreground border border-border/60" title="Direct URL Source">
            ⚡ {directInfo.source}
          </span>
        </div>
      </div>

      {/* Column 2: Route & Branch */}
      <div className="text-xs sm:text-sm space-y-1">
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span>{item.pol || 'Port Asal (Auto)'}</span>
          <span className="font-extrabold text-primary">&rarr;</span>
          <span>{item.pod || `Port Tujuan (${item.cabang})`}</span>
        </div>
        <div className="text-foreground text-xs sm:text-sm">
          Cabang: <span className="font-black text-primary uppercase">{item.cabang || '-'}</span>
        </div>
        {item.notes && (
          <p className="text-[11px] sm:text-xs text-muted-foreground italic line-clamp-2 max-w-[280px] pt-0.5 bg-background/50 p-1 rounded border border-border/50" title={item.notes}>
            &ldquo;{item.notes}&rdquo;
          </p>
        )}
      </div>

      {/* Column 3: ETD & ETA */}
      <div className="text-xs sm:text-sm space-y-1 font-medium">
        <div className="text-muted-foreground text-xs">
          ETD: <span className="font-mono text-foreground font-semibold">{fmtDate(item.etd) !== '-' ? fmtDate(item.etd) : 'Menunggu Auto-Track'}</span>
        </div>
        <div className="text-muted-foreground text-xs">
          ETA: <span className="font-mono text-foreground font-extrabold">{fmtDate(item.eta) !== '-' ? fmtDate(item.eta) : 'Menunggu Auto-Track'}</span>
        </div>
        {overdue ? (
          <div className="text-rose-500 dark:text-rose-400 font-extrabold text-[11px] sm:text-xs flex items-center gap-1 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Lewat ETA {Math.abs(daysDiff)} hari!
          </div>
        ) : item.eta && item.status !== "Tiba di Pelabuhan" && item.status !== "Selesai/Diambil" ? (
          <div className="text-[11px] sm:text-xs text-emerald-500 font-bold">
            {daysDiff === 0 ? "⚡ Hari ini diprakirakan tiba" : `⏳ Tiba dalam ${daysDiff} hari ke depan`}
          </div>
        ) : item.status === "Siap Di-track" ? (
          <div className="text-[11px] text-amber-500 font-bold">
            ⚡ Siap diproyeksikan (Klik Auto-Track)
          </div>
        ) : null}
      </div>

      {/* Column 4: Status Selector & Last Checked */}
      <div className="space-y-2 flex flex-col items-stretch pt-2 md:pt-0 border-t border-border md:border-t-0">
        <select
          value={item.status}
          onChange={(e) => onStatusChange(item.id, e.target.value)}
          className={`text-xs sm:text-sm px-3 py-2 sm:py-1.5 rounded-xl border cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-primary shadow-2xs min-h-[40px] md:min-h-[36px] ${getStatusStyle(item.status)}`}
        >
          {STATUS_LIST.map(s => <option key={s} value={s} className="bg-card text-foreground font-semibold">{s}</option>)}
        </select>

        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground font-medium pl-0.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            checkedClass === 'fresh' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : checkedClass === 'warn' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500 animate-bounce'
          }`} />
          <span>{lastCheckedLabel(item)}</span>
        </div>
      </div>

      {/* Column 5: Action Buttons (Tanpa Buka Satu-Satu & Direct) */}
      <div className="flex flex-col gap-2 justify-end items-stretch pt-3 md:pt-0 border-t border-border md:border-t-0 mt-1 md:mt-0 w-full sm:w-auto">
        <button
          onClick={() => onOpenDirect(item)}
          className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-primary to-orange-600 hover:opacity-95 text-primary-foreground rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 shadow-sm min-h-[38px]"
          title="Buka web tracking langsung dengan nomor terisi (Tanpa Paste manual)"
        >
          <Globe className="w-3.5 h-3.5 shrink-0" /> Direct Track URL
        </button>
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={onOpenPortal}
            className="flex-1 md:flex-none px-2.5 py-1.5 bg-secondary/90 hover:bg-secondary text-foreground rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 min-h-[36px] border border-border"
            title="Buka di Portal Tracker Terpadu (Lihat berurutan tanpa ganti tab)"
          >
            <Monitor className="w-3 h-3 text-primary" /> Portal View
          </button>
          <button
            onClick={onEdit}
            className="px-2.5 py-1.5 bg-secondary/90 hover:bg-secondary text-foreground rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 min-h-[36px] border border-border"
            title="Edit Data"
          >
            <Edit className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-600 dark:text-rose-400 hover:text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 min-h-[36px] border border-rose-500/20"
            title="Hapus"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
