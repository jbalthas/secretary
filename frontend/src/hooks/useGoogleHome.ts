import { useEffect, useState } from "react";

const TTS_URL = "/api/v1/tts";
const SETTINGS_URL = "/api/v1/settings/tts";

export function useGoogleHome() {
  const [ttsEnabled, setTtsEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(SETTINGS_URL);
        if (!res.ok) throw new Error();
        const d = await res.json();
        setTtsEnabled(Boolean(d.tts_enabled));
      } catch {
        setError("Could not load Google Home settings. Try refreshing.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function setEnabled(value: boolean): Promise<boolean> {
    const res = await fetch(SETTINGS_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tts_enabled: value }),
    });
    if (res.ok) { setTtsEnabled(value); return true; }
    return false;
  }

  async function speak(text: string): Promise<boolean> {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  }

  return { ttsEnabled, loading, error, setEnabled, speak };
}
