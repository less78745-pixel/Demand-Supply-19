from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Literal, Optional
from database import get_db, SessionLocal
from schemas.models import ProcessedResult, DspProcessingJob
import json
import asyncio
import base64
import gc
import os
import traceback
import uuid
from datetime import datetime
from fastapi.responses import Response, RedirectResponse
import httpx
import pandas as pd
import io
from services.occupancy_engine import calculate_mrp_occupancy_from_bytes, generate_mrp_template_bytes

router = APIRouter()

# ── Konfigurasi Supabase Storage (upload async: Storage -> BackgroundTasks) ──
# SUPABASE_SERVICE_ROLE_KEY WAJIB backend-only (JANGAN prefix NEXT_PUBLIC_) --
# key ini bypass Storage RLS sepenuhnya sehingga bucket bisa privat/tidak publik.
def _normalize_supabase_url(url: str) -> str:
    """Supabase Dashboard menampilkan beberapa varian URL yang mirip (Project URL
    polos vs REST API URL yang sudah menambahkan `/rest/v1`) -- salah salin salah
    satunya ke SUPABASE_URL akan menghasilkan path storage yang rusak
    (mis. `/rest/v1//storage/v1/object/...`) dan gagal dengan 401 dari gateway
    Supabase. Normalisasi di sini supaya baik salin Project URL maupun REST API
    URL sama-sama menghasilkan base URL yang benar."""
    normalized = (url or "").strip().rstrip("/")
    if normalized.endswith("/rest/v1"):
        normalized = normalized[: -len("/rest/v1")]
    return normalized

SUPABASE_URL = _normalize_supabase_url(os.getenv("SUPABASE_URL", ""))
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DSP_UPLOAD_BUCKET = os.getenv("DSP_UPLOAD_BUCKET", "dsp-raw-uploads")
# Bucket privat TERPISAH untuk workbook Excel HASIL OLAHAN (bukan file mentah
# yang diupload user) -- lihat _offload_excel_to_storage di bawah untuk alasannya.
DSP_RESULT_BUCKET = os.getenv("DSP_RESULT_BUCKET", "dsp-processed-files")

# Vercel Serverless Functions hard-cap the request/response body at 4.5MB
# regardless of plan, but the REAL bottleneck turned out to be smaller and
# earlier in the pipeline: Supabase Realtime silently DROPS postgres_changes
# broadcast events whose payload exceeds its own size limit, and a plain
# PostgREST SELECT on a huge text column is slow/fragile too. Both the sync
# endpoint (`/analyze/occupancy`) and the async worker (`_process_occupancy_job`)
# used to persist the FULL, untrimmed result straight into `processed_results`
# (previously only the *outgoing HTTP response* was trimmed, well AFTER the
# oversized row had already been written to the DB and already broadcast over
# Realtime) -- for a nationwide, many-cabang/category dataset this routinely
# produced 10-15MB+ rows (a base64-embedded Excel workbook alone was >10MB,
# plus tens of thousands of shortage_alerts rows). The Realtime event for that
# INSERT then never reaches any connected browser, so the dashboard never
# learns a new result exists and keeps showing whatever was loaded before
# (typically the demo dataset) -- even though the upload itself succeeded and
# the real data is sitting correctly in the database the whole time.
#
# Fix: trim BEFORE persisting, using one conservative budget shared by both
# storage and the HTTP response, so what's saved/broadcast/served is always
# the same, Realtime-safe payload.
PERSIST_SAFE_LIMIT_BYTES = 2 * 1024 * 1024
MAX_STORED_SHORTAGE_ALERTS = 2000

def _prepare_result_for_storage(results: dict) -> dict:
    """Trim the biggest size contributors (in order) until the payload fits
    PERSIST_SAFE_LIMIT_BYTES, or there is nothing left worth trimming. Applied
    once, right after `calculate_mrp_occupancy_from_bytes` returns -- the same
    trimmed dict is then both saved to `processed_results` and returned as the
    HTTP response, so storage/Realtime/API responses never disagree."""
    def _size(obj) -> int:
        try:
            return len(json.dumps(obj, default=str))
        except Exception:
            return 0

    if _size(results) <= PERSIST_SAFE_LIMIT_BYTES:
        return results

    warnings = []
    mrp = results.get("mrp_results")

    if isinstance(mrp, dict) and mrp.get("excel_base64"):
        mrp["excel_base64"] = None
        mrp["excel_download_unavailable"] = True
        warnings.append("File Excel hasil olahan")

    if _size(results) > PERSIST_SAFE_LIMIT_BYTES and isinstance(mrp, dict) and mrp.get("html_report"):
        mrp["html_report"] = None
        mrp["html_report_unavailable"] = True
        warnings.append("Laporan HTML")

    alerts = results.get("shortage_alerts") or []
    if _size(results) > PERSIST_SAFE_LIMIT_BYTES and len(alerts) > MAX_STORED_SHORTAGE_ALERTS:
        total = len(alerts)
        alerts_sorted = sorted(alerts, key=lambda a: a.get("deficit", 0), reverse=True)
        results["shortage_alerts"] = alerts_sorted[:MAX_STORED_SHORTAGE_ALERTS]
        results["shortage_alerts_truncated"] = True
        results["shortage_alerts_total_count"] = total
        warnings.append(f"Shortage alerts (menampilkan {MAX_STORED_SHORTAGE_ALERTS} dari {total} defisit terbesar)")

    if warnings:
        results["warning"] = (
            "Dataset sangat besar, sebagian data berikut dipangkas agar hasil tetap bisa "
            "disinkronkan secara realtime ke semua pengguna: " + "; ".join(warnings) + "."
        )

    return results


async def _offload_excel_to_storage(results: dict, path_hint: str) -> dict:
    """Upload workbook hasil olahan (mrp_results.excel_base64) ke Supabase Storage
    dan ganti field itu dengan `excel_storage_path` (string pendek) -- SELALU,
    bukan cuma saat payload kebesaran.

    Kenapa: tombol "Download Excel Hasil" sempat hilang total untuk dataset
    besar karena _prepare_result_for_storage men-strip excel_base64 begitu saja
    (workbook-nya sendiri bisa >10MB) supaya baris `processed_results` tetap
    Realtime-safe. Memindahkan file itu ke Storage menghilangkan trade-off itu:
    baris tetap kecil (cuma menyimpan path, bukan isi filenya), TAPI file-nya
    tetap bisa diunduh kapan saja lewat endpoint /analyze/occupancy/download-excel
    yang men-generate signed URL sesaat sebelum dipakai (service-role key tidak
    pernah dikirim ke browser).

    Gagal upload (mis. Storage belum dikonfigurasi) TIDAK menggagalkan seluruh
    request -- excel_base64 dibiarkan apa adanya, lalu _prepare_result_for_storage
    yang akan men-strip-nya kalau memang kebesaran (perilaku lama sebagai fallback)."""
    mrp = results.get("mrp_results")
    if not isinstance(mrp, dict) or not mrp.get("excel_base64"):
        return results
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return results

    try:
        raw_bytes = base64.b64decode(mrp["excel_base64"])
        upload_url = f"{SUPABASE_URL}/storage/v1/object/{DSP_RESULT_BUCKET}/{path_hint}"
        headers = {
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "x-upsert": "true",
        }
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            resp = await client.post(upload_url, headers=headers, content=raw_bytes)
            resp.raise_for_status()
        mrp["excel_base64"] = None
        mrp["excel_storage_path"] = path_hint
    except Exception as exc:
        print(f"[WARN] _offload_excel_to_storage GAGAL upload ke {path_hint}: {type(exc).__name__}: {exc}")
        traceback.print_exc()

    return results


@router.get("/analyze/occupancy/download-excel")
async def download_occupancy_excel(path: str):
    """Generate signed URL berumur pendek (5 menit) untuk file di DSP_RESULT_BUCKET
    lalu redirect klien ke sana. Dipanggil oleh tombol "Download Excel Hasil" di
    frontend saat `mrp_results.excel_storage_path` ada (lihat _offload_excel_to_storage) --
    service-role key dipakai hanya di sisi server, tidak pernah sampai ke browser."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Supabase Storage belum dikonfigurasi di backend")

    try:
        sign_url = f"{SUPABASE_URL}/storage/v1/object/sign/{DSP_RESULT_BUCKET}/{path}"
        headers = {"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "apikey": SUPABASE_SERVICE_ROLE_KEY}
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            resp = await client.post(sign_url, headers=headers, json={"expiresIn": 300})

            # Supabase Storage returns 400 (not 404) for missing objects with body
            # {"statusCode":"404","error":"not_found","message":"Object not found",...}
            if resp.status_code in (400, 404):
                # Try to parse the body for a clearer message
                try:
                    body = resp.json()
                    err_msg = body.get("message") or body.get("error", "")
                except Exception:
                    err_msg = ""
                if "not_found" in str(err_msg).lower() or "not found" in str(err_msg).lower() or "nosuchkey" in resp.text.lower():
                    raise HTTPException(
                        status_code=404,
                        detail="File Excel hasil olahan tidak ditemukan di Storage (mungkin sudah dihapus atau upload gagal)."
                    )
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Supabase Storage error: {err_msg or resp.text[:200]}"
                )

            resp.raise_for_status()
            signed_path = resp.json().get("signedURL")

        if not signed_path:
            raise HTTPException(status_code=500, detail="Gagal membuat signed URL untuk file Excel")

        full_url = f"{SUPABASE_URL}/storage/v1{signed_path}" if signed_path.startswith("/") else signed_path
        return RedirectResponse(full_url)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gagal mengunduh file Excel: {type(e).__name__}: {str(e)}")


@router.get("/analyze/occupancy/template")
async def get_mrp_template():
    try:
        content = generate_mrp_template_bytes()
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=Template_Occupancy_MRP_Raw_WH.xlsx"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gagal generate template: {str(e)}")

@router.post("/analyze/occupancy")
async def analyze_occupancy(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files are supported for MRP analysis")
        
    try:
        contents = await file.read()
        
        try:
            results = await asyncio.to_thread(calculate_mrp_occupancy_from_bytes, contents)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        # Pindahkan workbook Excel ke Storage (path kecil di JSON, bukan >10MB
        # base64 ter-embed) SEBELUM trimming ukuran, supaya tombol download tetap
        # berfungsi untuk dataset besar -- lihat _offload_excel_to_storage.
        results = await _offload_excel_to_storage(results, f"occupancy/sync-{uuid.uuid4()}.xlsx")

        # Trim BEFORE persisting -- see _prepare_result_for_storage for why an
        # oversized row here silently breaks Realtime delivery to the dashboard.
        results = _prepare_result_for_storage(results)

        # Save to DB for global visibility
        try:
            result_str = json.dumps(results)
            db_result = ProcessedResult(module="occupancy", result_json=result_str)
            db.add(db_result)
            db.commit()
            db.refresh(db_result)
            results["processed_at"] = (db_result.created_at or datetime.now()).isoformat()
        except Exception as e:
            print("Failed to save to DB:", e)
            results["processed_at"] = datetime.now().isoformat()

        return results
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


# ============================================================================
# UPLOAD ASINKRON (Supabase Storage -> BackgroundTasks)
# ============================================================================
# Menggantikan alur lama (raw bytes langsung ke endpoint ini) untuk file besar:
# frontend upload ke Supabase Storage dulu, endpoint di bawah hanya menerima
# path (payload kecil, tidak pernah kena limit 4.5MB Vercel), lalu file
# di-download & diproses di BackgroundTasks setelah response terkirim.

class OccupancyAsyncUploadRequest(BaseModel):
    job_id: str
    storage_path: str

class OccupancyAsyncUploadResponse(BaseModel):
    job_id: str
    status: Literal["processing"]


async def _download_raw_workbook(storage_path: str) -> bytes:
    """Unduh file mentah dari Supabase Storage (bucket privat) via service-role key.
    httpx.AsyncClient dipakai (bukan requests) supaya tidak memblokir event loop."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di environment backend"
        )

    download_url = f"{SUPABASE_URL}/storage/v1/object/{DSP_UPLOAD_BUCKET}/{storage_path}"
    # Gateway Supabase (Kong) mewajibkan header `apikey` untuk mengidentifikasi
    # project/tier API selain `Authorization` -- mengirim Authorization saja
    # (seperti sebelumnya) berakhir 401 meskipun service-role key-nya valid.
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as client:
        resp = await client.get(download_url, headers=headers)
        resp.raise_for_status()
        return resp.content


def _set_job_status(
    job_id: str,
    *,
    status: str,
    error_message: Optional[str] = None,
    result_id: Optional[int] = None,
) -> None:
    """Update baris status job memakai session DB baru & independen.
    TIDAK memakai session request (`Depends(get_db)`) karena session tsb sudah
    ditutup begitu response endpoint terkirim -- sebelum background task ini
    sempat berjalan."""
    db = SessionLocal()
    try:
        job = db.query(DspProcessingJob).filter(DspProcessingJob.id == job_id).first()
        if job is None:
            return
        job.status = status
        if error_message is not None:
            job.error_message = error_message
        if result_id is not None:
            job.result_id = result_id
        db.commit()
    finally:
        db.close()


async def _process_occupancy_job(job_id: str, storage_path: str) -> None:
    """Worker fire-and-forget: download -> parse -> simpan -> update status.
    Dipanggil lewat BackgroundTasks, di luar siklus request/response FastAPI.

    Keamanan memori saat memakai openpyxl di jalur ini:
      1. `file_bytes` (buffer mentah beberapa MB) di-`del` segera setelah parsing
         selesai -- tidak dibiarkan hidup sampai akhir fungsi.
      2. `calculate_mrp_occupancy_from_bytes` memuat workbook secara lokal
         (load_workbook dari BytesIO) dan keluar dari scope-nya begitu return --
         tidak ada Workbook yang disimpan sebagai variabel module-level di
         manapun pada codebase ini, jadi tidak ada referensi yang menggantung
         antar-request/antar-job.
      3. `gc.collect()` dipanggil eksplisit di `finally` -- berguna khusus untuk
         proses worker long-running (docker-compose) yang menangani banyak job
         berturut-turut di proses Python yang sama, karena openpyxl (via
         lxml/zipfile) bisa meninggalkan reference cycle yang baru dibersihkan
         collector generasi ke-2.
      4. Session SQLAlchemy dibuat & ditutup lokal (`SessionLocal()` ...
         `finally: db.close()`), tidak pernah menahan koneksi DB lebih lama
         dari yang diperlukan.
    """
    _set_job_status(job_id, status="processing")

    db = SessionLocal()
    try:
        file_bytes = await _download_raw_workbook(storage_path)
        try:
            results = await asyncio.to_thread(calculate_mrp_occupancy_from_bytes, file_bytes)
        finally:
            del file_bytes  # lepas buffer besar sesegera mungkin, sebelum langkah DB di bawah

        # Pindahkan workbook Excel ke Storage (path kecil di JSON, bukan >10MB
        # base64 ter-embed) SEBELUM trimming ukuran, supaya tombol download tetap
        # berfungsi untuk dataset besar -- lihat _offload_excel_to_storage.
        results = await _offload_excel_to_storage(results, f"occupancy/{job_id}.xlsx")

        # Trim BEFORE persisting -- this path previously saved the FULL,
        # untrimmed result (unlike the sync endpoint, which at least trimmed
        # the outgoing HTTP response). A 10-15MB+ row here is exactly what was
        # silently breaking the Realtime INSERT broadcast the dashboard relies
        # on to ever learn a new result exists -- see _prepare_result_for_storage.
        results = _prepare_result_for_storage(results)

        result_str = json.dumps(results)
        db_result = ProcessedResult(module="occupancy", result_json=result_str, job_id=job_id)
        db.add(db_result)
        db.commit()
        db.refresh(db_result)

        _set_job_status(job_id, status="completed", result_id=db_result.id)

    except Exception as exc:
        db.rollback()
        traceback.print_exc()
        _set_job_status(job_id, status="failed", error_message=f"{type(exc).__name__}: {exc}")

    finally:
        db.close()
        gc.collect()


@router.post("/analyze/occupancy/async", response_model=OccupancyAsyncUploadResponse)
async def analyze_occupancy_async(
    payload: OccupancyAsyncUploadRequest,
    background_tasks: BackgroundTasks,
):
    """Endpoint 'tipis': hanya menerima path file (bukan file itu sendiri),
    sehingga tidak pernah menyentuh limit payload 4.5MB Vercel. Proses berat
    (download + parse openpyxl) berjalan di background_tasks, setelah response
    ini terkirim ke client."""
    background_tasks.add_task(_process_occupancy_job, payload.job_id, payload.storage_path)
    return OccupancyAsyncUploadResponse(job_id=payload.job_id, status="processing")
