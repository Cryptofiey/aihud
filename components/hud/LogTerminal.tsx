'use client';

import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'success' | 'bot';
}

interface LogTerminalProps {
  logs: LogEntry[];
}

export function LogTerminal({ logs }: LogTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden font-mono text-xs shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 text-slate-400">
        <Terminal size={14} className="text-emerald-500" />
        <span className="uppercase tracking-widest text-[10px] font-bold">Bot System Logs</span>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto space-y-1 scrollbar-hide"
      >
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-2"
            >
              <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
              <span className={`
                ${log.type === 'error' ? 'text-red-400' : ''}
                ${log.type === 'warn' ? 'text-amber-400' : ''}
                ${log.type === 'success' ? 'text-emerald-400' : ''}
                ${log.type === 'bot' ? 'text-purple-400 font-bold' : 'text-slate-300'}
              `}>
                {log.type === 'bot' && '>>> '}{log.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
