export interface WeatherLocation { name: string; latitude: number; longitude: number; }
export const DEFAULT_WEATHER_LOCATION: WeatherLocation = { name: "Chicago", latitude: 41.8781, longitude: -87.6298 };
const STORAGE_KEY = "my-secretary.weather-location";
export const DAILY_BACKGROUNDS = ["/images/chicago-morning-weather.png", "/images/daily-lakeside.png", "/images/daily-forest-lake.png", "/images/daily-prairie.png"];
export function loadWeatherLocation(): WeatherLocation {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return DEFAULT_WEATHER_LOCATION; const saved = JSON.parse(raw) as Partial<WeatherLocation>; return typeof saved.name === "string" && typeof saved.latitude === "number" && typeof saved.longitude === "number" ? saved as WeatherLocation : DEFAULT_WEATHER_LOCATION; } catch { return DEFAULT_WEATHER_LOCATION; }
}
export function saveWeatherLocation(location: WeatherLocation) { localStorage.setItem(STORAGE_KEY, JSON.stringify(location)); }
export function dailyBackground(date = new Date()) { const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000); return DAILY_BACKGROUNDS[((day % DAILY_BACKGROUNDS.length) + DAILY_BACKGROUNDS.length) % DAILY_BACKGROUNDS.length]; }
export function locationLabel(result: { name: string; admin1?: string; country?: string }) { return [result.name, result.admin1, result.country].filter(Boolean).join(", "); }
