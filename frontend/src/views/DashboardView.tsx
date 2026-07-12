import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, QrCode, Edit3, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';

import { StatsGrid } from '../components/StatsGrid';
import { ClicksChart } from '../components/ClicksChart';
import { NicknameEditModal } from '../components/NicknameEditModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { Modal } from '../components/Modal';
import { Button } from '../components/ui/Button';
import { useLinks, useDashboardData } from '../hooks/useLinks';
import type { LinkMapping } from '../types';

export const DashboardView: React.FC = () => {
  const { links, mutateLinks } = useLinks();
  const { stats, history, refreshAll } = useDashboardData();

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals visibility states
  const [activeQrUrl, setActiveQrUrl] = useState<string | null>(null);
  const [activeDeleteLink, setActiveDeleteLink] = useState<LinkMapping | null>(null);
  const [activeEditLink, setActiveEditLink] = useState<LinkMapping | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([mutateLinks(), refreshAll()]);
    setTimeout(() => setRefreshing(false), 500);
  };

  const copyToClipboard = (code: string) => {
    const fullUrl = `${window.location.origin}/${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCode(code);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const executeDelete = async () => {
    if (!activeDeleteLink) return;
    const shortCode = activeDeleteLink.short_code;
    try {
      const res = await fetch(`/api/links/${shortCode}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete link');

      await mutateLinks(); // Refetch
      refreshAll();
      setActiveDeleteLink(null);
      toast.success('Link deleted successfully');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const executeNicknameSave = async (newNickname: string | null) => {
    if (!activeEditLink) return;
    const shortCode = activeEditLink.short_code;
    try {
      const res = await fetch(`/api/links/${shortCode}/nickname`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: newNickname })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update nickname');

      await mutateLinks(); // Refetch
      toast.success('Nickname updated');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filteredLinks = links.filter(l => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (l.original_url || '').toLowerCase().includes(q) ||
           (l.nickname || '').toLowerCase().includes(q) ||
           (l.short_code || '').toLowerCase().includes(q);
  });

  return (
    <motion.div 
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

      {history.length > 0 && <ClicksChart data={history} />}

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
    </motion.div>
  );
};
