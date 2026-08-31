"use client";

import React, { useState } from 'react';
import { FileCode, FileArchive } from 'lucide-react';
import { getHtmlExportString, downloadHtml, downloadBlob } from '@/utils/exportHtml';
import { buildOfflineExportHtml, ModuleExportConfig } from '@/utils/offlineExport';
import { getStandardFilename } from '@/utils/export';
import { exportDualFormat } from '@/lib/api';
import { generateMultiSlidePptxBlob, type PptxSlideSpec } from '@/utils/exportPptx';
import toast from 'react-hot-toast';

interface ExportHtmlButtonProps {
  /** Legacy mode: plain DOM-snapshot with a text-search box only. */
  elementId?: string;
  /** Preferred mode: data-driven export with real, working dropdown filters. */
  config?: ModuleExportConfig;
  moduleName: string;
  processedAt?: string;
  className?: string;
  label?: string;
  /**
   * Filter cabang yang sedang aktif di halaman (mis. dari MultiSelect cabang).
   * Sertakan bersama `resultId` atau `rawRows` untuk mengaktifkan mode
   * dual-export (HTML + Excel raw data terfilter cabang, dibundel .zip).
   * Tanpa keduanya, tombol tetap berjalan seperti sebelumnya (HTML saja).
   */
  cabang?: string[];
  /** Id baris `processed_results` di Supabase — backend fetch ulang & filter cabang di server. */
  resultId?: number;
  /** Raw rows yang sudah diparse di client (untuk modul tanpa hasil tersimpan di DB). */
  rawRows?: Record<string, unknown>[];
  /** Key di result_json yang berisi array baris data (hanya relevan bila pakai resultId). */
  dataKey?: string;
  /** Override nama kolom cabang pada rawRows, kalau auto-detect di backend tidak cocok. */
  cabangField?: string;
  /**
   * Opsional: builder slide PPTX modul ini. Dipanggil saat tombol diklik
   * (bukan saat render) supaya selalu memakai ref chart & filter yang aktif
   * saat itu, bukan closure lama. Kembalikan array kosong/null untuk skip
   * (mis. chart belum ter-mount). Saat prop ini diisi, satu klik tombol akan
   * membundel HTML(+Excel) DAN file .pptx ke dalam SATU file .zip.
   */
  pptxSlides?: () => PptxSlideSpec[] | null | undefined | Promise<PptxSlideSpec[] | null | undefined>;
  /** Nama modul untuk nama file .pptx — default ke `moduleName` bila tidak diisi. */
  pptxModuleName?: string;
}

export function ExportHtmlButton({
  elementId,
  config,
  moduleName,
  processedAt,
  className = '',
  label = 'Export',
  cabang,
  resultId,
  rawRows,
  dataKey,
  cabangField,
  pptxSlides,
  pptxModuleName,
}: ExportHtmlButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const isDualMode = resultId !== undefined || (rawRows?.length ?? 0) > 0;
  const hasPptx = !!pptxSlides;
  const isZipMode = isDualMode || hasPptx;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      toast.loading(
        hasPptx
          ? `Menyiapkan file Export (HTML${isDualMode ? ' + Excel' : ''} + PowerPoint)...`
          : (isDualMode ? 'Menyiapkan file Export (HTML + Excel)...' : 'Menyiapkan file HTML...'),
        { id: 'export-html' }
      );

      // Delay sedikit agar loading toast sempat muncul dan rendering stabil
      await new Promise(r => setTimeout(r, 500));

      const htmlString = config ? buildOfflineExportHtml(config) : getHtmlExportString(elementId!);
      const baseFilename = getStandardFilename(moduleName, processedAt);

      // Bangun PPTX-nya (bila diminta) lebih dulu, sebelum memutuskan strategi
      // unduh — supaya modul dengan pptxSlides selalu berakhir sebagai SATU
      // .zip (HTML + Excel-bila-dual + PPTX), bukan file .pptx terpisah.
      // Kegagalan di sini ditangkap sendiri supaya HTML/Excel yang sudah siap
      // tetap terunduh walau pembuatan PPTX gagal.
      let pptxBlob: Blob | null = null;
      if (pptxSlides) {
        try {
          const slides = await pptxSlides();
          if (slides && slides.length > 0) {
            pptxBlob = await generateMultiSlidePptxBlob({ slides });
          }
        } catch (pptxErr: any) {
          console.error('PPTX Export Error (melanjutkan tanpa PPTX)', pptxErr);
          toast.error('Gagal membuat PowerPoint, melanjutkan tanpa PPTX: ' + (pptxErr.message || 'Error tidak diketahui'));
        }
      }
      const pptxFilename = pptxBlob ? getStandardFilename(pptxModuleName || moduleName, processedAt, 'pptx') : null;

      if (!isDualMode && !pptxBlob) {
        // Mode paling sederhana: HTML polos, tanpa zip (perilaku lama, tidak berubah).
        const filename = getStandardFilename(moduleName, processedAt, 'html');
        downloadHtml(htmlString, filename);
        toast.success('File HTML berhasil diunduh!', { id: 'export-html' });
      } else if (!isDualMode && pptxBlob) {
        // HTML + PPTX saja (tanpa Excel) — bundel jadi satu .zip di client.
        // Konversi ke ArrayBuffer dulu: JSZip mendeteksi dukungan Blob lewat
        // FileReader, dan itu pernah gagal ("Can't read the data...") untuk
        // Blob dari sumber lain (mis. hasil pptxgenjs) — ArrayBuffer selalu
        // didukung tanpa syarat.
        const { default: JSZip } = await import('jszip');
        const pptxArrayBuffer = await pptxBlob.arrayBuffer();
        const zip = new JSZip();
        zip.file(getStandardFilename(moduleName, processedAt, 'html'), htmlString);
        zip.file(pptxFilename!, pptxArrayBuffer);
        const finalBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(finalBlob, `${baseFilename}.zip`);
        toast.success('File Export (HTML + PowerPoint) berhasil diunduh!', { id: 'export-html' });
      } else if (pptxBlob) {
        // Dual mode + PPTX: minta backend HANYA raw bytes .xlsx (bukan .zip
        // siap-pakai), lalu susun .zip-nya sendiri di client dari data mentah
        // (html string + xlsx arraybuffer + pptx arraybuffer). Sengaja TIDAK
        // memakai zip .zip bawaan backend lalu di-unzip+rezip di sini — JSZip
        // memverifikasi ulang ukuran hasil dekompresi tiap entry saat
        // meng-generate ulang sebuah zip yang di-load, dan itu bisa gagal
        // ("Bug : uncompressed data size mismatch") untuk entry yang
        // seharusnya cukup di-passthrough apa adanya. Membangun sekali dari
        // data mentah menghindari masalah itu sepenuhnya.
        // htmlContent SENGAJA TIDAK dikirim -- backend tidak membacanya sama
        // sekali di jalur excelOnly, dan HTML report ini bisa sangat besar
        // (menyertakan seluruh raw data untuk filter offline, lihat
        // offlineExport.ts), jadi mengirimnya ke sini cuma memperbesar body
        // request tanpa manfaat (penyebab 413 Payload Too Large sebelumnya).
        const excelBlob = await exportDualFormat({
          moduleName,
          processedAt,
          cabang: cabang && cabang.length > 0 ? cabang : ['All'],
          baseFilename,
          resultId,
          rows: rawRows,
          dataKey,
          cabangField,
          excelOnly: true,
        });

        const { default: JSZip } = await import('jszip');
        const [excelArrayBuffer, pptxArrayBuffer] = await Promise.all([
          excelBlob.arrayBuffer(),
          pptxBlob.arrayBuffer(),
        ]);
        const zip = new JSZip();
        zip.file(`${baseFilename}.html`, htmlString);
        zip.file(`${baseFilename}.xlsx`, excelArrayBuffer);
        zip.file(pptxFilename!, pptxArrayBuffer);
        const finalBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(finalBlob, `${baseFilename}.zip`);
        toast.success('File Export (HTML + Excel + PowerPoint) berhasil diunduh!', { id: 'export-html' });
      } else {
        // Mode dual tanpa PPTX: sama seperti cabang PPTX di atas -- minta
        // backend HANYA raw bytes .xlsx (excelOnly:true, htmlContent TIDAK
        // dikirim sama sekali) lalu susun .zip (HTML+Excel) sendiri di client.
        // Sebelumnya backend yang membungkus .zip dan menerima htmlContent
        // (yang bisa berukuran besar) di request body -- itu penyebab 413
        // Payload Too Large di semua modul yang pakai mode dual export
        // (limit ukuran body platform hosting, mis. 4.5MB di Vercel
        // Functions), apalagi `rows` sudah membawa data yang SAMA sehingga
        // data yang sama terkirim dua kali dalam satu request.
        const excelBlob = await exportDualFormat({
          moduleName,
          processedAt,
          cabang: cabang && cabang.length > 0 ? cabang : ['All'],
          baseFilename,
          resultId,
          rows: rawRows,
          dataKey,
          cabangField,
          excelOnly: true,
        });

        const { default: JSZip } = await import('jszip');
        const excelArrayBuffer = await excelBlob.arrayBuffer();
        const zip = new JSZip();
        zip.file(`${baseFilename}.html`, htmlString);
        zip.file(`${baseFilename}.xlsx`, excelArrayBuffer);
        const finalBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(finalBlob, `${baseFilename}.zip`);
        toast.success('File Export (HTML + Excel) berhasil diunduh!', { id: 'export-html' });
      }
    } catch (err: any) {
      toast.error('Gagal mengekspor: ' + (err.message || 'Error tidak diketahui'), { id: 'export-html' });
      console.error("Export Error", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-all no-export
        ${isExporting
          ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white hover:-translate-y-0.5 border border-emerald-400'
        } ${className}`}
      title={
        hasPptx
          ? (isDualMode
              ? 'Unduh HTML laporan + Excel raw data + slide PowerPoint (grafik & insight) dalam satu file .zip'
              : 'Unduh HTML laporan + slide PowerPoint (grafik & insight) dalam satu file .zip')
          : (isDualMode
              ? 'Unduh HTML laporan + Excel raw data (terfilter cabang) dalam satu file .zip'
              : 'Unduh seluruh halaman ini ke dalam bentuk file HTML interaktif statis')
      }
    >
      {isZipMode ? <FileArchive className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
      {isExporting ? 'Memproses...' : label}
    </button>
  );
}
