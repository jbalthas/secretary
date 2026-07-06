import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdvisory } from "./useAdvisory";
import type { AdvisoryPreviewResult, AdvisoryResult } from "../types/goal";

let container: HTMLDivElement;
let root: Root;

function renderHook<T>(hook: () => T): { result: { current: T } } {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  act(() => {
    root.render(createElement(TestComponent));
  });
  return { result };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useAdvisory", () => {
  it("sets previewResult on 200", async () => {
    const body: AdvisoryPreviewResult = {
      goals: [],
      milestones: [],
      new_tasks: [],
      notes: null,
      session_id: "s1",
      generated_at: "2026-07-06T00:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
    );

    const { result } = renderHook(() => useAdvisory());
    await act(async () => {
      await result.current.preview({ payload_type: "advisory" });
    });

    expect(result.current.previewResult).toEqual(body);
    expect(result.current.errors).toEqual([]);
  });

  it("sets errors on 422 for preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: [{ loc: ["body", "session_id"], msg: "field required" }] }),
      })
    );

    const { result } = renderHook(() => useAdvisory());
    await act(async () => {
      await result.current.preview({});
    });

    expect(result.current.previewResult).toBeNull();
    expect(result.current.errors).toEqual(["session_id: field required"]);
  });

  it("returns AdvisoryResult on confirm 200", async () => {
    const res: AdvisoryResult = {
      created: { goals: 0, milestones: 0, new_tasks: 1 },
      updated: { goals: 1, milestones: 0 },
      advisory_id: "abc123",
      replayed: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => res })
    );

    const { result } = renderHook(() => useAdvisory());
    let confirmResult: AdvisoryResult | null = null;
    await act(async () => {
      confirmResult = await result.current.confirm({ advisory_id: "abc123", payload: {} });
    });

    expect(confirmResult).toEqual(res);
  });

  it("returns null on confirm 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: [{ loc: ["body", "advisory_id"], msg: "unknown external_key" }] }),
      })
    );

    const { result } = renderHook(() => useAdvisory());
    let confirmResult: AdvisoryResult | null = null;
    await act(async () => {
      confirmResult = await result.current.confirm({ advisory_id: "abc123", payload: {} });
    });

    expect(confirmResult).toBeNull();
    expect(result.current.errors).toEqual(["advisory_id: unknown external_key"]);
  });
});
