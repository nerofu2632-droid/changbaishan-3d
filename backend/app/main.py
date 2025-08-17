from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from app.core.config import settings
from app.api.v1.health import router as health_router
from app.api.v1.mt_proxy import router as mt_router

def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME)
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )

    # API
    app.include_router(health_router, prefix=settings.API_V1_STR, tags=["health"])
    app.include_router(mt_router, prefix=settings.API_V1_STR, tags=["maptiler"])

    # 前端静态资源路径
    fe_dir = Path(__file__).resolve().parents[2] / "frontend"
    assets_dir = fe_dir / "assets"
    index_path = fe_dir / "index.html"

    # 挂载 /assets
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir), html=False), name="assets")

    # 根路径返回 index.html
    @app.get("/")
    async def root():
        if not index_path.exists():
            return {"detail": "index.html not found", "path": str(index_path)}
        return FileResponse(index_path)

    return app

app = create_app()
