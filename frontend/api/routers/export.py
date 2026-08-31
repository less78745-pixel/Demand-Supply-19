import io
import json
import re
import traceback
import zipfile
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from schemas.models import ProcessedResult

router = APIRouter()

ALL_BRANCHES = "All"
CABANG_FIELD_CANDIDATES = ["cabang", "branch_name", "branch", "cab"]


class DualExportRequest(BaseModel):
    module_name: str
    processed_at: Optional[str] = None
    # Filter cabang aktif di halaman (mis. dari MultiSelect). ["All"] = tanpa filter.
    cabang: List[str] = Field(default_factory=lambda: [ALL_BRANCHES])
    # HTML report yang sudah dirender di client (sama seperti mode "Export HTML" lama).
    html_content: str
    # Nama file dasar (tanpa ekstensi), sudah mengikuti konvensi getStandardFilename().
    base_filename: str

    # Sumber data raw untuk Excel -- isi salah satu:
    # 1) result_id: baris ini sudah tersimpan di Supabase (tabel processed_results),
    #    backend akan fetch ulang dari DB lalu filter cabang di server (sumber paling tepercaya).
    result_id: Optional[int] = None
    # 2) rows: dipakai untuk modul yang datanya diproses/diparse di browser dan tidak
    #    pernah dipersist ke DB. Backend TETAP menerapkan ulang filter cabang di server
    #    sebelum menulis Excel, jadi hasil akhirnya tidak bergantung pada kepercayaan ke client.
    rows: Optional[List[Dict[str, Any]]] = None

    # Opsional: key di dalam result_json yang berisi list baris (kalau tidak diisi,
    # backend akan mencoba menebak dari list-of-dict pertama yang ditemukan).
    data_key: Optional[str] = None
    # Opsional: override nama kolom cabang di rows (kalau tidak diisi, auto-detect).
    cabang_field: Optional[str] = None
    # Opsional: kalau True, backend TIDAK membungkus HTML+Excel jadi .zip -- hanya
    # mengembalikan raw bytes .xlsx. Dipakai saat client juga akan membundel PPTX:
    # client menyusun SATU .zip sendiri dari html_content (string), xlsx (bytes ini),
    # dan pptx (blob) sekaligus, supaya tidak perlu mem-parse ulang zip yang sudah
    # jadi (JSZip mem-verifikasi ulang ukuran hasil dekompresi tiap entry saat
    # generate ulang, dan itu bisa gagal -- "uncompressed data size mismatch" --
    # untuk entry yang cuma perlu di-passthrough, jadi lebih aman membangun sekali
    # dari data mentah daripada unzip-lalu-rezip).
    excel_only: bool = False


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n]', "_", name or "").strip()
    return cleaned or "Export"


def _detect_cabang_field(rows: List[Dict[str, Any]]) -> Optional[str]:
    if not rows:
        return None
    keys_lower = {str(k).lower(): k for k in rows[0].keys()}
    for candidate in CABANG_FIELD_CANDIDATES:
        if candidate in keys_lower:
            return keys_lower[candidate]
    return None


def _extract_rows(result_json: Any, data_key: Optional[str]) -> List[Dict[str, Any]]:
    if isinstance(result_json, list):
        return result_json

    if isinstance(result_json, dict):
        if data_key:
            value = result_json.get(data_key)
            if not isinstance(value, list):
                raise HTTPException(
                    status_code=422,
                    detail=f"Field '{data_key}' tidak ditemukan atau bukan berupa list pada hasil proses.",
                )
            return value

        # Tanpa data_key eksplisit: pakai list-of-dict pertama yang ditemukan di level atas.
        for value in result_json.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value

    return []


def _filter_rows_by_cabang(
    rows: List[Dict[str, Any]], cabang_selection: List[str], cabang_field: Optional[str]
) -> List[Dict[str, Any]]:
    if not cabang_selection or ALL_BRANCHES in cabang_selection:
        return rows

    if not cabang_field:
        raise HTTPException(
            status_code=422,
            detail="Filter cabang diminta, tetapi kolom cabang tidak ditemukan pada data mentah.",
        )

    wanted = {str(c).strip().lower() for c in cabang_selection}
    return [r for r in rows if str(r.get(cabang_field, "")).strip().lower() in wanted]


def _excel_safe(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def _build_excel_bytes(rows: List[Dict[str, Any]]) -> bytes:
    # Union kolom antar baris (bukan cuma ambil dari baris pertama) karena hasil
    # proses per modul kerap punya baris dengan key yang tidak seragam.
    headers: List[str] = []
    seen = set()
    for row in rows:
        for key in row.keys():
            if key not in seen:
                seen.add(key)
                headers.append(key)

    wb = Workbook()
    ws = wb.active
    ws.title = "Raw Data"
    ws.append(headers)
    for row in rows:
        ws.append([_excel_safe(row.get(h)) for h in headers])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


@router.post("/export/dual")
def export_dual(payload: DualExportRequest, db: Session = Depends(get_db)):
    """Bundle laporan HTML (sudah dirender di client) + raw data Excel (difilter
    cabang di server) jadi satu file .zip, dibuat sepenuhnya in-memory (tidak ada
    file fisik yang ditulis ke disk server)."""
    try:
        if payload.result_id is None and payload.rows is None:
            raise HTTPException(
                status_code=400,
                detail="Salah satu dari 'result_id' atau 'rows' wajib diisi sebagai sumber data Excel.",
            )

        if payload.result_id is not None:
            record = (
                db.query(ProcessedResult)
                .filter(ProcessedResult.id == payload.result_id)
                .first()
            )
            if record is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Hasil proses dengan id {payload.result_id} tidak ditemukan.",
                )
            try:
                result_json = json.loads(record.result_json)
            except (TypeError, json.JSONDecodeError):
                raise HTTPException(
                    status_code=500,
                    detail="Data hasil proses tersimpan dalam format yang tidak valid.",
                )
            rows = _extract_rows(result_json, payload.data_key)
        else:
            rows = payload.rows or []

        if not rows:
            raise HTTPException(
                status_code=422,
                detail="Tidak ada data mentah yang tersedia untuk diekspor ke Excel.",
            )

        cabang_field = payload.cabang_field or _detect_cabang_field(rows)
        filtered_rows = _filter_rows_by_cabang(rows, payload.cabang, cabang_field)

        if not filtered_rows:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Tidak ada data untuk cabang yang dipilih ({', '.join(payload.cabang)}). "
                    "File Excel tidak dapat dibuat."
                ),
            )

        excel_bytes = _build_excel_bytes(filtered_rows)
        base_filename = _sanitize_filename(payload.base_filename)

        if payload.excel_only:
            excel_buffer = io.BytesIO(excel_bytes)
            headers = {"Content-Disposition": f'attachment; filename="{base_filename}.xlsx"'}
            return StreamingResponse(
                excel_buffer,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers=headers,
            )

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{base_filename}.html", payload.html_content.encode("utf-8"))
            zf.writestr(f"{base_filename}.xlsx", excel_bytes)
        zip_buffer.seek(0)

        headers = {"Content-Disposition": f'attachment; filename="{base_filename}.zip"'}
        return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")
