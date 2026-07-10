import React, { useState, useEffect } from 'react';
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
  // Navigation Router state
  const [view, setView] = useState<'home' | 'dashboard'>('home');

  // Input forms state
  const [originalUrl, setOriginalUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [shortenLoading, setShortenLoading] = useState(false);
  const [shortenError, setShortenError] = useState<string | null>(null);
  const [shortenResult, setShortenResult] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Local storage history state (Landing page)
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

  // Load local history on mount
  useEffect(() => {
    const saved = localStorage.getItem('shorty_history');
    if (saved) {
      try {
        setLocalHistory(JSON.parse(saved));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  // Fetch dashboard data
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
      console.error('Failed to load dashboard data:', e);
    }
  };

  // Sync data when view switches
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

  // Handle URL Shorten submission
  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    setShortenLoading(true);
    setShortenError(null);
    setShortenResult(null);

    let targetUrl = originalUrl.trim();
    if (!targetUrl) return;

    // Auto-prefix schema
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

      // Add to local history list
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

      // Reset fields
      setOriginalUrl('');
      setNickname('');
    } catch (e: any) {
      setShortenError(e.message);
    } finally {
      setShortenLoading(false);
    }
  };

  // Execute Link Deletion
  const executeDelete = async () => {
    if (!activeDeleteLink) return;
    const shortCode = activeDeleteLink.short_code;
    try {
      const res = await fetch(`/api/links/${shortCode}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete link');

      // Update state arrays
      setAllLinks(allLinks.filter(l => l.short_code !== shortCode));
      setLocalHistory(localHistory.filter(l => l.short_code !== shortCode));
      localStorage.setItem('shorty_history', JSON.stringify(localHistory.filter(l => l.short_code !== shortCode)));

      // Refresh Stats
      fetchDashboardData();
      setActiveDeleteLink(null);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Execute Nickname Update
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

    // Update state arrays
    setAllLinks(allLinks.map(l => l.short_code === shortCode ? { ...l, nickname: newNickname } : l));
    const updatedLocal = localHistory.map(l => l.short_code === shortCode ? { ...l, nickname: newNickname } : l);
    setLocalHistory(updatedLocal);
    localStorage.setItem('shorty_history', JSON.stringify(updatedLocal));

    // Refresh data
    fetchDashboardData();
  };

  const copyToClipboard = (code: string) => {
    const fullUrl = `${window.location.origin}/${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Filter links in Dashboard search
  const filteredLinks = allLinks.filter(l => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (l.original_url || '').toLowerCase().includes(q) ||
           (l.nickname || '').toLowerCase().includes(q) ||
           (l.short_code || '').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#c5c6c7] selection:bg-purple-500/30">
      
      {/* Top Navbar */}
      <nav className="border-b border-[#1f2833] bg-[#0b0c10]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <div className="bg-gradient-to-tr from-purple-600 to-indigo-500 p-2 rounded-lg text-white">
              <Link2 size={18} />
            </div>
            <span className="font-serif font-bold text-lg text-gray-100 tracking-wide">Shorty</span>
          </div>

          <div className="flex items-center gap-4">
            {view === 'home' ? (
              <button
                onClick={() => setView('dashboard')}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 border border-[#2e303a] hover:border-purple-500 text-gray-200 hover:text-white rounded-lg transition-all shadow-sm"
              >
                <LayoutDashboard size={14} />
                Dashboard
              </button>
            ) : (
              <button
                onClick={() => setView('home')}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 border border-[#2e303a] hover:border-purple-500 text-gray-200 hover:text-white rounded-lg transition-all shadow-sm"
              >
                <Home size={14} />
                Shortener
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ============================================= */}
      {/* LANDING PAGE VIEW */}
      {/* ============================================= */}
      {view === 'home' && (
        <main className="max-w-3xl mx-auto px-6 py-20 space-y-16">
          <div className="text-center space-y-4">
            <h1 className="text-5xl md:text-6xl font-serif font-bold tracking-tight text-gray-100">
              Shorten links.<br/>Track analytics.
            </h1>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              A minimalist, premium workspace to customize short codes, create nicknames, and audit click counts instantly.
            </p>
          </div>

          {/* Shorten Form Card */}
          <div className="bg-[#16171d] border border-[#2e303a] rounded-2xl p-6 md:p-8 shadow-xl">
            <form onSubmit={handleShorten} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 relative">
                  <input
                    type="text"
                    required
                    placeholder="Enter long link..."
                    value={originalUrl}
                    onChange={(e) => setOriginalUrl(e.target.value)}
                    className="w-full bg-[#202127] border border-[#2e303a] rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Nickname (optional)"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-[#202127] border border-[#2e303a] rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              {shortenError && (
                <p className="text-xs text-red-400 font-medium">{shortenError}</p>
              )}

              <button
                type="submit"
                disabled={shortenLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold text-sm py-3 px-6 rounded-xl shadow-lg hover:shadow-purple-900/20 transition-all flex items-center justify-center gap-1.5"
              >
                {shortenLoading ? 'Shortening...' : (
                  <>
                    Shorten Link
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Shorten Success Result */}
            {shortenResult && (
              <div className="mt-6 p-4 bg-[#202127] border border-[#2e303a] rounded-xl flex items-center justify-between gap-4 animate-fade-in">
                <div className="truncate min-w-0">
                  <span className="text-xs text-gray-500 uppercase font-mono block">Short code generated</span>
                  <a 
                    href={`${window.location.origin}/${shortenResult}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-400 hover:text-purple-300 font-mono text-sm font-semibold truncate hover:underline"
                  >
                    {window.location.origin}/{shortenResult}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveQrUrl(`${window.location.origin}/${shortenResult}`)}
                    className="p-2 border border-[#2e303a] hover:border-gray-500 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title="View QR Code"
                  >
                    <QrCode size={16} />
                  </button>
                  <button
                    onClick={() => copyToClipboard(shortenResult)}
                    className="p-2 border border-[#2e303a] hover:border-purple-500 rounded-lg text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-1"
                    title="Copy to Clipboard"
                  >
                    {copiedCode === shortenResult ? <Check size={16} className="text-purple-400" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Local Storage History List */}
          {localHistory.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Recently Shortened</h3>
              <div className="space-y-3">
                {localHistory.map((item) => (
                  <div key={item.short_code} className="bg-[#16171d] border border-[#2e303a] rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="truncate min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-200 font-semibold">{item.short_code}</span>
                        {item.nickname && (
                          <span className="bg-purple-950/40 text-purple-400 text-[10px] px-2 py-0.5 rounded border border-purple-900/50 font-medium">
                            {item.nickname}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono truncate mt-1">{item.original_url}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <a 
                        href={`${window.location.origin}/${item.short_code}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 border border-[#2e303a] hover:border-gray-500 rounded-lg text-gray-400 hover:text-white transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => copyToClipboard(item.short_code)}
                        className="p-2 border border-[#2e303a] hover:border-purple-500 rounded-lg text-gray-400 hover:text-purple-400 transition-colors"
                      >
                        {copiedCode === item.short_code ? <Check size={14} className="text-purple-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ============================================= */}
      {/* DASHBOARD VIEW */}
      {/* ============================================= */}
      {view === 'dashboard' && (
        <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
          
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-100">Overview Dashboard</h2>
              <p className="text-xs text-gray-500">Live analytics metrics and links registry.</p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Search input */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search short code, url..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[#16171d] border border-[#2e303a] rounded-lg pl-9 pr-4 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500 w-60 transition-colors"
                />
              </div>

              {/* Refresh button */}
              <button
                onClick={handleRefresh}
                className="p-2 border border-[#2e303a] hover:border-purple-500 text-gray-400 hover:text-purple-400 bg-[#16171d] rounded-lg transition-colors"
                title="Refresh stats"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin-slow' : ''} />
              </button>
            </div>
          </div>

          {/* Stats Metric Cards Grid */}
          <StatsGrid totalLinks={stats.total_links} totalClicks={stats.total_clicks} />

          {/* Clicks History Graph */}
          {clickHistory.length > 0 && <ClicksChart data={clickHistory} />}

          {/* Registry list table */}
          <div className="bg-[#16171d] border border-[#2e303a] rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-[#2e303a]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Registered Links</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#2e303a] text-xs font-semibold text-gray-500 bg-[#1a1b22]">
                    <th className="px-6 py-3">Short code</th>
                    <th className="px-6 py-3">Destination URL</th>
                    <th className="px-6 py-3">Nickname</th>
                    <th className="px-6 py-3 text-center">Clicks</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2e303a]">
                  {filteredLinks.length > 0 ? (
                    filteredLinks.map((link) => (
                      <tr key={link.short_code} className="hover:bg-[#1a1b22]/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-semibold text-purple-400 whitespace-nowrap">
                          <span 
                            onClick={() => copyToClipboard(link.short_code)}
                            className="cursor-pointer hover:underline"
                            title="Copy link"
                          >
                            {link.short_code}
                          </span>
                          {copiedCode === link.short_code && (
                            <span className="ml-2 text-[10px] text-teal-400 bg-teal-950/30 border border-teal-900/50 px-1 py-0.5 rounded font-normal">
                              Copied
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate text-gray-400 font-mono" title={link.original_url}>
                          {link.original_url}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {link.nickname ? (
                            <span className="bg-[#202127] text-gray-200 text-xs px-2.5 py-1 rounded border border-[#2e303a] font-medium">
                              {link.nickname}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs italic">none</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap font-mono font-bold text-gray-300">
                          {link.click_count.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setActiveQrUrl(`${window.location.origin}/${link.short_code}`)}
                              className="p-1.5 border border-[#2e303a] hover:border-gray-500 text-gray-400 hover:text-white rounded-lg transition-colors"
                              title="View QR Code"
                            >
                              <QrCode size={13} />
                            </button>
                            <button
                              onClick={() => setActiveEditLink(link)}
                              className="p-1.5 border border-[#2e303a] hover:border-purple-500 text-gray-400 hover:text-purple-400 rounded-lg transition-colors"
                              title="Edit Nickname"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => setActiveDeleteLink(link)}
                              className="p-1.5 border border-[#2e303a] hover:border-red-500 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                              title="Delete Link"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                        No links matched your query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* ============================================= */}
      {/* GLOBAL MODALS */}
      {/* ============================================= */}
      
      {/* QR Code Modal */}
      <Modal isOpen={activeQrUrl !== null} onClose={() => setActiveQrUrl(null)} title="QR Code Link">
        {activeQrUrl && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-inner">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=0-0-0&bgcolor=ffffff&data=${encodeURIComponent(activeQrUrl)}`}
                alt="QR Code"
                className="w-48 h-48 block"
              />
            </div>
            <p className="text-xs font-mono text-gray-400 text-center select-all truncate max-w-xs">{activeQrUrl}</p>
          </div>
        )}
      </Modal>

      {/* Nickname Edit Modal */}
      <NicknameEditModal
        isOpen={activeEditLink !== null}
        onClose={() => setActiveEditLink(null)}
        currentNickname={activeEditLink?.nickname || null}
        onSave={executeNicknameSave}
      />

      {/* Delete Confirmation Modal */}
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
