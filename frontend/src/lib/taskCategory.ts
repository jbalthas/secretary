import {
  Briefcase,
  User,
  HeartPulse,
  GraduationCap,
  Wallet,
  ShoppingCart,
  Flag,
  type LucideIcon,
} from "lucide-react";
import type { Task } from "../types/task";
import type { Goal } from "../types/goal";

export interface CategoryVisual {
  key: string;
  label: string;
  gradient: string;
  Icon: LucideIcon;
}

interface PaletteEntry {
  aliases: string[];
  label: string;
  gradient: string;
  Icon: LucideIcon;
}

// Gradient colors mirror styles.css type-* palette (career #6366f1, life #10b981,
// health #ef4444, learning #f59e0b, financial #14b8a6) plus a slate-blue for errands.
const PALETTE: PaletteEntry[] = [
  {
    aliases: ["work", "job", "career"],
    label: "Work",
    gradient: "linear-gradient(135deg, #6366f1, #4338ca)",
    Icon: Briefcase,
  },
  {
    aliases: ["personal", "life", "home"],
    label: "Personal",
    gradient: "linear-gradient(135deg, #10b981, #047857)",
    Icon: User,
  },
  {
    aliases: ["health", "fitness", "wellness"],
    label: "Health",
    gradient: "linear-gradient(135deg, #ef4444, #b91c1c)",
    Icon: HeartPulse,
  },
  {
    aliases: ["learning", "study", "education"],
    label: "Learning",
    gradient: "linear-gradient(135deg, #f59e0b, #b45309)",
    Icon: GraduationCap,
  },
  {
    aliases: ["finance", "financial", "money"],
    label: "Finance",
    gradient: "linear-gradient(135deg, #14b8a6, #0f766e)",
    Icon: Wallet,
  },
  {
    aliases: ["errands", "shopping", "chores"],
    label: "Errands",
    gradient: "linear-gradient(135deg, #64748b, #334155)",
    Icon: ShoppingCart,
  },
];

const PRIORITY_PALETTE: Record<string, { label: string; gradient: string }> = {
  high: { label: "High priority", gradient: "linear-gradient(135deg, #ef4444, #b91c1c)" },
  medium: { label: "Medium priority", gradient: "linear-gradient(135deg, #f59e0b, #b45309)" },
  low: { label: "Low priority", gradient: "linear-gradient(135deg, #64748b, #334155)" },
};

// Fallback gradients for unlisted categories — deterministic hash picks one.
const DEFAULT_GRADIENTS = [
  "linear-gradient(135deg, #6366f1, #4338ca)",
  "linear-gradient(135deg, #10b981, #047857)",
  "linear-gradient(135deg, #ef4444, #b91c1c)",
  "linear-gradient(135deg, #f59e0b, #b45309)",
  "linear-gradient(135deg, #14b8a6, #0f766e)",
  "linear-gradient(135deg, #64748b, #334155)",
];

function hashString(value: string): number {
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    sum += value.charCodeAt(i);
  }
  return sum;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function resolveCategory(task: Task, goals: Goal[]): string {
  const candidates = [task.list_name, task.parent_list_name];

  if (task.goal_id != null) {
    const goal = goals.find((g) => g.id === task.goal_id);
    if (goal) {
      candidates.push(goal.list_name, goal.parent_list_name);
    }
  }

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim().toLowerCase();
    }
  }

  return `priority:${task.priority}`;
}

export function categoryVisual(category: string): CategoryVisual {
  const normalized = category.trim().toLowerCase();

  if (normalized.startsWith("priority:")) {
    const priorityKey = normalized.slice("priority:".length);
    const priorityEntry = PRIORITY_PALETTE[priorityKey] ?? PRIORITY_PALETTE.low;
    return {
      key: normalized,
      label: priorityEntry.label,
      gradient: priorityEntry.gradient,
      Icon: Flag,
    };
  }

  const match = PALETTE.find((entry) => entry.aliases.includes(normalized));
  if (match) {
    return {
      key: normalized,
      label: match.label,
      gradient: match.gradient,
      Icon: match.Icon,
    };
  }

  const index = hashString(normalized) % DEFAULT_GRADIENTS.length;
  return {
    key: normalized,
    label: titleCase(normalized),
    gradient: DEFAULT_GRADIENTS[index],
    Icon: Briefcase,
  };
}
