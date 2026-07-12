import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Home } from 'lucide-react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { HomeView } from './views/HomeView';
import { DashboardView } from './views/DashboardView';

function NavItem({ to, icon: Icon, label, isActive }: { to: string, icon: React.ElementType, label: string, isActive: boolean }) {
  return (
    <Link
      to={to}
      className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
    >
      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute inset-0 bg-white/10 rounded-full"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <span className="relative flex items-center gap-2"><Icon size={16} /> {label}</span>
    </Link>
  );
}

function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#c5c6c7] selection:bg-purple-500/30 overflow-x-hidden">
      {/* Floating App Navigation */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-40">
        <div className="glass rounded-full p-1.5 flex items-center shadow-2xl shadow-purple-900/20">
          <NavItem to="/" icon={Home} label="Shorten" isActive={location.pathname === '/'} />
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" isActive={location.pathname === '/dashboard'} />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="pt-32 pb-20 px-6 max-w-5xl mx-auto relative">
        {/* Decorative background glow */}
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />

        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomeView />} />
            <Route path="/dashboard" element={<DashboardView />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
