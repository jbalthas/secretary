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

        # Match by host (the IP is always configured); friendly_names is a filter that
        # returns nothing when GOOGLE_HOME_NAME is blank, so don't rely on it.
        chromecasts, browser = pychromecast.get_chromecasts(
            known_hosts=[settings.google_home_ip],
        )
        try:
            cast = next(
                (cc for cc in chromecasts if cc.cast_info.host == settings.google_home_ip),
                None,
            )
            if cast is None:
                _log.warning("Cast device not found at %s — skipping playback", settings.google_home_ip)
                return
            cast.wait()
            cast.media_controller.play_media(media_url, "audio/mp3")
            time.sleep(3)  # WHY: let device buffer before discovery teardown (research Pitfall 4)
        finally:
            browser.stop_discovery()
