function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      sorted[key] = canonical((v as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return v;
}

export async function computeAdvisoryId(fullPayload: unknown): Promise<string> {
  const json = JSON.stringify(canonical(fullPayload));
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
