from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./secretary.db"
    api_prefix: str = "/api/v1"
    pushover_api_token: str = ""
    pushover_user_key: str = ""


settings = Settings()
