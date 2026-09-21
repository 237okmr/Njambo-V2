import React from 'react';
import { PlayerProfileScreen, PlayerProfileScreenProps } from './PlayerProfileScreen';

export type PlayerProfileModalProps = PlayerProfileScreenProps;

export const PlayerProfileModal: React.FC<PlayerProfileScreenProps> = (props) => {
  return <PlayerProfileScreen {...props} />;
};

export default PlayerProfileModal;
