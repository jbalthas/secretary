import { useState } from "react";
import type { AdvisoryPreviewResult, AdvisoryResult } from "../types/goal";

const PREVIEW_URL = "/api/v1/advisory/preview";
const CONFIRM_URL = "/api/v1/advisory/confirm";

interface ValidationError {
  loc: (string | number)[];
  msg: string;
}

function parse422(detail: unknown): string[] {
  if (typeof detail === "string") return [detail];
  if (Array.isArray(detail)) {
    return (detail as ValidationError[]).map(
      (e) => `${e.loc.filter((p) => p !== "body").join(".")}: ${e.msg}`
    );
  }
  return [];
}

export function useAdvisory() {
  const [previewResult, setPreviewResult] = useState<AdvisoryPreviewResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function preview(payload: unknown) {
    setPreviewing(true);
    setErrors([]);
    try {
      const res = await fetch(PREVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setPreviewResult(await res.json());
      } else if (res.status === 422) {
        const body = await res.json();
        setErrors(parse422(body.detail ?? []));
        setPreviewResult(null);
      } else {
        setErrors([`Preview failed (HTTP ${res.status}).`]);
        setPreviewResult(null);
      }
    } catch {
      setErrors(["Preview failed — check your connection and try again."]);
      setPreviewResult(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function confirm(req: { advisory_id: string; payload: unknown }): Promise<AdvisoryResult | null> {
    setConfirming(true);
    setErrors([]);
    try {
      const res = await fetch(CONFIRM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (res.ok) {
        return (await res.json()) as AdvisoryResult;
      }
      if (res.status === 422) {
        const body = await res.json();
        setErrors(parse422(body.detail ?? []));
      } else {
        setErrors([`Confirm failed (HTTP ${res.status}).`]);
      }
      return null;
    } catch {
      setErrors(["Confirm failed — check your connection and try again."]);
      return null;
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setPreviewResult(null);
    setErrors([]);
  }

  return { previewResult, errors, previewing, confirming, preview, confirm, reset };
}
