import type { UpdateCandidate, UpdateResponse } from "../types/update";

const URL = "/api/v1/updates/resolve";

export function useUpdate() {
  async function submit(text: string): Promise<UpdateResponse | null> {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok ? ((await res.json()) as UpdateResponse) : null;
  }

  async function confirm(
    text: string,
    c: UpdateCandidate,
    action: string,
  ): Promise<UpdateResponse | null> {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        confirmed_id: c.entity_id,
        confirmed_type: c.entity_type,
        confirmed_action: action,
      }),
    });
    return res.ok ? ((await res.json()) as UpdateResponse) : null;
  }

  return { submit, confirm };
}
