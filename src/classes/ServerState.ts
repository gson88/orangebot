import TeamConstants from '../constants/teams';
import Player from './Player';

export default class ServerState {
  live: boolean;
  map: string;
  maps: any[];
  mapindex: number;
  knife: string;
  record: string;
  demoname: string;
  score: any[];
  fullmap: string;
  ot: string;
  knifewinner: boolean;
  paused: boolean;
  freeze: boolean;
  pause_time: number;
  ready_time: number;
  unpause: {};
  ready: {};
  players: {
    [steamId: string]: Player
  };
  pauses: {};
  last_log: Date;

  constructor(values) {
    this.live = false;
    this.map = '';
    this.maps = [];
    this.mapindex = 0;
    this.knife = '';
    this.record = '';
    this.demoname = '';
    this.ot = '';
    this.fullmap = '';
    this.score = [];
    this.knifewinner = false;
    this.paused = false;
    this.freeze = false;
    this.pause_time = -1;
    this.ready_time = -1;
    this.unpause = {
      [TeamConstants.TERRORIST]: false,
      [TeamConstants.CT]: false
    };
    this.ready = {
      [TeamConstants.TERRORIST]: false,
      [TeamConstants.CT]: false
    };
    this.players = {};
    this.pauses = {};
    this.last_log = null;

    for (let key in values) {
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
  getPlayer(steamId) {
    return this.players[steamId] ? this.players[steamId] : undefined;
  }

  addPlayer(steamId, team, name, clantag) {
    this.players[steamId] = new Player(steamId, team, name, clantag);
  }

  deletePlayer(steamId) {
    if (this.players[steamId]) {
      delete this.players[steamId];
    }
  }

  clearPlayers() {
    for (let steamId in this.players) {
      delete this.players[steamId];
    }
    this.players = {};
  }
}
