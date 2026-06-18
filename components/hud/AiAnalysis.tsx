'use client';

import React, { useState } from 'react';
import { Brain, Loader2, Send } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';

interface AiAnalysisProps {
  gameState: any;
}

export function AiAnalysis({ gameState }: AiAnalysisProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const performAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameState),
      });
      const data = await res.json();
      setAnalysis(data.text);
    } catch (err) {
      console.error(err);
      setAnalysis("Error connecting to AI Strategist neural link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700 text-slate-300">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-purple-400" />
          <span className="uppercase tracking-widest text-[10px] font-bold">Neural Strategist</span>
        </div>
        <button 
          onClick={performAnalysis}
          disabled={loading}
          className="p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto text-sm text-slate-300">
        {!analysis && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-2">
            <Brain size={32} className="opacity-20" />
            <p className="text-xs uppercase tracking-tighter">Ready for Hand Data Analysis</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            <div className="h-4 w-3/4 bg-slate-800 animate-pulse rounded" />
            <div className="h-4 w-1/2 bg-slate-800 animate-pulse rounded" />
            <div className="h-4 w-5/6 bg-slate-800 animate-pulse rounded" />
          </div>
        )}

        {analysis && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose prose-invert prose-xs max-w-none"
          >
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </motion.div>
        )}
      </div>
    </div>
  );
}
