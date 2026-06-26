import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/toast";
import { ProtectedRoute } from "./lib/protected-route";
import { Layout } from "./components/layout";
import Landing from "./pages/Landing";
import Docs from "./pages/Docs";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Repositories from "./pages/Repositories";
import Collections from "./pages/Collections";
import CollectionDetail from "./pages/CollectionDetail";
import SettingsPage from "./pages/Settings";
import SharePreview from "./pages/SharePreview";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/login" element={<Login />} />
        <Route path="/share/:slug" element={<SharePreview />} />


        {/* Protected routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/repositories" element={<ProtectedRoute><Layout><Repositories /></Layout></ProtectedRoute>} />
        <Route path="/collections" element={<ProtectedRoute><Layout><Collections /></Layout></ProtectedRoute>} />
        <Route path="/collections/:id" element={<ProtectedRoute><Layout><CollectionDetail /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
