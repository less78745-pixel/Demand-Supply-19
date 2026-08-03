from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from services.export_service import generate_excel_report

router = APIRouter()

@router.get("/export/{task_id}")
async def export_report(
    task_id: str,
    module: str = Query("DSP_Report", description="Nama Modul"),
    account: str = Query("Admin", description="Akun Pengguna")
):
    try:
        excel_stream = generate_excel_report(task_id)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        clean_module = "".join(c for c in module.replace(" ", "_") if c.isalnum() or c in "_-")
        clean_account = "".join(c for c in account.replace(" ", "_") if c.isalnum() or c in "_-")
        filename = f"{clean_module}_{timestamp}_{clean_account}.xlsx"
        
        headers = {
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
        
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")
