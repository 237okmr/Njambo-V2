import React, { useState, useEffect } from 'react';
import { Download, Smartphone, CheckCircle2, ExternalLink, X, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: BeforeInstallPromptEvent | null;
  onInstallSuccess?: () => void;
}

export const InstallPwaModal: React.FC<InstallPwaModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallSuccess,
}) => {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [installedSuccessfully, setInstalledSuccessfully] = useState<boolean>(false);
  const [isIframe, setIsIframe] = useState<boolean>(false);

  useEffect(() => {
    // Check if already in standalone app mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(Boolean(isStandaloneMode));

    // Check if inside iframe
    try {
      setIsIframe(window.self !== window.top);
    } catch {
      setIsIframe(true);
    }
  }, [isOpen]);

  const handleNativeInstallClick = async () => {
    if (!deferredPrompt) {
      // If no prompt event available (e.g. inside iframe or already prompted), open standalone URL
      const targetUrl = window.location.href;
      window.open(targetUrl, '_blank');
      return;
    }

    try {
      setIsInstalling(true);
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalledSuccessfully(true);
        if (onInstallSuccess) onInstallSuccess();
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err) {
      console.warn('Native install prompt error:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleOpenDirectInNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="install-pwa-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-2xl text-slate-100 overflow-hidden"
        >
          {/* Background Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-lg font-black text-white">Installer sur Android</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Chrome
                </span>
              </div>
              <p className="text-xs text-slate-400">Application native complète (PWA / WebAPK)</p>
            </div>
          </div>

          {/* Already installed state */}
          {isStandalone || installedSuccessfully ? (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-3 mb-5">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <div className="text-xs text-emerald-200">
                <p className="font-bold text-emerald-300">Application installée avec succès !</p>
                <p className="text-[11px] text-emerald-400/80 mt-0.5">
                  Njambo Kora est désormais accessible directement parmi vos icônes Android.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Feature Highlights */}
              <div className="grid grid-cols-2 gap-2.5 mb-5 text-left">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Plein écran</span>
                  </div>
                  <span className="text-[11px] text-slate-400 leading-tight">
                    Sans barre de navigation Chrome
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Tiroir d'apps</span>
                  </div>
                  <span className="text-[11px] text-slate-400 leading-tight">
                    Icône dédiée avec vos autres applications
                  </span>
                </div>
              </div>

              {/* Direct 1-Click Install Button (when supported natively) */}
              {deferredPrompt && (
                <button
                  type="button"
                  onClick={handleNativeInstallClick}
                  disabled={isInstalling}
                  className="w-full py-3.5 px-4 mb-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 border border-amber-300/60 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isInstalling ? 'Installation en cours...' : "Installer l'application maintenant"}</span>
                </button>
              )}

              {/* In iframe alert */}
              {isIframe && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 mb-4 text-left">
                  <p className="text-xs font-bold text-amber-300 mb-1 flex items-center gap-1.5">
                    <span>💡 Pour installer dans Chrome sur Android :</span>
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-2.5">
                    Ouvrez le jeu dans son onglet dédié Chrome, puis utilisez le menu d'installation ci-dessous.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenDirectInNewTab}
                    className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ouvrir en plein écran dans Chrome</span>
                  </button>
                </div>
              )}

              {/* Step-by-Step Android Chrome Visual Schematic */}
              <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-left">
                <h4 className="text-[10px] font-black text-amber-300 uppercase tracking-wider mb-2.5">
                  Guide Rapide Chrome Android
                </h4>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center gap-1">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[10px] flex items-center justify-center">1</span>
                    <span className="font-mono font-bold text-xs text-white">Menu ⋮</span>
                    <span className="text-[9px] text-slate-400">En haut à droite</span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center gap-1">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-black text-[10px] flex items-center justify-center">2</span>
                    <span className="font-bold text-xs text-amber-300">Installer</span>
                    <span className="text-[9px] text-slate-400">l'application</span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col items-center gap-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-black text-[10px] flex items-center justify-center">3</span>
                    <span className="font-bold text-xs text-emerald-300">Prêt</span>
                    <span className="text-[9px] text-slate-400">Icône sur l'écran</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Footer Action */}
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
