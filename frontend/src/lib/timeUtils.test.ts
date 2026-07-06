import { describe, it, expect, vi, afterEach } from "vitest";
import { isAfterWorkHours } from "./timeUtils";

afterEach(() => vi.useRealTimers());

describe("isAfterWorkHours", () => {
  it("returns false when workEnd is null", () => {
    expect(isAfterWorkHours(null)).toBe(false);
  });
  it("returns false when workEnd is empty string", () => {
    expect(isAfterWorkHours("")).toBe(false);
  });
  it("returns true after the end time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 23, 18, 1, 0));
    expect(isAfterWorkHours("18:00")).toBe(true);
  });
  it("returns false before the end time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 23, 17, 59, 0));
    expect(isAfterWorkHours("18:00")).toBe(false);
  });
  it("returns true at the exact end minute (>= boundary)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 23, 18, 0, 0));
    expect(isAfterWorkHours("18:00")).toBe(true);
  });
});
