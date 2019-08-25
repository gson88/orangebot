import fs from 'fs';
import RCon from 'simple-rcon';
import regexp from 'named-regexp';
import id64 from '../utils/steam-id-64';
import {
  formatString,
  cleanString,
  cleanChatString
} from '../utils/string-utils';
import Logger from '../utils/logger';
import TeamConstants from '../constants/teams';
import Commands from '../constants/rcon-commands';
import SocketMessages from '../constants/socket-message-regexes';
import ChatCommandConstants from '../constants/chat-commands';
import ServerState from './ServerState';
import { IDefaultConfig, IGameConfigs, IServerConfig } from '../types/types';

//Todo: Prevent memory leaks / remove existing timeouts when removing server
export default class Server {
  static nrInstances = 0;
  ip: string;
  port: number;
  rconpass: string;
  serverId: number;
  admins: string[] = [];
  commandQueue: string[] = [];
  rconConnection: any = null;
  rconPromise: Promise<any> = null;
  state: ServerState;
  defaultSettings: IDefaultConfig;
  configFiles: IGameConfigs;

  constructor(
    serverConfig: IServerConfig,
    defaults: IDefaultConfig,
    gameConfigs: IGameConfigs
  ) {
    Logger.log('Instantiating Server', {
      ...serverConfig,
      rconpass: '*********'
    });

    this.ip = serverConfig.host;
    this.port = serverConfig.port;
    this.rconpass = serverConfig.rconpass;
    this.serverId = Server.nrInstances++;
    this.defaultSettings = defaults;
    this.configFiles = gameConfigs;
    this.state = new ServerState({ ...defaults });
  }

  setAdmins(admins: string[]): Server {
    this.admins = admins;
    return this;
  }

  async getRconConnection() {
    Logger.log('getRconConnection');

    if (this.rconPromise) {
      Logger.log('Waiting for promise');
      return this.rconPromise;
    }

    if (this.rconConnection) {
      return this.rconConnection;
    }

    await this.createRconConnection();
    return this.rconConnection;
  }

  async createRconConnection() {
    Logger.verbose('createRconConnection');
    this.rconConnection = new RCon({
      host: this.ip,
      port: this.port,
      password: this.rconpass,
      connect: true
      // timeout: 20000
    })
      .on('error', err => {
        Logger.error('Rcon error');
        throw err;
      })
      .on('disconnected', a => {
        Logger.log('Rcon disconnected', a);
        this.rconConnection = null;
      });

    this.rconPromise = new Promise(resolve => {
      this.rconConnection.on('connected', () => {
        Logger.log('Rcon connected');
        this.rconPromise = null;
        resolve(this.rconConnection);
      });
    });

    return this.rconPromise;
  }

  getIpAndPort(): string {
    return `${this.ip}:${this.port}`;
  }

  updateLastLog(): void {
    this.state.updateLastLog();
  }

  whitelistSocket(socketIp: string, socketPort: number) {
    this.addToCommandQueue(
      formatString(Commands.WHITELIST_ADDRESS, socketIp, socketIp, socketPort)
    );
    return this;
  }

  async startServer() {
    await this.getGameStatus();

    this.addToCommandQueue(Commands.SAY_WELCOME);
    return this;
  }

  addToCommandQueue(commands: string) {
    if (!commands) {
      return;
    }

    const trimmedCommands = commands.split(';').map(cmd => cmd.trim());
    // .reduce((acc: any, curr: any) => {
    //   if (
    //     acc.length === 0 ||
    //     Buffer.byteLength(acc[acc.length - 1]) + Buffer.byteLength(curr) >
    //       2000
    //   ) {
    //     acc.push(curr);
    //   } else {
    //     acc[acc.length - 1] = acc[acc.length - 1].concat(';', curr);
    //   }
    //   return acc;
    // }, []);

    this.commandQueue = this.commandQueue.concat(trimmedCommands);
  }

  async execRconCommand(command: string) {
    Logger.log('Will send command:');
    const conn = await this.getRconConnection();

    Logger.log('Sending command:', command);
    conn.exec(command, resp => {
      Logger.log('rcon response', resp.body.split('\n'));
    });
  }

  clantag(team: TeamConstants) {
    const tags = {};
    let ret = 'mix1';
    if (
      team === TeamConstants.CT &&
      this.clantag(TeamConstants.TERRORIST) === 'mix1'
    ) {
      ret = 'mix2';
    }

    for (const i in this.state.players) {
      const player = this.state.getPlayer(i);

      if (player.team === team && player.clantag !== undefined) {
        if (tags[player.clantag] === undefined) {
          tags[player.clantag] = 0;
        }
        tags[player.clantag]++;
      }
    }
    const max = 0;
    for (const prop in tags) {
      if (tags.hasOwnProperty(prop) && tags[prop] > max) {
        ret = prop;
      }
    }
    ret = cleanString(ret);
    if (
      team === TeamConstants.CT &&
      this.clantag(TeamConstants.TERRORIST) === ret
    ) {
      ret = ret + '2';
    }
    return ret;
  }

  isAdmin(steamid: string) {
    return this.admins.indexOf(id64(steamid)) >= 0;
  }

  calculateStats(printInChat: boolean): void {
    const team1 = this.clantag(TeamConstants.TERRORIST);
    const team2 = this.clantag(TeamConstants.CT);
    const stat = {
      [team1]: [],
      [team2]: []
    };
    for (const mapIndex in this.state.maps) {
      if (this.state.score[this.state.maps[mapIndex]] !== undefined) {
        if (this.state.score[this.state.maps[mapIndex]][team1] !== undefined) {
          stat[team1][mapIndex] = this.state.score[this.state.maps[mapIndex]][
            team1
          ];
        } else {
          stat[team1][mapIndex] = 'x';
        }
        if (this.state.score[this.state.maps[mapIndex]][team2] !== undefined) {
          stat[team2][mapIndex] = this.state.score[this.state.maps[mapIndex]][
            team2
          ];
        } else {
          stat[team2][mapIndex] = 'x';
        }
      } else {
        stat[team1][mapIndex] = 'x';
        stat[team2][mapIndex] = 'x';
      }
    }
    const maps = [];
    const scores = { team1: 0, team2: 0 };
    for (const mapIndex in this.state.maps) {
      maps.push(
        this.state.maps[mapIndex] +
          ' ' +
          stat[team1][mapIndex] +
          '-' +
          stat[team2][mapIndex]
      );

      if (this.state.maps[mapIndex] !== this.state.map) {
        if (stat[team1][mapIndex] > stat[team2][mapIndex]) {
          scores.team1 += 1;
        } else if (stat[team1][mapIndex] < stat[team2][mapIndex]) {
          scores.team2 += 1;
        }
      }
    }

    const chat = '\x10' + team1 + ' [\x06' + maps.join(', ') + '\x10] ' + team2;
    if (printInChat) {
      this.addToCommandQueue(formatString(Commands.SAY, chat));
    } else {
      const index = this.state.maps.indexOf(this.state.map);
      this.addToCommandQueue(
        formatString(
          Commands.GOTV_OVERLAY,
          index + 1,
          this.state.maps.length,
          scores.team1,
          scores.team2
        )
      );
    }
  }

  restore(round) {
    let roundNum: number | string = parseInt(round);
    if (roundNum < 10) {
      roundNum = '0' + String(roundNum);
    }
    this.addToCommandQueue(
      formatString(Commands.RESTORE_ROUND, `backup_round${roundNum}.txt`, round)
    );

    this.sendFiveSecondCountdownInChat(Commands.SAY_LIVE + ';mp_unpause_match');
  }

  sendFiveSecondCountdownInChat(finalMessage: string = null) {
    setTimeout(() => {
      this.addToCommandQueue('say \x054...');
    }, 1000);
    setTimeout(() => {
      this.addToCommandQueue('say \x063...');
    }, 2000);
    setTimeout(() => {
      this.addToCommandQueue('say \x102...');
    }, 3000);
    setTimeout(() => {
      this.addToCommandQueue('say \x0f1...');
    }, 4000);

    if (finalMessage) {
      setTimeout(() => {
        this.addToCommandQueue(finalMessage);
      }, 5000);
    }
  }

  round() {
    this.state.freeze = false;
    this.state.paused = false;
    this.addToCommandQueue(Commands.ROUND_STARTED);
  }

  pause() {
    if (!this.state.live) {
      return;
    }

    if (this.state.paused) {
      this.addToCommandQueue(Commands.SAY_PAUSED_ALREADY_CALLED);
      return;
    }

    this.addToCommandQueue(Commands.PAUSE_ENABLED);
    this.state.paused = true;
    this.state.unpause = {
      [TeamConstants.TERRORIST]: false,
      [TeamConstants.CT]: false
    };

    if (this.state.freeze) {
      this.matchPause();
    }
  }

  matchPause() {
    this.addToCommandQueue(Commands.SAY_MATCH_PAUSED);

    if (this.state.pause_time === -1) {
      return;
    }

    if (this.state.pause_time) {
      clearTimeout(this.state.pauses.timer);
      this.state.pauses.timer = setTimeout(() => {
        this.addToCommandQueue(Commands.SAY_PAUSE_TIMEOUT);
        this.state.pauses.timer = setTimeout(() => {
          this.ready(null);
        }, 20 * 1000);
      }, (this.state.pause_time - 20) * 1000);
      this.addToCommandQueue(
        formatString(Commands.SAY_PAUSE_TIME, this.state.pause_time)
      );
    }
  }

  async getGameStatus() {
    const conn = await this.getRconConnection();
    conn.exec('status', res => {
      const regex = regexp.named(/map\s+:\s+(:<map>.*?)\s/);
      const match = regex.exec(res.body);
      if (match === null) {
        return;
      }

      this.state.map = match.capture('map');
    });
  }

  start(maps) {
    this.state.score = [];
    if (maps.length > 0) {
      this.state.maps = maps;

      this.state.mapindex = 0;

      if (this.state.map !== maps[0]) {
        this.addToCommandQueue(
          formatString(Commands.CHANGE_MAP, this.state.maps[0])
        );
      } else {
        this.newmap(maps[0], 0);
      }
    } else {
      this.state.maps = [];
      this.newmap(this.state.map, 0);
      setTimeout(() => {
        this.getGameStatus();
      }, 1000);
    }
  }

  ready(team: string | null) {
    if (this.state.live && this.state.paused) {
      if (team === null) {
        this.state.unpause.TERRORIST = true;
        this.state.unpause.CT = true;
      } else {
        this.state.unpause[team] = true;
      }
      if (this.state.unpause.TERRORIST !== this.state.unpause.CT) {
        this.addToCommandQueue(
          formatString(
            Commands.SAY_TEAM_READY,
            this.state.unpause.TERRORIST ? Commands.T : Commands.CT,
            this.state.unpause.TERRORIST ? Commands.CT : Commands.T
          )
        );
      } else if (
        this.state.unpause.TERRORIST === true &&
        this.state.unpause.CT === true
      ) {
        if ('timer' in this.state.pauses) {
          clearTimeout(this.state.pauses.timer);
        }
        this.addToCommandQueue(Commands.MATCH_UNPAUSE);
        this.state.paused = false;
        this.state.unpause = {
          [TeamConstants.TERRORIST]: false,
          [TeamConstants.CT]: false
        };
      }
    } else if (!this.state.live) {
      if (team === null) {
        this.state.ready.TERRORIST = true;
        this.state.ready.CT = true;
      } else {
        this.state.ready[team] = true;
      }
      if (this.state.ready.TERRORIST !== this.state.ready.CT) {
        this.addToCommandQueue(
          formatString(
            Commands.SAY_TEAM_READY,
            this.state.ready.TERRORIST ? Commands.T : Commands.CT,
            this.state.ready.TERRORIST ? Commands.CT : Commands.T
          )
        );
      } else if (
        this.state.ready.TERRORIST === true &&
        this.state.ready.CT === true
      ) {
        this.state.live = true;
        if (this.state.ready.timer) {
          clearTimeout(this.state.ready.timer);
        }
        if (this.state.knife) {
          this.addToCommandQueue(this.getConfig(this.configFiles.knife));
          this.addToCommandQueue(Commands.KNIFE_STARTING);

          setTimeout(() => {
            this.addToCommandQueue(Commands.SAY_KNIFE_STARTED);
          }, 9000);
        } else {
          this.addToCommandQueue(this.getConfig(this.configFiles.match));
          this.startrecord();
          this.addToCommandQueue(Commands.MATCH_STARTING);
          this.lo3();
        }
        this.sendFiveSecondCountdownInChat(Commands.SAY_LIVE);
      }
    }
  }

  newmap(map, delay = 10000) {
    if (this.state.maps.indexOf(map) >= 0) {
      this.state.map = map;
    } else {
      this.state.maps = [map];
      this.state.map = map;
    }
    setTimeout(() => {
      this.calculateStats(false);
      this.warmup();
      this.startReadyTimer();
    }, delay);
  }

  knife() {
    if (this.state.live) {
      return;
    }

    if (!this.state.knife) {
      this.state.knife = true;
      this.addToCommandQueue(Commands.SAY_WARMUP_KNIFE);
      this.startReadyTimer();
    } else {
      this.state.knife = false;
      this.addToCommandQueue(Commands.SAY_KNIFE_DISABLED);
      if ('timer' in this.state.ready) {
        clearTimeout(this.state.ready.timer);
      }
    }
  }

  record() {
    if (this.state.live) {
      return;
    }

    if (this.state.record === true) {
      this.state.record = false;
      this.addToCommandQueue(Commands.SAY_DEMO_RECDISABLED);
    } else {
      this.state.record = true;
      this.addToCommandQueue(Commands.SAY_DEMO_RECENABLED);
    }
  }

  settings() {
    this.addToCommandQueue(Commands.SAY_SETTINGS);
    this.addToCommandQueue(
      formatString(Commands.SAY_SETTINGS_KNIFE, this.state.knife)
    );
    this.addToCommandQueue(
      formatString(Commands.SAY_SETTINGS_RECORDING, this.state.record)
    );
    this.addToCommandQueue(
      formatString(Commands.SAY_SETTINGS_OT, this.state.ot)
    );
    this.addToCommandQueue(
      formatString(Commands.SAY_SETTINGS_FULLMAP, this.state.fullmap)
    );

    const outputMaps = this.state.maps.join(', ');
    this.addToCommandQueue(
      formatString(Commands.SAY_SETTINGS_MAPS, outputMaps)
    );
  }

  mapend() {
    this.addToCommandQueue(Commands.SAY_MAP_FINISHED);
    this.state.mapindex++;
    if (this.state.record === true) {
      this.addToCommandQueue('tv_stoprecord');
      this.addToCommandQueue(
        formatString(Commands.SAY_DEMO_FINISHED, this.state.demoname)
      );
    }

    if (
      this.state.maps.length >= 0 &&
      this.state.maps.length === this.state.mapindex
    ) {
      this.addToCommandQueue(Commands.SAY_SERIES_FINISHED);
      this.state.mapindex = 0;
    } else if (
      this.state.maps.length >= 0 &&
      this.state.maps.length > this.state.mapindex
    ) {
      this.addToCommandQueue(
        formatString(
          Commands.SAY_MAP_CHANGE,
          this.state.maps[this.state.mapindex]
        )
      );
      setTimeout(() => {
        this.addToCommandQueue(
          'changelevel ' + this.state.maps[this.state.mapindex]
        );
      }, 20000);
    }
  }

  overtime() {
    if (this.state.ot === true) {
      this.state.ot = false;
      this.addToCommandQueue(Commands.SAY_OT_DISABLED);
      this.addToCommandQueue('mp_overtime_enable 0');
    } else {
      this.state.ot = true;
      this.addToCommandQueue(Commands.SAY_OT_ENABLED);
      this.addToCommandQueue(this.getConfig(this.configFiles.overtime));
    }
  }

  fullmap() {
    if (this.state.fullmap === true) {
      this.state.fullmap = false;
      this.addToCommandQueue(Commands.SAY_FM_DISABLED);
      this.addToCommandQueue('mp_match_can_clinch 1');
    } else {
      this.state.fullmap = true;
      this.addToCommandQueue(Commands.SAY_FM_ENABLED);
      this.addToCommandQueue(this.getConfig(this.configFiles.fullmap));
    }
  }

  startrecord() {
    if (this.state.record === true) {
      const dateString = new Date()
        .toISOString()
        .replace(/T/, '_')
        .replace(/:/g, '-')
        .replace(/\..+/, '');
      const demoname = `${dateString}_${this.state.map}_${cleanString(
        this.clantag(TeamConstants.TERRORIST)
      )}-${cleanString(this.clantag(TeamConstants.CT))}.dem`;

      this.state.demoname = demoname;
      this.addToCommandQueue('tv_stoprecord; tv_record ' + demoname);
      this.addToCommandQueue(formatString(Commands.SAY_DEMO_REC, demoname));
    }
  }

  getConfig(file) {
    const configUnformatted = fs.readFileSync(file, 'utf8');
    return configUnformatted.replace(/(\r\n\t|\n|\r\t)/gm, '; ');
  }

  lo3() {
    this.addToCommandQueue(
      'say \x02The Match will be live on the third restart.'
    );
    this.addToCommandQueue('mp_restartgame 1');
    setTimeout(() => {
      this.addToCommandQueue('mp_restartgame 1');
    }, 1000);
    setTimeout(() => {
      this.addToCommandQueue('mp_restartgame 3');
    }, 2000);
    setTimeout(() => {
      this.addToCommandQueue('say \x04Match is live!');
    }, 6000);
  }

  startReadyTimer() {
    if (!this.state.ready_time) {
      return;
    }

    if ('timer' in this.state.ready) {
      clearTimeout(this.state.ready.timer);
    }

    this.addToCommandQueue(
      formatString(Commands.SAY_WARMUP_TIME, this.state.ready_time)
    );
    this.state.ready.timer = setTimeout(() => {
      this.addToCommandQueue(Commands.SAY_WARMUP_TIMEOUT);
      this.state.ready.timer = setTimeout(() => {
        this.ready(null);
      }, 20 * 1000);
    }, (this.state.ready_time - 20) * 1000);
  }

  score(score) {
    this.state.score[this.state.map] = {
      [this.clantag(TeamConstants.CT)]: score.CT,
      [this.clantag(TeamConstants.TERRORIST)]: score.TERRORIST
    };
    this.calculateStats(false);
    if (score.TERRORIST + score.CT === 1 && this.state.knife) {
      this.state.knifewinner =
        score.TERRORIST === 1 ? TeamConstants.TERRORIST : TeamConstants.CT;
      this.state.knife = false;
      this.addToCommandQueue(this.getConfig(this.configFiles.match));
      this.addToCommandQueue(
        formatString(
          Commands.KNIFE_WON,
          this.state.knifewinner === TeamConstants.TERRORIST
            ? Commands.T
            : Commands.CT
        )
      );
    } else if (this.state.paused) {
      this.matchPause();
    }
    this.state.freeze = true;
  }

  stay(team) {
    if (team === this.state.knifewinner) {
      this.addToCommandQueue(Commands.KNIFE_STAY);
      this.state.knifewinner = null;
      this.lo3();
      this.startrecord();
    }
  }

  swap(team) {
    if (team === this.state.knifewinner) {
      this.addToCommandQueue(Commands.KNIFE_SWAP);
      this.state.knifewinner = null;
      this.lo3();
      this.startrecord();
    }
  }

  quit() {
    this.addToCommandQueue('say \x10Goodbye from OrangeBot');
    this.addToCommandQueue('logaddress_delall; log off');

    //Todo: Make sure there is no memory leaks
    //Todo: Advertise to serverHandler that this server has shut down
  }

  debug() {
    this.addToCommandQueue(
      `say \x10live: ${this.state.live}` +
        ` paused: ${this.state.paused}` +
        ` freeze: ${this.state.freeze}` +
        ` knife: ${this.state.knife}` +
        ` knifewinner: ${this.state.knifewinner}` +
        ` ready: T: ${this.state.ready.TERRORIST}` +
        ` ready: CT: ${this.state.ready.CT}` +
        ` unpause: T: ${this.state.unpause.TERRORIST}` +
        `unpause: CT: ${this.state.unpause.CT}`
    );
    this.calculateStats(true);
  }

  say(msg) {
    this.addToCommandQueue(formatString(Commands.SAY, cleanChatString(msg)));
  }

  warmup() {
    this.state.ready = {
      [TeamConstants.TERRORIST]: false,
      [TeamConstants.CT]: false
    };
    this.state.unpause = {
      [TeamConstants.TERRORIST]: false,
      [TeamConstants.CT]: false
    };
    this.state.live = false;
    this.state.paused = false;
    this.state.freeze = false;
    this.state.knifewinner = null;
    this.state.knife = this.defaultSettings.knife;
    this.state.record = this.defaultSettings.record;
    this.state.ot = this.defaultSettings.ot;
    this.state.fullmap = this.defaultSettings.fullmap;

    this.addToCommandQueue(this.getConfig(this.configFiles.warmup));

    if (this.state.ot) {
      this.addToCommandQueue(this.getConfig(this.configFiles.overtime));
    }

    if (this.state.fullmap) {
      this.addToCommandQueue(this.getConfig(this.configFiles.fullmap));
    }

    this.addToCommandQueue(Commands.SAY_WARMUP);
  }

  handleSocketMessage(text: string) {
    const found = this.handle(text, [
      [SocketMessages.TEAM_JOIN, this.handleTeamJoin],
      [SocketMessages.CLANTAG, this.handleClantag],
      [SocketMessages.PLAYER_DISCONNECT, this.handlePlayerDisconnect],
      [SocketMessages.LOADING_MAP, this.handleMapLoading],
      [SocketMessages.LOADED_MAP, this.handleMapLoaded],
      [SocketMessages.ROUND_START, this.handleRoundStart],
      [SocketMessages.ROUND_END, this.handleRoundEnd],
      [SocketMessages.GAME_OVER, this.handleGameOver],
      [SocketMessages.ADMIN_COMMAND, this.handleAdminCommand]
    ]);

    if (found) {
      this.updateLastLog();
    }
  }

  handle = (text: string, toTest: any[]) => {
    return toTest.find(([regexTest, cb]) => {
      const regex = regexp.named(regexTest);
      const match = regex.exec(text);
      if (!match) {
        return false;
      }
      cb(match);
      return true;
    });
  };

  handleTeamJoin = (match: any) => {
    const steamId = match.capture('steam_id');

    const player = this.state.getPlayer(steamId);
    if (!player) {
      if (match.capture('steam_id') !== 'BOT') {
        this.state.addPlayer(
          steamId,
          match.capture('new_team'),
          match.capture('user_name')
        );
      }
    } else {
      player.team = match.capture('new_team');
      player.name = match.capture('user_name');
    }
  };

  handleClantag = (match: any) => {
    const steamId = match.capture('steam_id');
    const player = this.state.getPlayer(steamId);

    if (!player) {
      if (match.capture('steam_id') !== 'BOT') {
        this.state.addPlayer(
          steamId,
          match.capture('user_team'),
          match.capture('user_name'),
          match.capture('clan_tag')
        );
      }
    } else {
      player.clantag =
        match.capture('clan_tag') !== ''
          ? match.capture('clan_tag')
          : undefined;
    }
  };

  handlePlayerDisconnect = (match: any) => {
    const steamId = match.capture('steam_id');
    this.state.deletePlayer(steamId);
  };

  handleMapLoading = () => {
    this.state.clearPlayers();
  };

  handleMapLoaded = (match: any) => {
    this.newmap(match.capture('map'));
  };

  handleRoundStart = () => {
    this.round();
  };

  handleRoundEnd = (match: any) => {
    const score = {
      [TeamConstants.TERRORIST]: parseInt(match.capture('t_score')),
      [TeamConstants.CT]: parseInt(match.capture('ct_score'))
    };
    this.score(score);
  };

  handleGameOver = () => {
    this.mapend();
  };

  handleAdminCommand = (match: any) => {
    // !-command
    const userId = match.capture('user_id');
    const steamId = match.capture('steam_id');
    const userTeam = match.capture('user_team');
    const params = match.capture('text').split(' ');

    const isAdmin = userId === '0' || this.isAdmin(steamId);
    const cmd = params[0];
    params.shift();

    switch (cmd.toLowerCase()) {
      case ChatCommandConstants.CMD:
        this.addToCommandQueue(params.join(' '));
        break;

      case ChatCommandConstants.RESTORE:
      case ChatCommandConstants.REPLAY:
        if (isAdmin) {
          this.restore(params);
        }
        break;

      case ChatCommandConstants.STATUS:
      case ChatCommandConstants.STATS:
      case ChatCommandConstants.SCORE:
      case ChatCommandConstants.SCORES:
        this.calculateStats(true);
        break;

      case ChatCommandConstants.RESTART:
      case ChatCommandConstants.RESET:
      case ChatCommandConstants.WARMUP:
        if (isAdmin) {
          this.warmup();
        }
        break;

      case ChatCommandConstants.MAPS:
      case ChatCommandConstants.MAP:
      case ChatCommandConstants.START:
      case ChatCommandConstants.MATCH:
      case ChatCommandConstants.STARTMATCH:
        if (isAdmin || !this.state.live) {
          this.start(params);
        }
        break;

      case ChatCommandConstants.FORCE:
        if (isAdmin) {
          this.ready(null);
        }
        break;

      case ChatCommandConstants.RESUME:
      case ChatCommandConstants.READY:
      case ChatCommandConstants.RDY:
      case ChatCommandConstants.GABEN:
      case ChatCommandConstants.R:
      case ChatCommandConstants.UNPAUSE:
        this.ready(userTeam);
        break;

      case ChatCommandConstants.PAUSE:
        this.pause();
        break;

      case ChatCommandConstants.STAY:
        this.stay(userTeam);
        break;

      case ChatCommandConstants.SWAP:
      case ChatCommandConstants.SWITCH:
        this.swap(userTeam);
        break;

      case ChatCommandConstants.KNIFE:
        if (isAdmin) {
          this.knife();
        }
        break;

      case ChatCommandConstants.RECORD:
        if (isAdmin) {
          this.record();
        }
        break;
      case ChatCommandConstants.OT:
      case ChatCommandConstants.OVERTIME:
        if (isAdmin) {
          this.overtime();
        }
        break;

      case ChatCommandConstants.FULLMAP:
        if (isAdmin) {
          this.fullmap();
        }
        break;

      case ChatCommandConstants.SETTINGS:
        this.settings();
        break;
      case ChatCommandConstants.DISCONNECT:
      case ChatCommandConstants.QUIT:
      case ChatCommandConstants.LEAVE:
        if (isAdmin) {
          this.quit();
          Logger.log(this.getIpAndPort() + ' - Disconnected by admin.');
        }
        break;

      case ChatCommandConstants.SAY:
        if (isAdmin) {
          this.say(params.join(' '));
        }
        break;

      case ChatCommandConstants.DEBUG:
        this.debug();
        break;

      default:
        break;
    }
  };
}
