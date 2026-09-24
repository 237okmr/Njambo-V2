import React, { useState } from 'react';
import { Users, Globe, PlusCircle, ArrowRight, Bot, Shield, Zap, Sparkles, X, Check, Copy, Timer } from 'lucide-react';
import { getLocalPlayerName, setLocalPlayerName } from '../services/identity';
import { getKatikaConfigSync } from '../katika/services/katikaService';
import { getPublicParamNumber } from '../services/publicConfig';
import { getTurnTimerChoices } from '../../server/engine/engineParams';

interface MultiplayerHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRoom: (settings: {
    playerName: string;
    fillWithBots: boolean;
    maxPlayers?: number;
    baseBet: number;
    initialCapital: number;
    enableDoubleKora: boolean;
    enableUnder21: boolean;
    turnTimerSeconds?: number;
    afkAction?: 'auto_play' | 'replace_bot';
  }) => Promise<void>;
  onJoinRoom: (roomCode: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
}

export const MultiplayerHubModal: React.FC<MultiplayerHubModalProps> = ({
  isOpen,
  onClose,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room') ? 'join' : 'create';
    } catch {
      return 'create';
    }
  });
  const [playerName, setPlayerNameState] = useState<string>(() => getLocalPlayerName());
  const [roomCode, setRoomCode] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room') || '';
    } catch {
      return '';
    }
  });
  const [maxPlayers, setMaxPlayers] = useState<number>(() => {
    return getKatikaConfigSync().defaultTableMaxPlayers || 2; // Default 1vs1
  });
  const [fillWithBots, setFillWithBots] = useState<boolean>(() => {
    return getKatikaConfigSync().defaultFillWithBots ?? false; // Default 100% human
  });
  const [baseBet, setBaseBet] = useState<number>(10);
  const [initialCapital, setInitialCapital] = useState<number>(100);
  const [afkAction, setAfkAction] = useState<'auto_play' | 'replace_bot'>('replace_bot');
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number>(() => {
    return getPublicParamNumber('turnTimerSeconds');
  });
  const [enableDoubleKora, setEnableDoubleKora] = useState<boolean>(true);
  const [enableUnder21, setEnableUnder21] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      try {
        const currentCfg = getKatikaConfigSync();
        setMaxPlayers(currentCfg.defaultTableMaxPlayers || 2);
        setFillWithBots(currentCfg.defaultFillWithBots ?? false);
        setTurnTimerSeconds(getPublicParamNumber('turnTimerSeconds'));

        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam) {
          setTab('join');
          setRoomCode(roomParam);
        }
      } catch (e) {
        console.error('Failed to parse URL params inside MultiplayerHubModal:', e);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setPlayerNameState(val);
    if (val.trim().toLowerCase() !== 'katika') {
      setLocalPlayerName(val);
    }
  };

  const handleCreate = async () => {
    if (!playerName.trim()) {
      setErrorMsg('Veuillez entrer un pseudo');
      return;
    }
    if (playerName.trim().toLowerCase() === 'katika') {
      setErrorMsg("Le pseudonyme 'Katika' est réservé à l'administration.");
      return;
    }
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await onCreateRoom({
        playerName: playerName.trim(),
        fillWithBots,
        maxPlayers,
        baseBet,
        initialCapital,
        turnTimerSeconds,
        afkAction,
        enableDoubleKora,
        enableUnder21,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la création du salon.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setErrorMsg('Veuillez entrer un pseudo');
      return;
    }
    if (playerName.trim().toLowerCase() === 'katika') {
      setErrorMsg("Le pseudonyme 'Katika' est réservé à l'administration.");
      return;
    }
    if (!roomCode.trim()) {
      setErrorMsg('Veuillez entrer un code de salon');
      return;
    }
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await onJoinRoom(roomCode.trim().toUpperCase(), playerName.trim());
      if (!res.success) {
        setErrorMsg(res.error || 'Impossible de rejoindre le salon.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la connexion au salon.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative text-slate-100 flex flex-col gap-4">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title & Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>Multijoueur en Ligne</span>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700">
                Temps Réel
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Affrontez 1 à 3 autres vrais joueurs dans des parties individuelles synchronisées.
            </p>
          </div>
        </div>

        {/* Pseudo input */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 flex flex-col gap-1.5">
          <label htmlFor="multiplayer-pseudo-input" className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Votre Pseudo</span>
          </label>
          <input
            id="multiplayer-pseudo-input"
            type="text"
            maxLength={18}
            value={playerName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ex: Ousmane, Aïcha, etc."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-medium focus:outline-none focus:border-amber-400 transition"
          />
        </div>

        {/* Tabs: Créer / Rejoindre */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setTab('create');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'create'
                ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Créer un Salon</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('join');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
              tab === 'join'
                ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Rejoindre</span>
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs font-semibold animate-in shake duration-200">
            {errorMsg}
          </div>
        )}

        {/* Tab 1: Créer */}
        {tab === 'create' && (
          <div className="flex flex-col gap-2.5">
            {/* Format de la table (1vs1 par défaut ou 4 Joueurs) */}
            <div className="p-2.5 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-amber-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Format de Table</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {maxPlayers === 2 ? 'Duel 1 contre 1' : 'Table Standard (4p)'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMaxPlayers(2)}
                  className={`py-1.5 px-2 rounded-xl text-center border text-xs font-bold transition cursor-pointer ${
                    maxPlayers === 2
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚔️ Duel (1 vs 1)
                </button>
                <button
                  type="button"
                  onClick={() => setMaxPlayers(4)}
                  className={`py-1.5 px-2 rounded-xl text-center border text-xs font-bold transition cursor-pointer ${
                    maxPlayers === 4
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  👥 4 Joueurs
                </button>
              </div>
            </div>

            {/* Options des places vides & Cadence en ligne */}
            <div className="p-2.5 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-amber-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Remplissage</span>
                </span>
                <span className="text-[11px] font-extrabold uppercase text-amber-400 flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5" />
                  <span>Timer / Tour</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setFillWithBots(true)}
                    className={`py-1.5 px-2 rounded-xl text-center border text-xs font-bold transition cursor-pointer ${
                      fillWithBots
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    👥 Virtuels
                  </button>
                  <button
                    type="button"
                    onClick={() => setFillWithBots(false)}
                    className={`py-1.5 px-2 rounded-xl text-center border text-xs font-bold transition cursor-pointer ${
                      !fillWithBots
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    👤 Humains
                  </button>
                </div>

                <div className="flex-1 grid grid-cols-4 gap-1">
                  {getTurnTimerChoices(getPublicParamNumber('turnTimerSeconds')).map((value) => ({ value, label: `${value}s` })).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setTurnTimerSeconds(item.value)}
                      className={`py-1.5 rounded-xl text-center border text-xs font-bold transition cursor-pointer ${
                        turnTimerSeconds === item.value
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>


              <div className="flex flex-col gap-1 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold text-slate-300">Absence d'un joueur (déconnexion, inactivité, départ)</span>
                <p className="text-[11px] leading-snug text-slate-400">
                  Un relais joue des cartes neutres jusqu'à la fin de la partie et ne peut pas gagner le pot. Le joueur
                  reprend la main en revenant ; sinon il perd sa mise et passe la partie suivante, puis peut revenir au
                  début de n'importe quelle partie.
                </p>
              </div>
            {/* Mises, Capitaux & Variantes */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Mise</span>
                <select
                  value={baseBet}
                  onChange={(e) => setBaseBet(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-amber-300 font-bold focus:outline-none cursor-pointer"
                >
                  <option value={5}>5 pts</option>
                  <option value={10}>10 pts</option>
                  <option value={20}>20 pts</option>
                  <option value={50}>50 pts</option>
                </select>
              </div>

              <div className="p-2 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Capital</span>
                <select
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-amber-300 font-bold focus:outline-none cursor-pointer"
                >
                  <option value={50}>50 pts</option>
                  <option value={100}>100 pts</option>
                  <option value={200}>200 pts</option>
                </select>
              </div>
            </div>

            {/* Règles Spéciales en mini-pills */}
            <div className="grid grid-cols-2 gap-2">
              <div
                onClick={() => setEnableDoubleKora(!enableDoubleKora)}
                className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                  enableDoubleKora
                    ? 'bg-purple-950/40 border-purple-500/50 text-purple-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>Double Kora</span>
                </div>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">×4</span>
              </div>

              <div
                onClick={() => setEnableUnder21(!enableUnder21)}
                className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                  enableUnder21
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <span className="text-emerald-400 font-black text-xs">≤21</span>
                  <span>Moins de 21</span>
                </div>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">Actif</span>
              </div>
            </div>

            {/* Submit Create */}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleCreate}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <span>Création du salon...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Créer le Salon</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Tab 2: Rejoindre */}
        {tab === 'join' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col gap-2">
              <label htmlFor="multiplayer-room-code-input" className="text-xs font-bold text-slate-300">
                Code du Salon (4 caractères)
              </label>
              <input
                id="multiplayer-room-code-input"
                type="text"
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Ex: K9T4"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono font-black text-amber-300 focus:outline-none focus:border-amber-400 uppercase transition"
              />
              <p className="text-[11px] text-slate-400 text-center">
                Demandez le code à 4 lettres au créateur du salon pour le rejoindre.
              </p>
            </div>

            <button
              type="button"
              disabled={isLoading || !roomCode.trim()}
              onClick={handleJoin}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Connexion en cours...</span>
              ) : (
                <>
                  <span>Entrer dans le Salon</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
