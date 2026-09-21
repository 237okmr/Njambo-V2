import React from 'react';
import { ShieldCheck, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { useKatikaAuth } from '../context/KatikaAuthContext';

export const KatikaLogin: React.FC = () => {
  const { loginWithGoogle, loading, loginError } = useKatikaAuth();

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      {/* Subtle cockpit background grid */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Cockpit ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
        {/* Header Badge */}
        <div className="flex items-center justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner">
            <ShieldCheck className="w-7 h-7 text-amber-400" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Katika <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-medium border border-amber-500/30">Cockpit</span>
          </h1>
          <p className="text-sm text-slate-400">
            Console de commandement & supervision sécurisée.
          </p>
        </div>

        {/* Error notification if any */}
        {loginError && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        {/* Google Sign-in Action */}
        <div className="space-y-4">
          <button
            type="button"
            id="katika-google-signin-btn"
            onClick={loginWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition-all duration-150 shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-slate-700" />
                <span>Connexion sécurisée en cours...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Connexion Google Katika</span>
              </>
            )}
          </button>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Accès réservé & filtré
            </span>
            <span className="font-mono text-slate-400">Poste de travail PC</span>
          </div>
        </div>
      </div>
    </div>
  );
};
