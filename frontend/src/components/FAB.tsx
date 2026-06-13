import { Plus } from "lucide-react";

interface Props {
  onClick: () => void;
}

export default function FAB({ onClick }: Props) {
  return (
    <button
      className="fab"
      onClick={onClick}
      aria-label="Add task"
    >
      <Plus size={24} color="white" />
    </button>
  );
}
