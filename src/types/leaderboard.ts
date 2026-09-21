import { AvatarOptionId, HonorificTitle } from './playerProfile';

export type LeaderboardCategory = 'WINS' | 'KORAS' | 'CHIPS' | 'WIN_RATE';
export type LeaderboardTimeframe = 'ALL' | 'WEEK' | 'MONTH';

export interface LeaderboardEntry {
  rank: number;
  uid: string;
  displayName: string;
  avatarId: AvatarOptionId;
  photoURL?: string | null;
  title: HonorificTitle;
  isGuest: boolean;
  isCurrentUser: boolean;
  
  // Scoring metrics
  scoreValue: number;
  scoreFormatted: string;
  scoreUnit: string;
  
  // Detailed stats
  gamesWon: number;
  partiesWon: number;
  gamesPlayed: number;
  winRate: number; // percentage (0-100)
  koraCount: number;
  doubleKoraCount: number;
  chips: number;
  biggestPotWon: number;
  masteryScore?: number;
  manchesWon?: number;
  soloManchesWon?: number;
  multiplayerManchesWon?: number;
  soloManchesWonEasy?: number;
  soloManchesWonNormal?: number;
  soloManchesWonHard?: number;
  fortune?: number;
  multiplayerGains?: number;
  multiplayerPertes?: number;
  soloGamesPlayed?: number;
  multiplayerGamesPlayed?: number;
  soloGamesWon?: number;
  multiplayerGamesWon?: number;
  
  // Fair play
  fairPlayStatus: 'IMPECCABLE' | 'WARNING' | 'SANCTIONED';
  
  // Social
  isOnline?: boolean;
  currentRoomCode?: string;
  friendCode: string;
}

export interface CurrentUserRankSummary {
  rank: number;
  totalRankedPlayers: number;
  percentile: number;
  pointsToNextRank: number;
  nextPlayerName?: string;
  isGuest: boolean;
}

export interface PublicPlayerProfileData {
  uid: string;
  displayName: string;
  avatarId: AvatarOptionId;
  photoURL?: string | null;
  title: HonorificTitle;
  friendCode: string;
  isGuest: boolean;
  chips: number;
  gamesPlayed: number;
  gamesWon: number;
  partiesWon: number;
  winRate: number;
  koraCount: number;
  doubleKoraCount: number;
  biggestPotWon: number;
  totalTricksWon: number;
  scoreVersion?: number;
  masteryScore?: number;
  manchesWon?: number;
  soloManchesWon?: number;
  multiplayerManchesWon?: number;
  soloManchesWonEasy?: number;
  soloManchesWonNormal?: number;
  soloManchesWonHard?: number;
  fairPlayStatus: 'IMPECCABLE' | 'WARNING' | 'SANCTIONED';
  joinedAt?: number;
  isOnline?: boolean;
  currentRoomCode?: string;
  fortune?: number;
  multiplayerGains?: number;
  multiplayerPertes?: number;
  soloGamesWon?: number;
  multiplayerGamesWon?: number;
}
