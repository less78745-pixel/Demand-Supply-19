from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from services.export_service import generate_excel_report

router = APIRouter()

@router.get("/export/{task_id}")
async def export_report(task_id: str):
    try:
        excel_stream = generate_excel_report(task_id)
        
        headers = {
            'Content-Disposition': f'attachment; filename="dsp_report_{task_id}.xlsx"',
            'Access-Control-Expose-Headers': 'Content-Disposition'
        }
        
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")
