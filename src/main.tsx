import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Setting from "./pages/Setting";
import Dashboard from "./pages/Dashboard";

import { HistoryProvider } from "./context/HistoryContext";


import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <HistoryProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Setting />} />
        </Routes>
      </HistoryProvider>
    </BrowserRouter>
  </React.StrictMode>
);