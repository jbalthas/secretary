import { useRef } from "react";
import { Camera, Inbox } from "lucide-react";
import { useGroupPhotos } from "../hooks/useGroupPhotos";
import { buildTaskFilters } from "../lib/taskFilters";
import { categoryVisual } from "../lib/taskCategory";
import type { Task } from "../types/task";
import type { Goal } from "../types/goal";

interface GroupTileGridProps {
  tasks: Task[];
  goals: Goal[];
  onSelect: (filterKey: string | null) => void;
}

const UNSORTED_KEY = "__unsorted__";

function isUnsorted(task: Task): boolean {
  return !task.goal_id && !task.parent_list_name && !task.list_name;
}

export default function GroupTileGrid({ tasks, goals, onSelect }: GroupTileGridProps) {
  const { hasPhoto, imageUrl, upload } = useGroupPhotos();
  const fileInputs = useRef<Map<string, HTMLInputElement>>(new Map());

  const tiles = buildTaskFilters(tasks, goals).filter(
    (filter) => filter.kind === "parent-list" || filter.kind === "goal"
  );

  const showUnsorted = tasks.some(isUnsorted);

  function triggerUpload(key: string, e: React.MouseEvent) {
    e.stopPropagation();
    fileInputs.current.get(key)?.click();
  }

  function handleFileChange(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void upload(key, file);
  }

  return (
    <div className="group-tile-grid">
      {tiles.map((filter) => {
        const visual = categoryVisual(filter.label.toLowerCase());
        const photo = hasPhoto(filter.key);
        return (
          <div className="group-tile" key={filter.key} onClick={() => onSelect(filter.key)}>
            {photo ? (
              <img className="group-tile-img" src={imageUrl(filter.key)} alt={filter.label} />
            ) : (
              <div className="group-tile-placeholder" style={{ background: visual.gradient }}>
                <visual.Icon size={32} />
              </div>
            )}
            <div className="group-tile-label">{filter.label}</div>
            <button
              type="button"
              className="group-tile-camera"
              onClick={(e) => triggerUpload(filter.key, e)}
              aria-label={`Set photo for ${filter.label}`}
            >
              <Camera size={16} />
            </button>
            <input
              ref={(el) => {
                if (el) fileInputs.current.set(filter.key, el);
              }}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFileChange(filter.key, e)}
            />
          </div>
        );
      })}
      {showUnsorted && (
        <div className="group-tile" onClick={() => onSelect(UNSORTED_KEY)}>
          <div className="group-tile-placeholder" style={{ background: "linear-gradient(135deg, #64748b, #334155)" }}>
            <Inbox size={32} />
          </div>
          <div className="group-tile-label">Unsorted</div>
        </div>
      )}
    </div>
  );
}
