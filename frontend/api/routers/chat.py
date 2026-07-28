from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, Optional
from services.llm_agent import process_chat_query

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None

@router.post("/chat")
async def chat_with_data(req: ChatRequest):
    # Pass the context (like current UI state results) to the LLM agent
    response_text = process_chat_query(req.message, req.context)
    return {"reply": response_text}
