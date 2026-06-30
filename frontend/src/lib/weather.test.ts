import { beforeEach, describe, expect, it } from "vitest";
import { DAILY_BACKGROUNDS, DEFAULT_WEATHER_LOCATION, dailyBackground, loadWeatherLocation, locationLabel, saveWeatherLocation } from "./weather";
describe("weather preferences", () => {
  beforeEach(() => localStorage.clear());
  it("persists a valid location", () => { expect(loadWeatherLocation()).toEqual(DEFAULT_WEATHER_LOCATION); const place = { name: "Madison", latitude: 43.07, longitude: -89.4 }; saveWeatherLocation(place); expect(loadWeatherLocation()).toEqual(place); });
  it("uses one stable background per local day", () => { const image = dailyBackground(new Date(2026, 5, 30, 8)); expect(dailyBackground(new Date(2026, 5, 30, 23))).toBe(image); expect(DAILY_BACKGROUNDS).toContain(image); expect(dailyBackground(new Date(2026, 6, 1))).not.toBe(image); });
  it("formats place labels", () => expect(locationLabel({ name: "Austin", admin1: "Texas", country: "United States" })).toBe("Austin, Texas, United States"));
});
