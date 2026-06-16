import type { Goal } from "../types/goal";

interface Props {
  goals: Goal[];
  value: number | null;
  onChange: (goalId: number | null) => void;
}

export default function GoalSelect({ goals, value, onChange }: Props) {
  const active = goals.filter((g) => g.status === "active");
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">No goal</option>
      {active.map((g) => (
        <option key={g.id} value={g.id}>
          {g.title}
        </option>
      ))}
    </select>
  );
}
