import { describe, expect, it } from "vitest";
import { resolveDropIntent } from "./dragIntent";

const rectTop = 100;
const rectHeight = 40;

describe("resolveDropIntent", () => {
  it("resolves to 'before' at the exact top edge (relative = 0)", () => {
    expect(resolveDropIntent(100, rectTop, rectHeight)).toBe("before");
  });

  it("resolves to 'after' at the exact bottom edge (relative = 1)", () => {
    expect(resolveDropIntent(140, rectTop, rectHeight)).toBe("after");
  });

  it("resolves to 'nest' at the vertical center (relative = 0.5)", () => {
    expect(resolveDropIntent(120, rectTop, rectHeight)).toBe("nest");
  });

  it("resolves to 'before' just inside the top quarter boundary (relative = 0.24) and 'nest' just past it (relative = 0.26)", () => {
    expect(resolveDropIntent(109.6, rectTop, rectHeight)).toBe("before");
    expect(resolveDropIntent(110.4, rectTop, rectHeight)).toBe("nest");
  });

  it("resolves to 'after' just inside the bottom quarter boundary (relative = 0.76) and 'nest' just before it (relative = 0.74)", () => {
    expect(resolveDropIntent(130.4, rectTop, rectHeight)).toBe("after");
    expect(resolveDropIntent(129.6, rectTop, rectHeight)).toBe("nest");
  });
});
