import { useState } from "react";
import type { IngestPreviewResult } from "../types/goal";

const PREVIEW_URL = "/api/v1/ingest/preview";
const CONFIRM_URL = "/api/v1/ingest/confirm";

interface ValidationError {
  loc: (string | number)[];
  msg: string;
}

function parse422(detail: ValidationError[]): string[] {
  return detail.map(
    (e) => `${e.loc.filter((p) => p !== "body").join(".")}: ${e.msg}`
  );
}

export function useIngest() {
  const [previewResult, setPreviewResult] = useState<IngestPreviewResult | null>(null);
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

  async function confirm(payload: unknown): Promise<boolean> {
    setConfirming(true);
    setErrors([]);
    try {
      const res = await fetch(CONFIRM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return true;
      }
      if (res.status === 422) {
        const body = await res.json();
        setErrors(parse422(body.detail ?? []));
      } else {
        setErrors([`Import failed (HTTP ${res.status}).`]);
      }
      return false;
    } catch {
      setErrors(["Import failed — check your connection and try again."]);
      return false;
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
