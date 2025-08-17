# backend/app/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
BACKEND = Path(__file__).resolve().parents[2]
for p in (ROOT / ".env", BACKEND / ".env"):
    if p.exists():
        load_dotenv(p)

class Settings(BaseSettings):
    APP_NAME: str = "changbaishan-3d"
    API_V1_STR: str = "/api/v1"
    MAPTILER_KEY: str = ""
    model_config = SettingsConfigDict(
        env_file=[str(ROOT / ".env"), str(BACKEND / ".env")],
        env_file_encoding="utf-8"
    )

settings = Settings()
