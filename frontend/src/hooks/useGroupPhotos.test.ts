import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGroupPhotos } from "./useGroupPhotos";

let container: HTMLDivElement;
let root: Root;

function renderHook<T>(hook: () => T): { result: { current: T } } {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  act(() => root.render(createElement(TestComponent)));
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

describe("useGroupPhotos", () => {
  it("surfaces a rejected upload response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 413 });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGroupPhotos());
    await act(async () => undefined);
    await act(async () => {
      await result.current.upload("goal:1", new File(["photo"], "photo.jpg"));
    });

    expect(result.current.uploadError).toBe("Photo upload failed (413).");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
