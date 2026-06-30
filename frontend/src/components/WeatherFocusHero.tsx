import { useEffect, useState } from "react";
import { CloudSun, MapPin } from "lucide-react";
import type { Task } from "../types/task";

interface Props { task: Task | null; contextLine: string | null; doneToday: number; remainingToday: number; }
interface Weather { temperature: number; high: number; low: number; label: string; }

function weatherLabel(code: number): string {
  if (code === 0) return "Clear skies";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Misty";
  if (code <= 67) return "Rain showers";
  if (code <= 77) return "Snow showers";
  if (code <= 82) return "Passing showers";
  return "Stormy";
}

export default function WeatherFocusHero({ task, contextLine, doneToday, remainingToday }: Props) {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("https://api.open-meteo.com/v1/forecast?latitude=41.8781&longitude=-87.6298&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FChicago", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setWeather({ temperature: Math.round(data.current.temperature_2m), high: Math.round(data.daily.temperature_2m_max[0]), low: Math.round(data.daily.temperature_2m_min[0]), label: weatherLabel(data.current.weather_code) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <section className="weather-focus" aria-label="Weather and current focus">
      <div className="weather-focus__top">
        <div><p className="weather-focus__greeting">Good morning.</p><p className="weather-focus__message">A clear view of what matters today.</p></div>
        <div className="weather-focus__weather" aria-live="polite">
          <CloudSun size={26} />
          <div><strong>{weather ? `${weather.temperature}°` : "Morning"}</strong><span>{weather?.label ?? "Weather loading"}</span></div>
          <div className="weather-focus__place"><span><MapPin size={13} /> Chicago</span>{weather && <span>H {weather.high}° · L {weather.low}°</span>}</div>
        </div>
      </div>
      <div className="weather-focus__bottom">
        <div className="focus-task"><span className="focus-task__check" aria-hidden="true" /><div><span className="focus-task__label">Up next</span><strong>{task?.title ?? "You're all caught up"}</strong><span>{contextLine ?? (task?.estimated_minutes ? `About ${task.estimated_minutes} minutes` : "Nothing needs your attention right now")}</span></div></div>
        <div className="weather-focus__momentum" aria-label="Today's momentum"><div><strong>{doneToday}</strong><span>complete</span></div><div><strong>{remainingToday}</strong><span>remaining</span></div></div>
      </div>
    </section>
  );
}
