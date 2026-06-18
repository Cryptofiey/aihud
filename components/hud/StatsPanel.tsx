'use client';

import React from 'react';
import { Activity, Gauge, Target, Zap } from 'lucide-react';

interface StatItemProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

function StatItem({ label, value, icon, trend, color = 'text-blue-400' }: StatItemProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
      <div className={`p-2 rounded-md bg-slate-800 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] uppercase text-slate-500 font-bold tracking-tighter">{label}</p>
        <p className="text-lg font-mono font-bold text-slate-200">{value}</p>
      </div>
      {trend && (
        <div className="ml-auto text-[10px] font-bold">
          {trend === 'up' && <span className="text-emerald-500">▲</span>}
          {trend === 'down' && <span className="text-red-500">▼</span>}
        </div>
      )}
    </div>
  );
}

export function StatsPanel() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatItem 
        label="VPIP" 
        value="24.5%" 
        icon={<Activity size={16} />} 
        trend="up"
        color="text-emerald-400"
      />
      <StatItem 
        label="PFR" 
        value="18.1%" 
        icon={<Target size={16} />} 
        trend="down"
        color="text-amber-400"
      />
      <StatItem 
        label="3-BET" 
        value="7.2%" 
        icon={<Zap size={16} />} 
        trend="neutral"
        color="text-purple-400"
      />
      <StatItem 
        label="AGG" 
        value="3.1" 
        icon={<Gauge size={16} />} 
        color="text-sky-400"
      />
    </div>
  );
}
