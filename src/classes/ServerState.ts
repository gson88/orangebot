import TeamConstants from '../constants/teams';
import Player from './Player';

export default class ServerState {
  live = false;
  map = '';
  maps: string[] = [];
  mapindex = 0;
  knife: boolean;
  record: boolean;
  demoname = '';
  score: any[] = [];
  fullmap: boolean;
  ot: boolean;
  knifewinner: string = null;
  paused = false;
  freeze = false;
  pause_time = -1;
  ready_time = -1;
  unpause: {
    [team: string]: boolean;
  } = {
    [TeamConstants.TERRORIST]: false,
    [TeamConstants.CT]: false
  };
  ready: {
    [TeamConstants.TERRORIST]: boolean;
    [TeamConstants.CT]: boolean;
    timer?: NodeJS.Timeout;
  } = {
    [TeamConstants.TERRORIST]: false,
    [TeamConstants.CT]: false
  };
  players: {
    [steamId: string]: Player;
  } = {};
  pauses: { timer: any } = { timer: null };
  lastLog: number = null;

  constructor(values) {
    for (const key in values) {
      if (!this.hasOwnProperty(key) || !values.hasOwnProperty(key)) {
        continue;
      }

      this[key] = values[key];
    }
    return this;
  }

  /**
   * @returns {Player}
   */
  getPlayer = (steamId: string) => {
    return this.players[steamId] ? this.players[steamId] : undefined;
  };

  addPlayer = (
    steamId: string,
    team: string,
    name: string,
    clantag?: string
  ) => {
    this.players[steamId] = new Player(steamId, team, name, clantag);
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
}
