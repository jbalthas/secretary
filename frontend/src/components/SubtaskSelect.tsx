import type { Task } from "../types/task";

interface Props {
  tasks: Task[];
  currentTaskId: number | null;
  value: number | null;
  onChange: (parentTaskId: number | null) => void;
}

export default function SubtaskSelect({ tasks, currentTaskId, value, onChange }: Props) {
  const options = tasks.filter(
    (t) => t.id !== currentTaskId && t.parent_task_id == null
  );
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">No parent (top-level task)</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
    </select>
  );
}
