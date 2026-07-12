import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';

interface NicknameEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newNickname: string | null) => Promise<void>;
  currentNickname: string | null;
}

export const NicknameEditModal: React.FC<NicknameEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentNickname,
}) => {
  const [nickname, setNickname] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNickname(currentNickname || '');
      setErrorMsg(null);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, currentNickname]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const cleanNickname = nickname.trim() || null;
      await onSave(cleanNickname);
      onClose();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to update nickname');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Link Nickname">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Rate limit warning box */}
        <div className="flex items-start gap-3 p-4 bg-amber-950/20 border border-amber-900/40 rounded-2xl text-amber-200">
          <ShieldAlert className="shrink-0 mt-0.5 text-amber-500" size={18} />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-amber-100">7-Day Restriction Rule</p>
            <p className="text-amber-200/70">Nickname updates are restricted. You can only update this nickname once every 7 days.</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Nickname</label>
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter fun nickname (e.g. Work Portfolio)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={loading}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-black/40 disabled:opacity-50 transition-all"
          />
        </div>

        {errorMsg && (
          <p className="text-sm text-red-400 font-medium bg-red-950/20 px-3 py-2 rounded-lg">{errorMsg}</p>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Nickname'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
