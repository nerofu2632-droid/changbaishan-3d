from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
import httpx
from app.core.config import settings

router = APIRouter()
BASE = "https://api.maptiler.com/"

@router.api_route("/mt/{path:path}", methods=["GET"])
async def mt_proxy(path: str, request: Request):
    if not settings.MAPTILER_KEY:
        raise HTTPException(status_code=500, detail="MAPTILER_KEY not set")

    query = dict(request.query_params)
    query["key"] = settings.MAPTILER_KEY
    url = f"{BASE}{path}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params=query)
        headers = {
            "content-type": r.headers.get("content-type", "application/octet-stream"),
            "cache-control": r.headers.get("cache-control", "public, max-age=3600"),
        }
        return Response(content=r.content, status_code=r.status_code, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")
