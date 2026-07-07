import { useCallback, useEffect, useState } from "react";
import type { GroupPhotoMeta } from "../types/groupPhoto";

export function useGroupPhotos() {
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [uploadError, setUploadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/group-photos");
    if (!response.ok) return;
    const data: GroupPhotoMeta[] = await response.json();
    setPhotos(new Map(data.map((item) => [item.group_key, item.updated_at])));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (groupKey: string, file: File) => {
      setUploadError(null);
      try {
        const form = new FormData();
        form.append("group_key", groupKey);
        form.append("file", file);
        const response = await fetch("/api/v1/group-photos", { method: "POST", body: form });
        if (!response.ok) {
          throw new Error(`Photo upload failed (${response.status}).`);
        }
        await refresh();
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Photo upload failed.");
      }
    },
    [refresh]
  );

  const hasPhoto = useCallback((groupKey: string) => photos.has(groupKey), [photos]);

  const imageUrl = useCallback(
    (groupKey: string) => {
      const updatedAt = photos.get(groupKey);
      return `/api/v1/group-photos/image?key=${encodeURIComponent(groupKey)}&t=${encodeURIComponent(updatedAt ?? "")}`;
    },
    [photos]
  );

  return { photos, hasPhoto, imageUrl, upload, uploadError, refresh };
}
