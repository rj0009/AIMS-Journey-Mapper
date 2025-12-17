import React, { useState } from 'react';

interface Props {
  onSendMessage: (msg: string) => Promise<void>;
  isProcessing: boolean;
}

export const ChatRefiner: React.FC<Props> = ({ onSendMessage, isProcessing }) => {
  const [input, setInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const msg = input;
    setInput('');
    await onSendMessage(msg);
  };

  return (
    <div className="bg-white border-t border-gray-200 p-4 no-print">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Refine map (e.g., 'Add a digital kiosk touchpoint to the Service stage')"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ncss-purple/50"
          disabled={isProcessing}
        />
        <button
          type="submit"
          disabled={isProcessing}
          className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          {isProcessing ? 'Updating...' : 'Update'}
        </button>
      </form>
    </div>
  );
};