import { NavLink } from "react-router-dom";
import { CalendarDays, ListTodo, Target, CalendarCheck, Bot, Settings } from "lucide-react";

const tabs = [
  { to: "/today", label: "Today", shortLabel: "Today", Icon: CalendarDays },
  { to: "/tasks", label: "Tasks", shortLabel: "Tasks", Icon: ListTodo },
  { to: "/goals", label: "Goals", shortLabel: "Goals", Icon: Target },
  { to: "/organize", label: "Plan", shortLabel: "Plan", Icon: CalendarCheck },
  { to: "/advisor", label: "Advisor", shortLabel: "Sync", Icon: Bot },
  { to: "/settings", label: "Settings", shortLabel: "Settings", Icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      <div className="primary-nav__brand" aria-hidden="true">M</div>
      <div className="primary-nav__links">
        {tabs.map(({ to, label, shortLabel, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `primary-nav__link${isActive ? " is-active" : ""}`}>
            <Icon size={21} strokeWidth={1.8} />
            <span className="primary-nav__label">{label}</span>
            <span className="primary-nav__short-label">{shortLabel}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
