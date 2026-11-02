import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Hourglass, History, Loader2, Lock, ShieldAlert, Spade, UserCog, Wallet } from 'lucide-react';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { GoogleIcon } from './common/GoogleIcon';
import { NativeScreenHeader } from './common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from './common/NativeSegmentedNav';
import { ConnectionDiagnosticModal } from './common/ConnectionDiagnosticModal';
import { ReportProblemCard } from './common/ReportProblemCard';
import { KoraCashDepositPanel } from './KoraCashDepositPanel';
import { KoraCashHistoryPanel } from './KoraCashHistoryPanel';
import { KoraCashPhonesPanel, KoraCashWithdrawPanel } from './KoraCashWithdrawPanels';
import { CashTableRequest, KoraCashTablesPanel } from './KoraCashTablesPanel';
import { useKoraCashDeposits } from '../hooks/useKoraCashDeposits';
import { useBackLayer } from '../hooks/useBackLayer';
import {
  CashPhone,
  CashTablesView,
  WithdrawalSettingsView,
  fetchCashTables,
  fetchKoraCashStatus,
  fetchPhones,
  fetchWithdrawalSettings,
} from '../services/koraCashClient';
import { refreshKoraCashWallet, useKoraCashWallet } from '../services/koraCashWalletStore';
import {
  KoraCashPublicStatus,
  KoraCashTab,
  cashEnvironmentLabel,
  defaultKoraCashTab,
  formatFcfa,
  getDepositUi,
  resolveEntryState,
} from '../services/koraCashFormat';

interface KoraCashScreenProps {
  onClose: () => void;
  onOpenCashTable: (request: CashTableRequest) => Promise<{ success: boolean; error?: string }>;
  onResumeCashTable: (roomCode: string) => void;
}

const SoonCard: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="flex flex-col items-center gap-2 p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
    <Hourglass className="w-8 h-8 text-amber-400/70" />
    <p className="text-sm font-black text-white">{title}</p>
    <p className="text-sm text-slate-400 leading-relaxed">{text}</p>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-2">
    <dt className="text-sm text-slate-400">{label}</dt>
    <dd className="text-sm font-bold text-slate-100 text-right">{value}</dd>
  </div>
);

const TABS: SegmentTab<KoraCashTab>[] = [
  { id: 'tables', label: 'Tables', icon: Spade },
  { id: 'wallet', label: 'Portefeuille', shortLabel: 'Solde', icon: Wallet },
  { id: 'history', label: 'Historique', shortLabel: 'Histo.', icon: History },
  { id: 'account', label: 'Compte', icon: UserCog },
];

/** Page Kora Cash : un mode de jeu à part entière, avec son adresse. Le serveur reste seul juge de ce qui est ouvert. */
export const KoraCashScreen: React.FC<KoraCashScreenProps> = ({ onClose, onOpenCashTable, onResumeCashTable }) => {
  const { isLoggedIn, loginWithGoogle } = usePlayerProfile();
  const [status, setStatus] = useState<KoraCashPublicStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState<boolean>(false);
  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettingsView | null>(null);
  const [phones, setPhones] = useState<CashPhone[]>([]);
  const [cashTables, setCashTables] = useState<CashTablesView | null>(null);
  const [tablesChecked, setTablesChecked] = useState<boolean>(false);
  const [chosenTab, setChosenTab] = useState<KoraCashTab | null>(null);
  const [walletView, setWalletView] = useState<'deposit' | 'withdraw'>('deposit');
  const [showDiagnostic, setShowDiagnostic] = useState<boolean>(false);

  useBackLayer(showDiagnostic, () => setShowDiagnostic(false));

  useEffect(() => {
    let cancelled = false;
    fetchKoraCashStatus().then((next) => {
      if (cancelled) return;
      setStatus(next);
      setStatusLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const entry = resolveEntryState(status, isLoggedIn);
  const isOpen = entry === 'OPEN';
  const environment = status?.environment ?? 'DEMO';
  const canWithdraw = withdrawalSettings?.enabled === true;
  const canPlayTables = cashTables?.enabled === true;
  const ui = getDepositUi(environment, status?.depositMode, canWithdraw);

  const loadPhones = useCallback(async () => {
    try {
      setPhones(await fetchPhones());
    } catch {
      setPhones([]);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchWithdrawalSettings()
      .then((settings) => {
        if (!cancelled) setWithdrawalSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setWithdrawalSettings(null);
      });
    fetchCashTables()
      .then((view) => {
        if (!cancelled) setCashTables(view);
      })
      .catch(() => {
        if (!cancelled) setCashTables(null);
      })
      .finally(() => {
        if (!cancelled) setTablesChecked(true);
      });
    void loadPhones();
    return () => {
      cancelled = true;
    };
  }, [isOpen, loadPhones]);

  // Solde partagé avec l'accueil, mis à jour en direct quand le serveur signale un mouvement.
  const walletState = useKoraCashWallet(isOpen);
  const { wallet, loading: loadingWallet, error: walletError } = walletState;
  const available = wallet?.available ?? 0;

  const deposits = useKoraCashDeposits(ui, isOpen, loadPhones);

  // L'onglet d'arrivée attend de connaître les tables et le solde, pour ne pas sauter d'un onglet à l'autre.
  const arrivalKnown = tablesChecked && (wallet !== null || walletError !== null);
  const activeTab: KoraCashTab | null = chosenTab ?? (arrivalKnown ? defaultKoraCashTab(cashTables, available) : null);

  const goToDeposit = () => {
    setWalletView('deposit');
    setChosenTab('wallet');
  };

  const isLive = environment === 'LIVE';

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      id="kora-cash-screen"
      className="fixed inset-x-0 top-0 bottom-[var(--app-bottom-nav,0px)] z-[70] bg-slate-950 text-slate-100 flex flex-col overflow-hidden comfort-ui"
    >
      <NativeScreenHeader
        id="kora-cash-header"
        backLabel="Retour"
        onBack={onClose}
        backTitle="Retourner à l’accueil"
        title="Kora Cash"
      />

      {statusLoaded && entry !== 'COMING_SOON' && (
        <div
          id="kora-cash-banner"
          className={`shrink-0 px-3 sm:px-6 py-2 border-b ${isLive ? 'bg-rose-500/15 border-rose-500/40' : 'bg-amber-500/15 border-amber-500/40'}`}
        >
          <div className="max-w-2xl mx-auto flex flex-col gap-1">
            <span className={`flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${isLive ? 'text-rose-200' : 'text-amber-200'}`}>
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              {cashEnvironmentLabel(environment)}
            </span>
            {isOpen && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-black text-white">{loadingWallet && !wallet ? '…' : formatFcfa(available)}</span>
                <span className="flex items-center gap-1 text-xs font-bold text-slate-300">
                  <Lock className="w-3 h-3 text-slate-400" />
                  En table : {loadingWallet && !wallet ? '…' : formatFcfa(wallet?.locked ?? 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {isOpen && walletError && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-rose-500/10 border-b border-rose-500/30 text-xs text-rose-200">
          <span>{walletError}</span>
          <button type="button" onClick={() => void refreshKoraCashWallet()} className="font-black underline cursor-pointer shrink-0">
            Réessayer
          </button>
        </div>
      )}

      {isOpen && activeTab && (
        <NativeSegmentedNav<KoraCashTab> tabs={TABS} activeTab={activeTab} onChange={(tab) => setChosenTab(tab)} ariaLabel="Navigation de Kora Cash" />
      )}

      <main className="flex-1 overflow-y-auto custom-dark-scrollbar px-3 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {!statusLoaded && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Chargement…</span>
            </div>
          )}

          {statusLoaded && entry === 'COMING_SOON' && <SoonCard title="Bientôt disponible" text="Kora Cash ouvre bientôt. Reviens nous voir !" />}

          {statusLoaded && entry === 'LOGIN_REQUIRED' && (
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">Kora Cash est réservé aux joueurs connectés avec un compte Google. Connecte-toi pour voir ton solde.</p>
              <button
                type="button"
                onClick={loginWithGoogle}
                className="w-full min-h-11 px-4 rounded-xl bg-gradient-to-r from-white via-slate-100 to-amber-100 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer border border-white/80 active:scale-95"
              >
                <GoogleIcon className="w-4 h-4 shrink-0" />
                <span>Se connecter avec Google</span>
              </button>
            </div>
          )}

          {isOpen && !activeTab && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Chargement…</span>
            </div>
          )}

          {isOpen && activeTab === 'tables' &&
            (canPlayTables && cashTables ? (
              <KoraCashTablesPanel
                view={cashTables}
                available={available}
                onViewChange={setCashTables}
                onGoToDeposit={goToDeposit}
                onOpenTable={async (request) => {
                  const result = await onOpenCashTable(request);
                  if (result.success) onClose();
                  return result;
                }}
                onResumeTable={(roomCode) => {
                  onResumeCashTable(roomCode);
                  onClose();
                }}
              />
            ) : (
              <SoonCard title="Tables bientôt ouvertes" text="Tu pourras bientôt jouer ton solde contre d’autres joueurs. En attendant, prépare ton portefeuille." />
            ))}

          {isOpen && activeTab === 'wallet' && (
            <>
              <div role="tablist" aria-label="Portefeuille" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
                {(
                  [
                    ['deposit', 'Déposer'],
                    ['withdraw', 'Retirer'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={walletView === id}
                    onClick={() => setWalletView(id)}
                    className={`min-h-11 rounded-lg text-sm font-bold cursor-pointer ${walletView === id ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {walletView === 'deposit' && (
                <>
                  <p className={`px-3 py-2 rounded-xl text-xs font-bold border ${isLive ? 'bg-rose-500/10 text-rose-200 border-rose-500/30' : 'bg-amber-500/10 text-amber-200 border-amber-500/30'}`}>{ui.banner}</p>
                  {ui.canDeposit ? <KoraCashDepositPanel ui={ui} phones={phones} deposits={deposits} /> : <SoonCard title="Dépôt bientôt ouvert" text="Le dépôt par Mobile Money n’est pas encore disponible." />}
                </>
              )}

              {walletView === 'withdraw' &&
                (canWithdraw && withdrawalSettings ? (
                  <KoraCashWithdrawPanel settings={withdrawalSettings} phones={phones} available={available} onManagePhones={() => setChosenTab('account')} />
                ) : (
                  <SoonCard title="Retrait bientôt ouvert" text="Tu pourras bientôt envoyer ton solde vers ton numéro Mobile Money." />
                ))}
            </>
          )}

          {isOpen && activeTab === 'history' && <KoraCashHistoryPanel />}

          {isOpen && activeTab === 'account' && (
            <>
              {withdrawalSettings && <KoraCashPhonesPanel phones={phones} maxPhones={withdrawalSettings.maxPhones} onPhonesChange={setPhones} />}

              <section className="px-3.5 py-2 rounded-2xl bg-slate-950/60 border border-slate-800">
                <h3 className="py-1.5 text-sm font-black text-slate-200">Limites et frais</h3>
                <dl className="divide-y divide-slate-800/80">
                  <InfoRow
                    label="Dépôt"
                    value={!ui.canDeposit ? 'Bientôt' : ui.maxAmount !== null ? `${ui.minAmount} à ${formatFcfa(ui.maxAmount)}` : `À partir de ${formatFcfa(ui.minAmount)}`}
                  />
                  <InfoRow label="Retrait" value={canWithdraw && withdrawalSettings ? `${withdrawalSettings.minAmount} à ${formatFcfa(withdrawalSettings.maxAmount)}` : 'Bientôt'} />
                  {canWithdraw && withdrawalSettings && <InfoRow label="Frais de retrait" value={`${withdrawalSettings.feePercent} %`} />}
                  {canPlayTables && cashTables && <InfoRow label="Mises aux tables" value={cashTables.betLevels.map((level) => formatFcfa(level)).join(' · ')} />}
                  {canPlayTables && cashTables && <InfoRow label="Entrée à une table" value={`${cashTables.minBuyInMultiple} à ${cashTables.maxBuyInMultiple} fois la mise`} />}
                  {canPlayTables && cashTables && <InfoRow label="Commission" value={`${cashTables.rakePercent} % de chaque pot gagné`} />}
                </dl>
              </section>

              {canPlayTables && cashTables && (
                <section className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-sm font-black text-slate-200">Confirmation 18 ans</h3>
                    <p className="text-xs text-slate-400">{cashTables.consented ? 'Faite : tu peux t’asseoir à une table.' : 'À faire avant ta première table.'}</p>
                  </div>
                  {cashTables.consented ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <button type="button" onClick={() => setChosenTab('tables')} className="min-h-11 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer">
                      Confirmer
                    </button>
                  )}
                </section>
              )}

              <ReportProblemCard onOpenDiagnostic={() => setShowDiagnostic(true)} />
            </>
          )}
        </div>
      </main>

      <ConnectionDiagnosticModal isOpen={showDiagnostic} onClose={() => setShowDiagnostic(false)} />
    </motion.div>
  );
};
