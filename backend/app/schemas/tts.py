from pydantic import BaseModel


class TTSRequest(BaseModel):
    text: str


class TTSEnabledRead(BaseModel):
    tts_enabled: bool
    model_config = {"from_attributes": True}


class TTSEnabledUpdate(BaseModel):
    tts_enabled: bool
