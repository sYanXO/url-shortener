import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Link2, 
  Search, 
  RefreshCw, 
  Trash2, 
  Edit3, 
  QrCode, 
  ExternalLink,
  ChevronRight,
  LayoutDashboard,
  Home,
  Copy,
  Check
} from 'lucide-react';
import { StatsGrid } from './components/StatsGrid';
import { ClicksChart } from './components/ClicksChart';
import { NicknameEditModal } from './components/NicknameEditModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { Modal } from './components/Modal';
import { Button } from './components/ui/Button';

interface LinkMapping {
  short_code: string;
  original_url: string;
  click_count: number;
  created_at: string | null;
  nickname: string | null;
}

interface StatsData {
  total_links: number;
  total_clicks: number;
}

interface ClickHistory {
  date: string;
  count: number;
}

export default function App() {
  const [view, setView] = useState<'home' | 'dashboard'>('home');

  // Input forms state
  const [originalUrl, setOriginalUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [shortenLoading, setShortenLoading] = useState(false);
  const [shortenResult, setShortenResult] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Local storage history state
  const [localHistory, setLocalHistory] = useState<LinkMapping[]>([]);

  // Dashboard state
  const [allLinks, setAllLinks] = useState<LinkMapping[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<StatsData>({ total_links: 0, total_clicks: 0 });
  const [clickHistory, setClickHistory] = useState<ClickHistory[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Modals visibility states
  const [activeQrUrl, setActiveQrUrl] = useState<string | null>(null);
  const [activeDeleteLink, setActiveDeleteLink] = useState<LinkMapping | null>(null);
  const [activeEditLink, setActiveEditLink] = useState<LinkMapping | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('shorty_history');
    if (saved) {
      try {
        setLocalHistory(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, historyRes, linksRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/clicks-over-time?days=14'),
        fetch('/api/links?limit=100')
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (historyRes.ok) setClickHistory(await historyRes.json());
      if (linksRes.ok) setAllLinks(await linksRes.json());
    } catch (e) {
      toast.error('Failed to load dashboard data');
    }
  };

  useEffect(() => {
    if (view === 'dashboard') {
      fetchDashboardData();
    }
  }, [view]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    let targetUrl = originalUrl.trim();
    if (!targetUrl) return;

    setShortenLoading(true);
    setShortenResult(null);

    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    try {
      const res = await fetch('/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_url: targetUrl,
          nickname: nickname.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail?.[0]?.msg || data.detail || 'Failed to shorten URL');
      }

      const generatedCode = data.short_code;
      setShortenResult(generatedCode);
      toast.success('Link shortened successfully!');

      const newMapping: LinkMapping = {
        short_code: generatedCode,
        original_url: targetUrl,
        click_count: 0,
        created_at: new Date().toISOString(),
        nickname: nickname.trim() || null
      };

      const updatedHistory = [newMapping, ...localHistory.filter(h => h.original_url !== targetUrl)].slice(0, 10);
      setLocalHistory(updatedHistory);
      localStorage.setItem('shorty_history', JSON.stringify(updatedHistory));

      setOriginalUrl('');
      setNickname('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setShortenLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!activeDeleteLink) return;
    const shortCode = activeDeleteLink.short_code;
    try {
      const res = await fetch(`/api/links/${shortCode}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete link');

      setAllLinks(allLinks.filter(l => l.short_code !== shortCode));
      const newHistory = localHistory.filter(l => l.short_code !== shortCode);
      setLocalHistory(newHistory);
      localStorage.setItem('shorty_history', JSON.stringify(newHistory));

      fetchDashboardData();
      setActiveDeleteLink(null);
      toast.success('Link deleted successfully');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const executeNicknameSave = async (newNickname: string | null) => {
    if (!activeEditLink) return;
    const shortCode = activeEditLink.short_code;
    const res = await fetch(`/api/links/${shortCode}/nickname`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: newNickname })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to update nickname');

    setAllLinks(allLinks.map(l => l.short_code === shortCode ? { ...l, nickname: newNickname } : l));
    const updatedLocal = localHistory.map(l => l.short_code === shortCode ? { ...l, nickname: newNickname } : l);
    setLocalHistory(updatedLocal);
    localStorage.setItem('shorty_history', JSON.stringify(updatedLocal));

    fetchDashboardData();
    toast.success('Nickname updated');
  };

  const copyToClipboard = (code: string) => {
    const fullUrl = `${window.location.origin}/${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCode(code);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredLinks = allLinks.filter(l => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (l.original_url || '').toLowerCase().includes(q) ||
           (l.nickname || '').toLowerCase().includes(q) ||
           (l.short_code || '').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#c5c6c7] selection:bg-purple-500/30 overflow-x-hidden">
      
      {/* Floating App Navigation */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-40">
        <div className="glass rounded-full p-1.5 flex items-center shadow-2xl shadow-purple-900/20">
          <button
            onClick={() => setView('home')}
            className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors ${view === 'home' ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {view === 'home' && (
              <motion.div
                layoutId="nav-indicator"
                className="absolute inset-0 bg-white/10 rounded-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative flex items-center gap-2"><Home size={16} /> Shorten</span>
          </button>
          
          <button
            onClick={() => setView('dashboard')}
            className={`relative px-5 py-2 rounded-full text-sm font-medium transition-colors ${view === 'dashboard' ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {view === 'dashboard' && (
              <motion.div
                layoutId="nav-indicator"
                className="absolute inset-0 bg-white/10 rounded-full"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative flex items-center gap-2"><LayoutDashboard size={16} /> Dashboard</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="pt-32 pb-20 px-6 max-w-5xl mx-auto relative">
        {/* Decorative background glow */}
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none -z-10" />

        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="max-w-3xl mx-auto space-y-16"
            >
              <div className="text-center space-y-6">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
                  className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.4)]"
                >
                  <Link2 size={32} className="text-white" />
                </motion.div>
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white">
                  Shorten links.<br/>Track analytics.
                </h1>
                <p className="text-gray-400 max-w-md mx-auto">
                  A minimalist, premium workspace to customize short codes, create nicknames, and audit click counts instantly.
                </p>
              </div>

              {/* Shorten Form Card */}
              <div className="glass-panel rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                <form onSubmit={handleShorten} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 relative">
                      <input
                        type="text"
                        required
                        placeholder="Enter long link..."
                        value={originalUrl}
                        onChange={(e) => setOriginalUrl(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-black/40 transition-all"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Nickname (optional)"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-black/40 transition-all"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={shortenLoading}
                    className="w-full py-4 rounded-2xl text-base"
                  >
                    {shortenLoading ? 'Shortening...' : (
                      <>
                        Shorten Link
                        <ChevronRight size={18} />
                      </>
                    )}
                  </Button>
                </form>

                <AnimatePresence>
                  {shortenResult && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 glass rounded-2xl flex items-center justify-between gap-4 border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                        <div className="truncate min-w-0">
                          <span className="text-[11px] text-purple-300/70 uppercase font-mono tracking-wider block mb-1">Short code generated</span>
                          <a 
                            href={`${window.location.origin}/${shortenResult}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-white font-mono text-base font-medium truncate hover:text-purple-300 transition-colors"
                          >
                            {window.location.origin}/{shortenResult}
                          </a>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" onClick={() => setActiveQrUrl(`${window.location.origin}/${shortenResult}`)}>
                            <QrCode size={16} />
                          </Button>
                          <Button variant="secondary" onClick={() => copyToClipboard(shortenResult)}>
                            {copiedCode === shortenResult ? <Check size={16} className="text-purple-400" /> : <Copy size={16} />}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Local Storage History List */}
              {localHistory.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                  className="space-y-5"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 pl-2">Recent Links</h3>
                  <div className="space-y-3">
                    <AnimatePresence>
                      {localHistory.map((item) => (
                        <motion.div 
                          key={item.short_code}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="glass-panel rounded-2xl p-4 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors"
                        >
                          <div className="truncate min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm text-white">{item.short_code}</span>
                              {item.nickname && (
                                <span className="bg-white/10 text-gray-300 text-[10px] px-2 py-0.5 rounded-full border border-white/5 font-medium">
                                  {item.nickname}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 font-mono truncate mt-1.5">{item.original_url}</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" className="p-2" onClick={() => window.open(`${window.location.origin}/${item.short_code}`, '_blank')}>
                              <ExternalLink size={16} />
                            </Button>
                            <Button variant="ghost" className="p-2" onClick={() => copyToClipboard(item.short_code)}>
                              {copiedCode === item.short_code ? <Check size={16} className="text-purple-400" /> : <Copy size={16} />}
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-bold text-white tracking-tight">Overview Dashboard</h2>
                  <p className="text-sm text-gray-400 mt-1">Live analytics metrics and links registry.</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                      <Search size={16} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search links..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 w-64 transition-all"
                    />
                  </div>
                  <Button variant="secondary" onClick={handleRefresh} className="px-3">
                    <RefreshCw size={16} className={refreshing ? 'animate-spin-slow' : ''} />
                  </Button>
                </div>
              </div>

              <StatsGrid totalLinks={stats.total_links} totalClicks={stats.total_clicks} />

              {clickHistory.length > 0 && <ClicksChart data={clickHistory} />}

              <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                  <h3 className="text-sm font-semibold text-gray-200">Registered Links</h3>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs font-semibold text-gray-400 bg-black/20">
                        <th className="px-8 py-4">Short code</th>
                        <th className="px-8 py-4">Destination URL</th>
                        <th className="px-8 py-4">Nickname</th>
                        <th className="px-8 py-4 text-center">Clicks</th>
                        <th className="px-8 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence>
                        {filteredLinks.length > 0 ? (
                          filteredLinks.map((link) => (
                            <motion.tr 
                              key={link.short_code} 
                              layout
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="hover:bg-white/[0.03] transition-colors group"
                            >
                              <td className="px-8 py-5 font-mono text-purple-300 whitespace-nowrap">
                                <button 
                                  onClick={() => copyToClipboard(link.short_code)}
                                  className="hover:text-purple-200 transition-colors flex items-center gap-2"
                                >
                                  {link.short_code}
                                  {copiedCode === link.short_code && <Check size={14} className="text-teal-400" />}
                                </button>
                              </td>
                              <td className="px-8 py-5 max-w-xs truncate text-gray-400 font-mono" title={link.original_url}>
                                {link.original_url}
                              </td>
                              <td className="px-8 py-5 whitespace-nowrap">
                                {link.nickname ? (
                                  <span className="bg-white/10 text-gray-200 text-xs px-3 py-1 rounded-full border border-white/5 font-medium">
                                    {link.nickname}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 text-xs italic">none</span>
                                )}
                              </td>
                              <td className="px-8 py-5 text-center whitespace-nowrap font-mono font-bold text-gray-200">
                                {link.click_count.toLocaleString()}
                              </td>
                              <td className="px-8 py-5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" onClick={() => setActiveQrUrl(`${window.location.origin}/${link.short_code}`)} className="p-2">
                                    <QrCode size={16} />
                                  </Button>
                                  <Button variant="ghost" onClick={() => setActiveEditLink(link)} className="p-2">
                                    <Edit3 size={16} />
                                  </Button>
                                  <Button variant="ghost" onClick={() => setActiveDeleteLink(link)} className="p-2 hover:text-red-400 hover:bg-red-500/10">
                                    <Trash2 size={16} />
                                  </Button>
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-8 py-12 text-center text-gray-500 italic">
                              No links matched your query.
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Modals */}
      <Modal isOpen={activeQrUrl !== null} onClose={() => setActiveQrUrl(null)} title="QR Code">
        {activeQrUrl && (
          <div className="flex flex-col items-center justify-center space-y-6 py-4">
            <div className="bg-white p-4 rounded-2xl shadow-inner">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=0-0-0&bgcolor=ffffff&data=${encodeURIComponent(activeQrUrl)}`}
                alt="QR Code"
                className="w-48 h-48 block"
              />
            </div>
            <p className="text-sm font-mono text-gray-400 text-center select-all">{activeQrUrl}</p>
          </div>
        )}
      </Modal>

      <NicknameEditModal
        isOpen={activeEditLink !== null}
        onClose={() => setActiveEditLink(null)}
        currentNickname={activeEditLink?.nickname || null}
        onSave={executeNicknameSave}
      />

      <DeleteConfirmModal
        isOpen={activeDeleteLink !== null}
        onClose={() => setActiveDeleteLink(null)}
        shortCode={activeDeleteLink?.short_code || ''}
        nickname={activeDeleteLink?.nickname || null}
        onConfirm={executeDelete}
      />
    </div>
  );
}
