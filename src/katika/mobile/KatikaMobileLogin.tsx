import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, AlertCircle, Loader2, Bot, ArrowLeft, Download } from 'lucide-react';
import { useKatikaAuth, KATIKA_AUTHORIZED_EMAIL } from '../context/KatikaAuthContext';
import { setPwaIdentity } from '../utils/pwaManifestSwitcher';
import { useNjamboCopilotInstall } from '../hooks/useNjamboCopilotInstall';
import { NjamboCopilotInstallModal } from '../components/pwa/NjamboCopilotInstallModal';

export const KatikaMobileLogin: React.FC = () => {
  const { loginWithGoogle, loading, loginError } = useKatikaAuth();
  const {
    deferredPrompt,
    isInstalled,
    showModal,
    setShowModal,
    triggerInstall,
  } = useNjamboCopilotInstall();

  useEffect(() => {
    setPwaIdentity('COPILOT');
  }, []);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between p-6 select-none font-sans relative overflow-hidden">
      {/* Background ambient lighting */}
      <div 
        className="absolute inset-0 opacity-[0.04] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`,
          backgroundSize: '20px 20px'
        }}
      />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Bot className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold tracking-wider text-white">NJAMBO COPILOTE</span>
        </div>
        
        <div className="flex items-center gap-2">
          {!isInstalled && (
            <button
              type="button"
              onClick={triggerInstall}
              className="px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Installer l'App</span>
            </button>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
            Mobile
          </span>
        </div>
      </div>

      {/* Center Card */}
      <div className="relative z-10 my-auto w-full max-w-sm mx-auto flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
          <ShieldCheck className="w-9 h-9 text-amber-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Accès Agent IA Sécurisé
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed px-4">
            Console mobile d'audit, d'analyse et de pilotage stratégique de Njambo Kora.
          </p>
        </div>

        {/* Security Whitelist Badge */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-left flex items-start gap-3 shadow-inner">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-[11px]">
            <span className="text-slate-400">Compte administratif vérifié :</span>
            <div className="font-mono text-amber-300 font-semibold truncate">
              {KATIKA_AUTHORIZED_EMAIL}
            </div>
          </div>
        </div>

        {/* Error alert if any */}
        {loginError && (
          <div className="w-full p-3 rounded-xl bg-rose-950/70 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        {/* Google Sign-in Button */}
        <div className="w-full space-y-3">
          <button
            type="button"
            id="katika-mobile-google-signin-btn"
            onClick={loginWithGoogle}
            disabled={loading}
            className="w-full h-13 flex items-center justify-center gap-3 px-4 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-950 font-bold text-sm transition shadow-xl disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
                <span>Vérification de l'identité...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                <span>Connexion avec Google</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => window.location.replace('/')}
            className="w-full h-11 flex items-center justify-center gap-2 px-4 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium transition border border-slate-800 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retourner au jeu Njambo Kora</span>
          </button>
        </div>
      </div>

      {/* Footer Security Note */}
      <div className="relative z-10 pb-4 text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3 text-slate-500" />
        <span>Session persistante chiffrée • Accès administrateur exclusif</span>
      </div>

      {/* Njambo Copilote PWA Install Modal */}
      <NjamboCopilotInstallModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        deferredPrompt={deferredPrompt}
      />
    </div>
  );
};
