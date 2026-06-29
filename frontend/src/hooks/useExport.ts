import { useState } from "react";

interface SnapshotResult {
  created: number;
  skipped: number;
}

export function useExport() {
  const [bundle, setBundle] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchBundle(): Promise<string | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/export/bundle");
      if (res.ok) {
        const data = await res.json();
        setBundle(data.markdown);
        setSessionId(data.session_id);
        setGeneratedAt(data.generated_at);
        return data.markdown as string;
      }
      setError(`Failed to load bundle (HTTP ${res.status}).`);
      return null;
    } catch {
      setError("Failed to load bundle — check your connection.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function triggerSnapshot(): Promise<SnapshotResult | null> {
    setSnapshotting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/export/snapshot", { method: "POST" });
      if (res.ok) return (await res.json()) as SnapshotResult;
      setError(`Snapshot failed (HTTP ${res.status}).`);
      return null;
    } catch {
      setError("Snapshot failed — check your connection.");
      return null;
    } finally {
      setSnapshotting(false);
    }
  }

  return {
    bundle,
    sessionId,
    generatedAt,
    loading,
    snapshotting,
    error,
    fetchBundle,
    triggerSnapshot,
  };
}
