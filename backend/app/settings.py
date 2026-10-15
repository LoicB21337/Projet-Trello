from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = ""
    mongo_host: str = "localhost"
    mongo_port: int = 27017
    mongo_database: str = "trello"
    auth_secret_key: str = ""
    auth_cookie_secure: bool = False
    auth_session_hours: int = 12

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def mongo_connection_string(self) -> str:
        if self.mongodb_uri:
            return self.mongodb_uri
        return f"mongodb://{self.mongo_host}:{self.mongo_port}"


settings = Settings()