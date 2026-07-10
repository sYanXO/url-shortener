import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { ShieldAlert } from 'lucide-react';

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
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Rate limit warning box */}
        <div className="flex items-start gap-3 p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg text-amber-200">
          <ShieldAlert className="shrink-0 mt-0.5" size={18} />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-amber-100">7-Day Restriction Rule</p>
            <p>Nickname updates are restricted. You can only update this nickname once every 7 days.</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400">Nickname</label>
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter fun nickname (e.g. Work Portfolio)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={loading}
            className="w-full bg-[#202127] border border-[#2e303a] rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500 disabled:opacity-50 transition-colors"
          />
        </div>

        {errorMsg && (
          <p className="text-xs text-red-400 font-medium">{errorMsg}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-[#202127] rounded-lg disabled:opacity-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg shadow-lg hover:shadow-purple-900/30 transition-all"
          >
            {loading ? 'Saving...' : 'Save Nickname'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
