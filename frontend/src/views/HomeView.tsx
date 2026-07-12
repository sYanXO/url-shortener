import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, QrCode, Copy, Check, ExternalLink, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/Modal';
import { useLinks } from '../hooks/useLinks';

export const HomeView: React.FC = () => {
  const [originalUrl, setOriginalUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [shortenLoading, setShortenLoading] = useState(false);
  const [shortenResult, setShortenResult] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeQrUrl, setActiveQrUrl] = useState<string | null>(null);

  const { links, mutateLinks } = useLinks();
  const recentLinks = links.slice(0, 10);

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

      setShortenResult(data.short_code);
      toast.success('Link shortened successfully!');
      
      // Trigger SWR refetch to update Recent Links
      mutateLinks();

      setOriginalUrl('');
      setNickname('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setShortenLoading(false);
    }
  };

  const copyToClipboard = (code: string) => {
    const fullUrl = `${window.location.origin}/${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCode(code);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <motion.div 
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

      {recentLinks.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="space-y-5"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 pl-2">Recent Links</h3>
          <div className="space-y-3">
            <AnimatePresence>
              {recentLinks.map((item) => (
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
    </motion.div>
  );
};
