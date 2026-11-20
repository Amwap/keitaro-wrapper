from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Keitaro wrapper API"
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:5173"]
    db_path: Path = BASE_DIR / "data" / "app.db"

    jwt_secret: str = Field(min_length=32, repr=False)
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    cookie_secure: bool = False

    # Keitaro Admin API: https://admin-api.docs.keitaro.io/
    keitaro_url: str = ""
    keitaro_api_key: SecretStr = SecretStr("")
    keitaro_timeout_seconds: float = 20
    keitaro_timezone: str = "Europe/Moscow"
    # Defaults for the campaign creation form (ids in Keitaro)
    keitaro_default_domain_id: int | None = None
    keitaro_default_group_id: int | None = None
    keitaro_default_traffic_source_id: int | None = None
    keitaro_geo_redirect_url: str = "https://google.com"

    @field_validator("keitaro_url")
    @classmethod
    def _normalize_keitaro_url(cls, value: str) -> str:
        """`tlgk.host/admin` -> `https://tlgk.host`: only scheme and host are used."""
        value = value.strip().rstrip("/")
        if not value:
            return value
        if "://" not in value:
            value = "https://" + value
        scheme, rest = value.split("://", 1)
        return f"{scheme}://{rest.split('/', 1)[0]}"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.db_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
