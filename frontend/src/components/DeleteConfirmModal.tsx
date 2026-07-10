import React, { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

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
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Link permanently">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-red-200">
          <AlertTriangle className="shrink-0 mt-0.5" size={18} />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-red-100">Warning: This action is irreversible.</p>
            <p>Once deleted, all click analytics associated with this short link will be permanently lost.</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            Type <span className="font-mono text-gray-200 font-bold bg-[#202127] px-1.5 py-0.5 rounded">{targetText}</span> to confirm.
          </p>
          <input
            ref={inputRef}
            type="text"
            placeholder="Confirm name"
            value={confirmVal}
            onChange={(e) => setConfirmVal(e.target.value)}
            className="w-full bg-[#202127] border border-[#2e303a] rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-[#202127] rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isConfirmed}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-lg hover:shadow-red-900/30 transition-all"
          >
            Delete permanently
          </button>
        </div>
      </form>
    </Modal>
  );
};
