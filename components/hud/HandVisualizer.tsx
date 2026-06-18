'use client';

import React from 'react';
import { PokerCard } from './PokerCard';

interface HandVisualizerProps {
  holeCards: { rank: string; suit: string }[];
  communityCards: { rank: string; suit: string }[];
  handType?: string;
}

export function HandVisualizer({ holeCards, communityCards, handType }: HandVisualizerProps) {
  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-900/40 border border-slate-800 rounded-xl backdrop-blur-sm">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Community Cards</span>
        <div className="flex gap-2 min-h-[64px]">
          {communityCards.length > 0 ? communityCards.map((card, i) => (
            <PokerCard key={`com-${i}`} rank={card.rank} suit={card.suit} />
          )) : (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-12 h-16 bg-slate-800/50 border border-slate-700 border-dashed rounded" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Your Hand</span>
          <div className="flex gap-2">
            {holeCards.map((card, i) => (
              <PokerCard key={`hole-${i}`} rank={card.rank} suit={card.suit} className="shadow-lg shadow-blue-500/10 scale-110" />
            ))}
          </div>
        </div>
        
        {handType && (
          <div className="bg-blue-600/20 border border-blue-500/50 px-4 py-2 rounded-lg text-blue-400 font-bold uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse">
            {handType}
          </div>
        )}
      </div>
    </div>
  );
}
