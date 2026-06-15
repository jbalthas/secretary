import hashlib
import time
import logging
from pathlib import Path
from gtts import gTTS
import pychromecast
from app.config import settings

CACHE_DIR = Path(__file__).parent.parent.parent / "tts_cache"

_log = logging.getLogger(__name__)


class TTSClient:
    def speak(self, text: str) -> None:
        CACHE_DIR.mkdir(exist_ok=True)
        key = hashlib.sha256(text.encode()).hexdigest()[:16]
        mp3_path = CACHE_DIR / f"{key}.mp3"
        if not mp3_path.exists():
            gTTS(text=text, lang="en").save(str(mp3_path))

        media_url = f"http://{settings.google_home_lan_ip}:8000/tts-audio/{key}.mp3"

        chromecasts, browser = pychromecast.get_listed_chromecasts(
            friendly_names=[settings.google_home_name] if settings.google_home_name else [],
            known_hosts=[settings.google_home_ip],
        )
        try:
            if not chromecasts:
                _log.warning("Cast device not found at %s — skipping playback", settings.google_home_ip)
                return
            cast = chromecasts[0]
            cast.wait()
            cast.media_controller.play_media(media_url, "audio/mp3")
            time.sleep(3)  # WHY: let device buffer before discovery teardown (research Pitfall 4)
        finally:
            browser.stop_discovery()
