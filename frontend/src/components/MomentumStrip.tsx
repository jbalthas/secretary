interface MomentumStripProps {
  doneToday: number;
  remainingToday: number;
}

export default function MomentumStrip({ doneToday, remainingToday }: MomentumStripProps) {
  return (
    <div className="momentum-strip">
      <div className="momentum-stat">
        <span className="momentum-stat-value">{doneToday}</span>
        <span className="momentum-stat-label">DONE TODAY</span>
      </div>
      <div className="momentum-stat">
        <span className="momentum-stat-value">{remainingToday}</span>
        <span className="momentum-stat-label">REMAINING</span>
      </div>
    </div>
  );
}
