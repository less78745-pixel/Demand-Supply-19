"use client";
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface DspProcessingJobRow {
  id: string;
  status: JobStatus;
  error_message: string | null;
  result_id: number | null;
}

/** Menampilkan status realtime satu job upload async (dsp_processing_jobs). */
export function AsyncUploadStatus({
  jobId,
  onCompleted,
  onFailed,
}: {
  jobId: string;
  onCompleted?: (resultId: number) => void;
  onFailed?: (errorMessage: string) => void;
}) {
  const [job, setJob] = useState<DspProcessingJobRow | null>(null);
  const jobRef = useRef<DspProcessingJobRow | null>(null);

  useEffect(() => {
    let active = true;

    const applyRow = (row: DspProcessingJobRow) => {
      if (!active) return;
      jobRef.current = row;
      setJob(row);
      if (row.status === 'completed' && row.result_id) onCompleted?.(row.result_id);
      if (row.status === 'failed') onFailed?.(row.error_message || 'Gagal memproses file.');
    };

    const fetchOnce = () => {
      supabase
        .from('dsp_processing_jobs')
        .select('id, status, error_message, result_id')
        .eq('id', jobId)
        .single()
        .then(({ data }) => { if (data) applyRow(data as DspProcessingJobRow); });
    };

    fetchOnce();

    const channel = supabase
      .channel(`dsp_job_${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dsp_processing_jobs', filter: `id=eq.${jobId}` },
        (payload) => applyRow(payload.new as DspProcessingJobRow)
      )
      .subscribe();

    // Fallback polling: Supabase Realtime lewat websocket TIDAK menjamin
    // delivery 100% (tab di-background lalu di-resume, koneksi putus-sambung
    // tanpa resubscribe otomatis, dsb) -- kejadian nyata: job sudah
    // "completed" di database tapi badge status tetap macet di "processing"
    // karena event UPDATE-nya tidak pernah sampai ke klien. Polling ringan
    // ini menjamin status tetap konvergen ke nilai sebenarnya walau event
    // realtime-nya hilang, dan berhenti sendiri begitu status final tercapai.
    const pollInterval = setInterval(() => {
      const current = jobRef.current;
      if (current && (current.status === 'completed' || current.status === 'failed')) {
        clearInterval(pollInterval);
        return;
      }
      fetchOnce();
    }, 4000);

    return () => {
      active = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!job) return null;

  const statusMap: Record<JobStatus, { icon: React.ReactNode; label: string; className: string }> = {
    pending: {
      icon: <Clock className="w-4 h-4" />,
      label: 'Menunggu diproses...',
      className: 'text-muted-foreground bg-muted',
    },
    processing: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      label: 'Memproses file di background...',
      className: 'text-indigo-600 bg-indigo-50 border border-indigo-200',
    },
    completed: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      label: 'Selesai diproses',
      className: 'text-emerald-600 bg-emerald-50 border border-emerald-200',
    },
    failed: {
      icon: <XCircle className="w-4 h-4" />,
      label: job.error_message || 'Gagal memproses file',
      className: 'text-rose-600 bg-rose-50 border border-rose-200',
    },
  };

  const s = statusMap[job.status];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${s.className}`}>
      {s.icon} {s.label}
    </div>
  );
}
