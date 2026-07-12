import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  shortCode: string;
  nickname: string | null;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  shortCode,
  nickname,
}) => {
  const [confirmVal, setConfirmVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const targetText = nickname || shortCode;

  useEffect(() => {
    if (isOpen) {
      setConfirmVal('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmVal === targetText) {
      onConfirm();
    }
  };

  const isConfirmed = confirmVal === targetText;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Link Permanently">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-start gap-3 p-4 bg-red-950/20 border border-red-900/40 rounded-2xl text-red-200">
          <AlertTriangle className="shrink-0 mt-0.5 text-red-500" size={18} />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-red-100">Warning: Irreversible action</p>
            <p className="text-red-200/70">Once deleted, all click analytics associated with this short link will be permanently lost.</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-gray-300">
            Type <span className="font-mono text-white font-bold bg-white/10 px-2 py-1 rounded border border-white/5">{targetText}</span> to confirm.
          </p>
          <input
            ref={inputRef}
            type="text"
            placeholder="Confirm name"
            value={confirmVal}
            onChange={(e) => setConfirmVal(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 focus:bg-black/40 transition-all"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={!isConfirmed}
          >
            Delete permanently
          </Button>
        </div>
      </form>
    </Modal>
  );
};
