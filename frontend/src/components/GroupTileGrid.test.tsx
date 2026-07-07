import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GroupTileGrid from "./GroupTileGrid";
import type { Task } from "../types/task";

vi.mock("../hooks/useGroupPhotos", () => ({
  useGroupPhotos: () => ({
    hasPhoto: () => false,
    imageUrl: () => "",
    upload: vi.fn(),
    uploadError: null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("GroupTileGrid", () => {
  it("does not select the tile when the hidden file input is clicked", () => {
    const onSelect = vi.fn();
    const task = {
      id: 1,
      title: "Test task",
      parent_list_name: "Career",
      list_name: null,
      goal_id: null,
    } as Task;

    act(() => root.render(<GroupTileGrid tasks={[task]} goals={[]} onSelect={onSelect} />));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    act(() => input?.click());

    expect(onSelect).not.toHaveBeenCalled();
  });
});
