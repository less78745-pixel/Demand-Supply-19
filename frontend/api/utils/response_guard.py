"""
Vercel Serverless Functions hard-cap request/response bodies at 4.5MB
regardless of plan. Exceeding it kills the whole response with an opaque
"FUNCTION_PAYLOAD_TOO_LARGE" platform error instead of a normal HTTP error
the frontend can show to the user.

`enforce_payload_budget` is a last line of defense applied to every
file-upload endpoint's successful result: if the computed response would
still be too large, degrade it (drop oversized embedded blobs, then
truncate long tables) before giving up with a clear, actionable 413.
"""
import json
from fastapi import HTTPException

RESPONSE_SAFE_LIMIT_BYTES = 4 * 1024 * 1024
LARGE_STRING_THRESHOLD = 300_000  # likely a base64 file/image or embedded HTML report


def _size(obj) -> int:
    try:
        return len(json.dumps(obj, default=str))
    except Exception:
        return 0


def _strip_large_strings(obj, notes: list):
    if isinstance(obj, dict):
        return {k: _strip_large_strings(v, notes) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_strip_large_strings(v, notes) for v in obj]
    if isinstance(obj, str) and len(obj) > LARGE_STRING_THRESHOLD:
        notes.append(len(obj))
        return None
    return obj


def _truncate_lists(obj, max_items: int, notes: list):
    if isinstance(obj, dict):
        return {k: _truncate_lists(v, max_items, notes) for k, v in obj.items()}
    if isinstance(obj, list):
        if len(obj) > max_items:
            notes.append(len(obj))
            return [_truncate_lists(v, max_items, notes) for v in obj[:max_items]]
        return [_truncate_lists(v, max_items, notes) for v in obj]
    return obj


def _append_warning(data: dict, message: str) -> None:
    existing = data.get("warning")
    data["warning"] = f"{existing} {message}" if existing else message


def enforce_payload_budget(data, limit_bytes: int = RESPONSE_SAFE_LIMIT_BYTES):
    if not isinstance(data, dict):
        return data
    if _size(data) <= limit_bytes:
        return data

    strip_notes: list = []
    stripped = _strip_large_strings(data, strip_notes)
    if strip_notes:
        _append_warning(
            stripped,
            f"{len(strip_notes)} field file/report berukuran besar dihapus dari response karena "
            "melebihi batas payload server (4.5MB). Data analisa numerik tetap lengkap.",
        )
        data = stripped
        if _size(data) <= limit_bytes:
            return data

    for max_items in (15000, 10000, 7500, 5000, 2500, 1000, 500, 100):
        trunc_notes: list = []
        candidate = _truncate_lists(data, max_items, trunc_notes)
        if _size(candidate) <= limit_bytes:
            if trunc_notes:
                _append_warning(
                    candidate,
                    f"Sebagian baris data dipotong (maks {max_items} baris pertama per tabel) karena "
                    "dataset terlalu besar untuk satu response. Pecah file input menjadi beberapa batch "
                    "untuk melihat seluruh data.",
                )
            return candidate

    raise HTTPException(
        status_code=413,
        detail="Dataset terlalu besar untuk diproses dalam satu request. Kurangi jumlah baris/kolom, "
               "atau pecah file input menjadi beberapa batch yang lebih kecil.",
    )
