import React, { useState } from 'react';
import { Check, Copy, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useBackLayer } from '../../hooks/useBackLayer';
import { triggerHaptic } from '../../utils/sound';
import { getPublicParamNumber } from '../../services/publicConfig';
import { spacedTableCode } from '../../utils/tableInvite';

interface TableQrSheetProps {
  open: boolean;
  onClose: () => void;
  /** Code de la table. */
  code: string;
  /** Lien d'invitation : ?join= pour une table gratuite, ?cash= pour une table Kora Cash. */
  url: string;
  cash: boolean;
}

/** Invitation en présentiel : un grand QR code à scanner avec l'appareil photo, et le code en gros pour le dicter. */
export const TableQrSheet: React.FC<TableQrSheetProps> = ({ open, onClose, code, url, cash }) => {
  const [copied, setCopied] = useState(false);
  useBackLayer(open, onClose);
  if (!open) return null;

  const copy = () => {
    try {
      void navigator.clipboard.writeText(code);
      setCopied(true);
      triggerHaptic('light');
      setTimeout(() => setCopied(false), getPublicParamNumber('uiCopyConfirmMs'));
    } catch {
      // Copie indisponible : le code reste affiché en grand, il peut se dicter.
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/90 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="QR code de la table">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col items-center gap-4 text-center shadow-2xl">
        <div className="flex items-center justify-between w-full">
          <span className="flex items-center gap-2 text-base font-black text-white">
            <QrCode className="w-5 h-5 text-amber-400" /> {cash ? 'Table Kora Cash' : 'Table de jeu'}
          </span>
          <button type="button" aria-label="Fermer" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-xl">
          <QRCodeSVG value={url} size={220} level="M" includeMargin={false} bgColor="#ffffff" fgColor="#0f172a" />
        </div>
        <span className="text-xs text-slate-400">Scanne ce code avec l'appareil photo du téléphone : il ouvre la table directement.</span>

        <div className="w-full p-3 rounded-2xl bg-slate-950 border border-amber-500/40 flex flex-col items-center gap-1">
          <span className="text-xs font-black uppercase tracking-wider text-amber-400">Ou dicte le code</span>
          <span className="text-3xl font-black text-white font-mono tracking-widest" aria-label={`Code de la table : ${spacedTableCode(code)}`}>{spacedTableCode(code)}</span>
        </div>

        {cash && <span className="text-xs text-slate-400">Argent réel, réservé aux joueurs de 18 ans et plus. Chacun choisit sa mise à l'ouverture de la table.</span>}

        <button
          type="button"
          onClick={copy}
          className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Code copié' : 'Copier le code'}</span>
        </button>
      </div>
    </div>
  );
};
