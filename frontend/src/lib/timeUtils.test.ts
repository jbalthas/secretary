import { describe, it, expect, vi, afterEach } from "vitest";
import { isAfterWorkHours, greetingForHour, formatClock } from "./timeUtils";

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

describe("greetingForHour", () => {
  it("returns morning greeting for early hours", () => {
    expect(greetingForHour(0)).toBe("Good morning.");
    expect(greetingForHour(9)).toBe("Good morning.");
  });
  it("returns morning greeting at the 11 boundary", () => {
    expect(greetingForHour(11)).toBe("Good morning.");
  });
  it("returns afternoon greeting at the 12 boundary", () => {
    expect(greetingForHour(12)).toBe("Good afternoon.");
  });
  it("returns afternoon greeting for mid-day hours", () => {
    expect(greetingForHour(15)).toBe("Good afternoon.");
  });
  it("returns afternoon greeting at the 17 boundary", () => {
    expect(greetingForHour(17)).toBe("Good afternoon.");
  });
  it("returns evening greeting at the 18 boundary", () => {
    expect(greetingForHour(18)).toBe("Good evening.");
  });
  it("returns evening greeting for late hours", () => {
    expect(greetingForHour(23)).toBe("Good evening.");
  });
});

describe("formatClock", () => {
  it("formats a morning time with minute and AM meridiem", () => {
    const result = formatClock(new Date(2026, 0, 1, 9, 5));
    expect(result).toContain("05");
    expect(result).toContain("AM");
  });
  it("formats an afternoon time with minute and PM meridiem", () => {
    const result = formatClock(new Date(2026, 0, 1, 14, 30));
    expect(result).toContain("30");
    expect(result).toContain("PM");
  });
});
