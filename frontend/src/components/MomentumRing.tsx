interface MomentumRingProps {
  done: number;
  total: number;
}

const SIZE = 44;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function MomentumRing({ done, total }: MomentumRingProps) {
  const pct = total > 0 ? done / total : 0;
  const offset = CIRCUMFERENCE * (1 - pct);

  return (
    <div className="momentum-ring" aria-label={`${done} of ${total} tasks done`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE}
        />
        <circle
          className="momentum-ring-progress"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="momentum-ring-label">
        {done}/{total} done
      </span>
    </div>
  );
}
