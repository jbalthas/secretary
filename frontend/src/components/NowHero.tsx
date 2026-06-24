import type { Task } from "../types/task";

interface NowHeroProps {
  task: Task | null;
  contextLine: string | null;
  onStart?: () => void;
}

function formatEstimate(minutes: number): string {
  return `~${minutes} min`;
}

export default function NowHero({ task, contextLine, onStart }: NowHeroProps) {
  if (!task) {
    return (
      <div className="now-hero now-hero--empty" aria-label="Right now">
        <p className="now-hero-label">RIGHT NOW</p>
        <p className="now-hero-title">You're all caught up</p>
        <p className="now-hero-context">Enjoy the moment — nothing left to do.</p>
      </div>
    );
  }

  const subLine =
    contextLine ??
    (task.estimated_minutes ? formatEstimate(task.estimated_minutes) : null);

  return (
    <div className="now-hero" aria-label="Right now">
      <p className="now-hero-label">RIGHT NOW</p>
      <p className="now-hero-title">{task.title}</p>
      {subLine && <p className="now-hero-context">{subLine}</p>}
      <button className="now-hero-action" onClick={onStart}>
        Start focus
      </button>
    </div>
  );
}
