import { useCallback, useEffect, useState } from "react";
import type { GroupPhotoMeta } from "../types/groupPhoto";

export function useGroupPhotos() {
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());

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
      const form = new FormData();
      form.append("group_key", groupKey);
      form.append("file", file);
      await fetch("/api/v1/group-photos", { method: "POST", body: form });
      await refresh();
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

  return { photos, hasPhoto, imageUrl, upload, refresh };
}
