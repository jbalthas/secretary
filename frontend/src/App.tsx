import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Today from "./pages/Today";
import Tasks from "./pages/Tasks";
import Goals from "./pages/Goals";
import Ingest from "./pages/Ingest";
import QuickAddTasks from "./pages/QuickAddTasks";
import Advisor from "./pages/Advisor";
import Organize from "./pages/Organize";
import Settings from "./pages/Settings";
import "./styles.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <BottomNav />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/ingest" element={<Ingest />} />
            <Route path="/ingest/tasks" element={<QuickAddTasks />} />
            <Route path="/advisor" element={<Advisor />} />
            <Route path="/organize" element={<Organize />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
