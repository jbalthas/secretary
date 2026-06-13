import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Today from "./pages/Today";
import Tasks from "./pages/Tasks";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ paddingBottom: 56 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/tasks" element={<Tasks />} />
        </Routes>
      </div>
      <BottomNav />
    </BrowserRouter>
  );
}
