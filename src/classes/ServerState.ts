import TeamConstants from '../constants/teams';
import Player from './Player';
import { IDefaultConfig } from '../types/types';
import Logger from '../utils/logger';

interface TeamBoolean {
  [TeamConstants.TERRORIST]: boolean;
  [TeamConstants.CT]: boolean;
}

export default class ServerState {
  map = '';
  maps: string[] = [];
  mapindex = 0;
  demoname = '';
  live = false;
  knife: boolean;
  record: boolean;
  paused = false;
  freeze = false;
  fullmap: boolean;
  ot: boolean;
  pause_time = -1;
  ready_time = -1;
  lastLog: number;
  knifewinner: TeamConstants = null;
  score: {
    [map: string]: {
      [clanTag: string]: number;
    };
  };
  unpause: TeamBoolean = {
    [TeamConstants.TERRORIST]: false,
    [TeamConstants.CT]: false
  };
  ready: TeamBoolean = {
    [TeamConstants.TERRORIST]: false,
    [TeamConstants.CT]: false
  };
  players: {
    [steamId: string]: Player;
  } = {};

  constructor(values: IDefaultConfig) {
    this.setValues(values);
    return this;
  }

  setValues(values: IDefaultConfig) {
    Object.entries(values).forEach(([key, value]) => {
      if (!this.hasOwnProperty(key) || !values.hasOwnProperty(key)) {
        Logger.warning(
          'Tried to set non-existing property in ServerState:',
          key
        );
        return true;
      }

      this[key] = value;
    });
    return this;
  }

  addPlayer = (
    steamId: string,
    team: string,
    name: string,
    clantag?: string
  ) => {
    this.players[steamId] = new Player(steamId, team, name, clantag);
  };

  getPlayer = (steamId: string): Player | undefined => {
    return this.players[steamId];
  };

  deletePlayer = (steamId: string) => {
    if (this.players[steamId]) {
      delete this.players[steamId];
    }
  };

  clearPlayers = () => {
    this.players = {};
  };

  updateLastLog = () => {
    this.lastLog = Date.now();
  };

  isFinalMap = () => {
    return this.maps.length === this.mapindex;
  };
}
