import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  LogOut, 
  Activity, 
  Power, 
  Monitor, 
  Server
} from 'lucide-react';
import { useKatikaAuth } from '../context/KatikaAuthContext';

interface KatikaHeaderProps {
  isMaintenanceMode: boolean;
  onToggleMaintenance: () => void;
}

export const KatikaHeader: React.FC<KatikaHeaderProps> = ({
  isMaintenanceMode,
  onToggleMaintenance,
}) => {
  const { user, logout } = useKatikaAuth();
  const [latency, setLatency] = useState<number>(12);

  // Real ping probe to measure actual server latency
  useEffect(() => {
    const pingServer = async () => {
      const start = performance.now();
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          const duration = Math.round(performance.now() - start);
          setLatency(Math.max(1, duration));
        }
      } catch {
        setLatency(999);
      }
    };

    pingServer();
    const interval = setInterval(pingServer, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 border-b border-slate-800/90 bg-slate-900/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50 select-none">
      {/* Brand & Katika Shield */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner">
          <ShieldCheck className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-tight text-white text-base">KATIKA</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono border border-amber-500/30 font-medium">
              CONTROL COCKPIT
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Plateforme de commandement & supervision Njambo Kora</p>
        </div>
      </div>

      {/* Center & Right Actions */}
      <div className="flex items-center gap-4">
        {/* WS Server Health & Latency */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-xs">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">Serveur WS :</span>
          <span className="font-mono text-emerald-300 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
            Connecté
          </span>
          <div className="pl-2 border-l border-slate-700 flex items-center gap-1 text-[11px] font-mono text-slate-300">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>{latency} ms</span>
          </div>
        </div>

        {/* Quick Action: Maintenance Toggle */}
        <button
          type="button"
          id="katika-quick-maintenance-toggle"
          onClick={onToggleMaintenance}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer ${
            isMaintenanceMode
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 shadow-inner'
              : 'bg-slate-800/80 text-slate-300 border-slate-700/70 hover:bg-slate-700'
          }`}
          title="Activer/Désactiver le mode maintenance global"
        >
          <Power className={`w-3.5 h-3.5 ${isMaintenanceMode ? 'text-amber-400 animate-spin' : 'text-slate-400'}`} />
          <span>{isMaintenanceMode ? 'Maintenance ON' : 'Mode Normal'}</span>
        </button>

        {/* PC Station Verification Info */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400 font-mono">
          <Monitor className="w-3.5 h-3.5 text-slate-400" />
          <span>PC Station</span>
        </div>

        {/* Katika Admin Profile & Logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
          <div className="text-right text-xs">
            <div className="font-medium text-slate-100">{user?.displayName || 'Katika Master'}</div>
            <div className="text-[11px] text-amber-400/90 font-mono">{user?.email}</div>
          </div>
          <button
            type="button"
            id="katika-logout-top-btn"
            onClick={logout}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-red-950/70 hover:text-red-300 border border-slate-700/60 hover:border-red-800 text-slate-400 transition-colors cursor-pointer"
            title="Fermer la session Katika"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
