import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, QrCode, Share2, MessageCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { FriendService } from '../../services/friendService';
import { triggerHaptic } from '../../utils/sound';

interface FriendQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  activeRoomCode?: string | null;
  storedFriendCode?: string;
}

export const FriendQrModal: React.FC<FriendQrModalProps> = ({
  isOpen,
  onClose,
  playerId,
  playerName,
  activeRoomCode,
  storedFriendCode,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const friendCode = FriendService.getFriendCode(playerId, storedFriendCode);
  const qrValue = activeRoomCode
    ? FriendService.getShareInviteUrl(activeRoomCode, playerId)
    : `${window.location.origin}${window.location.pathname}?friendCode=${encodeURIComponent(friendCode)}&friendName=${encodeURIComponent(playerName)}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(friendCode);
    setCopiedCode(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrValue);
    setCopiedLink(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    triggerHaptic('medium');
    const waUrl = activeRoomCode
      ? FriendService.getWhatsAppShareUrl(activeRoomCode, playerName)
      : `https://wa.me/?text=${encodeURIComponent(
          `🃏 Ajoute-moi sur Njambo Kora !\nMon Code Ami est : ${friendCode}\nRejoins-moi ici : ${qrValue}`
        )}`;
    window.open(waUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 shadow-2xl flex flex-col items-center gap-4 text-center"
        >
          {/* Header */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-black text-white">Mon Code & QR Code</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Friend Code Display Card */}
          <div className="w-full p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/20 via-slate-950 to-slate-950 border border-amber-500/40 flex items-center justify-between gap-2">
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Mon Code Ami Unique</span>
              <span className="text-xl font-black text-white font-mono tracking-wider">{friendCode}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copié !' : 'Copier'}</span>
            </button>
          </div>

          {/* QR Code Container */}
          <div className="p-4 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center">
            <QRCodeSVG
              value={qrValue}
              size={180}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          </div>
          <span className="text-[11px] text-slate-400 -mt-1">
            Faites scanner ce QR Code par un ami avec son appareil photo
          </span>

          {/* Actions : WhatsApp Direct & Partager */}
          <div className="flex flex-col gap-2 w-full pt-1">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition active:scale-98 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>📲 Inviter via WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Lien copié dans le presse-papier' : 'Copier le lien universel'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
