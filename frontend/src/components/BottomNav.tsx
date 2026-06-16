import { NavLink } from "react-router-dom";
import { Calendar, ListTodo, Target, Settings } from "lucide-react";

const navStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  height: 56,
  background: "var(--surface)",
  borderTop: "1px solid var(--border)",
  display: "flex",
};

const tabStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  minHeight: 44,
  textDecoration: "none",
  fontSize: 14,
  lineHeight: 1.4,
};

export default function BottomNav() {
  return (
    <nav role="navigation" style={navStyle}>
      <NavLink
        to="/today"
        style={({ isActive }) => ({
          ...tabStyle,
          color: isActive ? "var(--accent)" : "var(--text-secondary)",
        })}
      >
        <Calendar size={22} />
        Today
      </NavLink>
      <NavLink
        to="/tasks"
        style={({ isActive }) => ({
          ...tabStyle,
          color: isActive ? "var(--accent)" : "var(--text-secondary)",
        })}
      >
        <ListTodo size={22} />
        Tasks
      </NavLink>
      <NavLink
        to="/goals"
        style={({ isActive }) => ({
          ...tabStyle,
          color: isActive ? "var(--accent)" : "var(--text-secondary)",
        })}
      >
        <Target size={22} />
        Goals
      </NavLink>
      <NavLink
        to="/settings"
        style={({ isActive }) => ({
          ...tabStyle,
          color: isActive ? "var(--accent)" : "var(--text-secondary)",
        })}
      >
        <Settings size={22} />
        Settings
      </NavLink>
    </nav>
  );
}
