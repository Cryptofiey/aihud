'use client';

import React from 'react';

const SUITS: Record<string, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

const COLORS: Record<string, string> = {
  S: 'text-slate-900',
  H: 'text-red-600',
  D: 'text-blue-600',
  C: 'text-green-700',
};

interface PokerCardProps {
  rank: string;
  suit: string;
  className?: string;
}

export function PokerCard({ rank, suit, className = '' }: PokerCardProps) {
  const suitChar = SUITS[suit] || suit;
  const colorClass = COLORS[suit] || 'text-slate-900';

  return (
    <div className={`relative w-12 h-16 bg-white border border-slate-300 rounded shadow-sm flex flex-col items-center justify-center font-bold text-lg select-none ${className}`}>
      <div className={`absolute top-0.5 left-1 text-[10px] leading-tight flex flex-col items-center ${colorClass}`}>
        <span>{rank}</span>
        <span className="text-[8px]">{suitChar}</span>
      </div>
      <div className={`text-2xl ${colorClass}`}>
        {suitChar}
      </div>
      <div className={`absolute bottom-0.5 right-1 text-[10px] leading-tight flex flex-col items-center rotate-180 ${colorClass}`}>
        <span>{rank}</span>
        <span className="text-[8px]">{suitChar}</span>
      </div>
    </div>
  );
}
