import fs from 'fs';
import regexp from 'named-regexp';
import id64 from '../utils/steam-id-64';
import { formatString, cleanString } from '../utils/string-utils';
import Logger from '../utils/logger';
import TeamConstants from '../constants/teams';
import Commands from '../constants/rcon-commands';
import SocketMessages from '../constants/socket-message-regexes';
import ChatCommandConstants from '../constants/chat-commands';
import ServerState from './ServerState';
import RCon from './RCon';
import {
  IDefaultConfig,
  IGameConfigs,
  IServerConfig,
  NamedRegexMatches
} from '../types/types';

//Todo: Prevent memory leaks / remove existing timeouts when removing server
export default class Server {
  static nrInstances = 0;
  private admins: string[] = [];
  private state: ServerState;
  private defaultSettings: IDefaultConfig;
  private configFiles: IGameConfigs;
  private readonly host: string;
  private readonly port: number;
  private readonly rcon: RCon;
  private readyTimer: NodeJS.Timeout = null;
  private pauseTimer: NodeJS.Timeout = null;
  readonly serverId: number;
  commandQueue: string[] = [];

  constructor(
    serverConfig: IServerConfig,
    defaults: IDefaultConfig,
    gameConfigs: IGameConfigs
  ) {
    Logger.log('Instantiating Server', {
      ...serverConfig,
      rconpass: '*********'
    });

    this.host = serverConfig.host;
    this.port = serverConfig.port;
    this.serverId = Server.nrInstances++;
    this.defaultSettings = defaults;
    this.configFiles = gameConfigs;
    this.state = new ServerState({ ...defaults });
    this.rcon = new RCon(this.host, this.port, serverConfig.rconpass);
  }

  setAdmins(admins: string[]): Server {
    this.admins = admins;
    return this;
  }

  getIpAndPort(): string {
    return `${this.host}:${this.port}`;
  }

  getRcon = (): RCon => {
    return this.rcon;
  };

  whitelistSocket(socketIp: string, socketPort: number): Server {
    this.addToCommandQueue(Commands.WHITELIST_ADDRESS, socketIp, socketPort);
    return this;
  }

  isAdmin(steamId: string) {
    return this.admins.indexOf(id64(steamId)) >= 0;
  }

  async startServer() {
    await this.getCurrentMap();
    this.addToCommandQueue(Commands.SAY_WELCOME);
    return this;
  }

  addToCommandQueue(commands: string, ...stringReplacements: any[]): void {
    const trimmedCommands = formatString(commands, ...stringReplacements)
      .split(';')
      .map(cmd => cmd.trim());
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

  async getCurrentMap() {
    const res = await this.rcon.execRconCommand('status');
    const regex = regexp.named(/map\s+:\s+(:<map>.*?)\s/);
    const match = regex.exec(res.body);
    if (match === null) {
      return;
    }

    this.state.map = match.capture('map');
  }

  getConfig(file) {
    const configUnformatted = fs.readFileSync(file, 'utf8');
    return configUnformatted.replace(/(\r\n\t|\n|\r\t)/gm, '; ');
  }

  onSocketMessage(text: string) {
    const found = this.handleSocketMessage(text, [
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
      this.state.updateLastLog();
    }
  }

  handleSocketMessage = (
    text: string,
    toTest: [RegExp, (match: NamedRegexMatches) => void][]
  ) => {
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

  handleTeamJoin = (match: NamedRegexMatches) => {
    const steamId = match.capture('steam_id');
    const newTeam = match.capture('new_team');
    const name = match.capture('user_name');

    const player = this.state.getPlayer(steamId);
    if (player) {
      player.team = newTeam;
      player.name = name;
    } else if (steamId !== 'BOT') {
      this.state.addPlayer(steamId, newTeam, name);
    }
  };

  handleClantag = (match: NamedRegexMatches) => {
    const steamId = match.capture('steam_id');
    const userTeam = match.capture('user_team');
    const userName = match.capture('user_name');
    const clanTag = match.capture('clan_tag');
    const player = this.state.getPlayer(steamId);

    if (steamId === 'BOT') {
      return;
    }

    if (!player) {
      this.state.addPlayer(steamId, userTeam, userName, clanTag);
    } else {
      player.clantag = clanTag || undefined;
    }
  };

  handlePlayerDisconnect = (match: NamedRegexMatches) => {
    this.state.deletePlayer(match.capture('steam_id'));
  };

  handleMapLoading = () => {
    this.state.clearPlayers();
  };

  handleMapLoaded = (match: NamedRegexMatches) => {
    this.newmap(match.capture('map'));
  };

  handleRoundStart = () => {
    this.state.freeze = false;
    this.state.paused = false;
    this.addToCommandQueue(Commands.ROUND_STARTED);
  };

  handleRoundEnd = (match: NamedRegexMatches) => {
    const tScore = parseInt(match.capture('t_score'));
    const ctScore = parseInt(match.capture('ct_score'));
    this.score(tScore, ctScore);
  };

  handleGameOver = () => {
    this.mapend();
  };

  handleAdminCommand = (match: NamedRegexMatches) => {
    // !-command
    const userId = match.capture('user_id');
    const steamId = match.capture('steam_id');
    const userTeam = match.capture('user_team');
    const params = match.capture('text').split(' ');

    const isAdmin = this.isAdmin(steamId) || userId === '0';
    const cmd = params[0];
    params.shift();

    switch (cmd.toLowerCase()) {
      case ChatCommandConstants.CMD:
        if (isAdmin) {
          this.addToCommandQueue(params.join(' '));
        }
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
        // this.calculateStats(true);
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
        this.ready(userTeam as TeamConstants);
        break;

      case ChatCommandConstants.PAUSE:
        this.pause();
        break;

      case ChatCommandConstants.STAY:
        this.stay(userTeam as TeamConstants);
        break;

      case ChatCommandConstants.SWAP:
      case ChatCommandConstants.SWITCH:
        this.swap(userTeam as TeamConstants);
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
          this.toggleOvertimeEnabled();
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

  // calculateStats(printInChat: boolean): void {
  //   const team1 = this.clantag(TeamConstants.TERRORIST);
  //   const team2 = this.clantag(TeamConstants.CT);
  //   const stat = {
  //     [team1]: [],
  //     [team2]: []
  //   };
  //   for (const mapIndex in this.state.maps) {
  //     const map = this.state.maps[mapIndex];
  //     if (this.state.score[map] !== undefined) {
  //       if (this.state.score[map][team1] !== undefined) {
  //         stat[team1][mapIndex] = this.state.score[map][team1];
  //       } else {
  //         stat[team1][mapIndex] = 'x';
  //       }
  //       if (this.state.score[map][team2] !== undefined) {
  //         stat[team2][mapIndex] = this.state.score[map][team2];
  //       } else {
  //         stat[team2][mapIndex] = 'x';
  //       }
  //     } else {
  //       stat[team1][mapIndex] = 'x';
  //       stat[team2][mapIndex] = 'x';
  //     }
  //   }
  //   const maps = [];
  //   const scores = { team1: 0, team2: 0 };
  //   for (const mapIndex in this.state.maps) {
  //     const map = this.state.maps[mapIndex];
  //     maps.push(
  //       map + ' ' + stat[team1][mapIndex] + '-' + stat[team2][mapIndex]
  //     );
  //
  //     if (map !== this.state.map) {
  //       if (stat[team1][mapIndex] > stat[team2][mapIndex]) {
  //         scores.team1 += 1;
  //       } else if (stat[team1][mapIndex] < stat[team2][mapIndex]) {
  //         scores.team2 += 1;
  //       }
  //     }
  //   }
  //
  //   const chat = '\x10' + team1 + ' [\x06' + maps.join(', ') + '\x10] ' + team2;
  //   if (printInChat) {
  //     this.addToCommandQueue(formatString(Commands.SAY, chat));
  //   } else {
  //     const index = this.state.maps.indexOf(this.state.map);
  //     this.addToCommandQueue(
  //       formatString(
  //         Commands.GOTV_OVERLAY,
  //         index + 1,
  //         this.state.maps.length,
  //         scores.team1,
  //         scores.team2
  //       )
  //     );
  //   }
  // }

  sendFiveSecondCountdownInChat(
    finalCommand: string = null,
    ...finalCommandReplacements: (string | number)[]
  ) {
    setTimeout(() => {
      this.say('\x054...');
    }, 1000);
    setTimeout(() => {
      this.say('\x063...');
    }, 2000);
    setTimeout(() => {
      this.say('\x102...');
    }, 3000);
    setTimeout(() => {
      this.say('\x0f1...');
    }, 4000);

    if (finalCommand) {
      setTimeout(() => {
        this.addToCommandQueue(finalCommand, ...finalCommandReplacements);
      }, 5000);
    }
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
      const player = this.state.players[i];

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

  restore(round) {
    let roundNum: number | string = parseInt(round);
    if (roundNum < 10) {
      roundNum = '0' + String(roundNum);
    }
    this.addToCommandQueue(
      Commands.RESTORE_ROUND,
      `backup_round${roundNum}.txt`,
      round
    );

    this.sendFiveSecondCountdownInChat(Commands.SAY_LIVE + ';mp_unpause_match');
  }

  pause() {
    if (!this.state.live) {
      Logger.log('Cant pause game when game is not live');
      return;
    }

    if (this.state.paused) {
      this.addToCommandQueue(Commands.SAY_PAUSED_ALREADY_CALLED);
      return;
    }

    this.addToCommandQueue(Commands.PAUSE_ENABLED);
    this.state.paused = true;
    this.state.unpause[TeamConstants.TERRORIST] = false;
    this.state.unpause[TeamConstants.CT] = false;

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
      clearTimeout(this.pauseTimer);

      this.pauseTimer = setTimeout(() => {
        this.addToCommandQueue(Commands.SAY_PAUSE_TIMEOUT);

        this.pauseTimer = setTimeout(() => {
          this.ready(null);
        }, 20 * 1000);
      }, (this.state.pause_time - 20) * 1000);
      this.addToCommandQueue(Commands.SAY_PAUSE_TIME, this.state.pause_time);
    }
  }

  start(maps: string[]) {
    this.state.score = {};
    if (maps.length > 0) {
      this.state.maps = maps;

      this.state.mapindex = 0;

      if (this.state.map !== maps[0]) {
        this.addToCommandQueue(Commands.CHANGE_MAP, this.state.maps[0]);
      } else {
        this.newmap(maps[0], 0);
      }
    } else {
      this.state.maps = [];
      this.newmap(this.state.map, 0);
      setTimeout(() => {
        this.getCurrentMap();
      }, 1000);
    }
  }

  ready(team: TeamConstants | null) {
    const terroristsUnpause = this.state.unpause[TeamConstants.TERRORIST];
    const ctUnpause = this.state.unpause[TeamConstants.CT];
    const terroristsReady = this.state.ready[TeamConstants.TERRORIST];
    const ctReady = this.state.ready[TeamConstants.CT];
    if (this.state.live && this.state.paused) {
      if (team === null) {
        this.state.unpause[TeamConstants.TERRORIST] = true;
        this.state.unpause[TeamConstants.CT] = true;
      } else {
        this.state.unpause[team] = true;
      }
      if (terroristsUnpause !== ctUnpause) {
        this.addToCommandQueue(
          Commands.SAY_TEAM_READY,
          terroristsUnpause ? Commands.T : Commands.CT,
          terroristsUnpause ? Commands.CT : Commands.T
        );
      } else if (terroristsUnpause && ctUnpause) {
        if (this.pauseTimer) {
          clearTimeout(this.pauseTimer);
        }
        this.addToCommandQueue(Commands.MATCH_UNPAUSE);
        this.state.paused = false;
        this.state.unpause[TeamConstants.TERRORIST] = false;
        this.state.unpause[TeamConstants.CT] = false;
      }
    } else if (!this.state.live) {
      if (team === null) {
        this.state.ready[TeamConstants.TERRORIST] = true;
        this.state.ready[TeamConstants.CT] = true;
      } else {
        this.state.ready[team] = true;
      }
      if (terroristsReady !== ctReady) {
        this.addToCommandQueue(
          Commands.SAY_TEAM_READY,
          terroristsReady ? Commands.T : Commands.CT,
          terroristsReady ? Commands.CT : Commands.T
        );
      } else if (terroristsReady && ctReady) {
        this.state.live = true;
        if (this.readyTimer) {
          clearTimeout(this.readyTimer);
        }
        if (this.state.knife) {
          this.addToCommandQueue(this.getConfig(this.configFiles.knife));
          this.addToCommandQueue(Commands.KNIFE_STARTING);

          setTimeout(() => {
            this.addToCommandQueue(Commands.SAY_KNIFE_STARTED);
          }, 9000);
        } else {
          this.addToCommandQueue(this.getConfig(this.configFiles.match));
          this.startRecord();
          this.addToCommandQueue(Commands.MATCH_STARTING);
          this.restart3Times();
        }
        this.sendFiveSecondCountdownInChat(Commands.SAY_LIVE);
      }
    }
  }

  newmap(map, delay = 10000) {
    if (this.state.maps.includes(map)) {
      this.state.map = map;
    } else {
      this.state.maps = [map];
      this.state.map = map;
    }
    setTimeout(() => {
      // this.calculateStats(false);
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
      if (this.readyTimer) {
        clearTimeout(this.readyTimer);
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
    this.addToCommandQueue(Commands.SAY_SETTINGS_KNIFE, this.state.knife);
    this.addToCommandQueue(Commands.SAY_SETTINGS_RECORDING, this.state.record);
    this.addToCommandQueue(Commands.SAY_SETTINGS_OT, this.state.ot);
    this.addToCommandQueue(Commands.SAY_SETTINGS_FULLMAP, this.state.fullmap);

    const outputMaps = this.state.maps.join(', ');
    this.addToCommandQueue(Commands.SAY_SETTINGS_MAPS, outputMaps);
  }

  mapend() {
    this.addToCommandQueue(Commands.SAY_MAP_FINISHED);
    this.state.mapindex++;
    if (this.state.record === true) {
      this.addToCommandQueue('tv_stoprecord');
      this.addToCommandQueue(Commands.SAY_DEMO_FINISHED, this.state.demoname);
    }

    if (this.state.isFinalMap()) {
      this.addToCommandQueue(Commands.SAY_SERIES_FINISHED);
      this.state.mapindex = 0;
    } else if (this.state.maps.length > 0) {
      this.addToCommandQueue(
        Commands.SAY_MAP_CHANGE,
        this.state.maps[this.state.mapindex]
      );
      setTimeout(() => {
        this.addToCommandQueue(
          Commands.CHANGE_MAP,
          this.state.maps[this.state.mapindex]
        );
      }, 20000);
    }
  }

  toggleOvertimeEnabled() {
    if (this.state.ot) {
      this.state.ot = false;
      this.addToCommandQueue(Commands.DISALBE_OT);
    } else {
      this.state.ot = true;
      this.addToCommandQueue(Commands.ENABLE_OT);
      this.addToCommandQueue(this.getConfig(this.configFiles.overtime));
    }
  }

  fullmap() {
    if (this.state.fullmap) {
      this.addToCommandQueue(Commands.SAY_FM_DISABLED);
      this.addToCommandQueue('mp_match_can_clinch 1');
    } else {
      this.addToCommandQueue(Commands.SAY_FM_ENABLED);
      this.addToCommandQueue(this.getConfig(this.configFiles.fullmap));
    }
    this.state.fullmap = !this.state.fullmap;
  }

  startRecord() {
    if (!this.state.record) {
      return;
    }

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
    this.addToCommandQueue(Commands.SAY_DEMO_REC, demoname);
  }

  restart3Times() {
    this.say('\x02The Match will be live on the third restart.');
    this.addToCommandQueue(Commands.RESTART_MAP, 1);
    setTimeout(() => {
      this.addToCommandQueue(Commands.RESTART_MAP, 1);
    }, 1000);
    setTimeout(() => {
      this.addToCommandQueue(Commands.RESTART_MAP, 3);
    }, 2000);
    setTimeout(() => {
      this.say('\x04Match is live!');
    }, 6000);
  }

  startReadyTimer() {
    if (!this.state.ready_time) {
      return;
    }

    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
    }

    this.addToCommandQueue(Commands.SAY_WARMUP_TIME, this.state.ready_time);
    this.readyTimer = setTimeout(() => {
      this.addToCommandQueue(Commands.SAY_WARMUP_TIMEOUT);

      this.readyTimer = setTimeout(() => {
        this.ready(null);
      }, 20 * 1000);
    }, (this.state.ready_time - 20) * 1000);
  }

  score(tScore: number, ctScore: number) {
    this.state.score[this.state.map] = {
      [this.clantag(TeamConstants.TERRORIST)]: tScore,
      [this.clantag(TeamConstants.CT)]: ctScore
    };
    // this.calculateStats(false);
    if (tScore + ctScore === 1 && this.state.knife) {
      this.state.knifewinner =
        tScore === 1 ? TeamConstants.TERRORIST : TeamConstants.CT;
      this.state.knife = false;
      this.addToCommandQueue(this.getConfig(this.configFiles.match));
      this.addToCommandQueue(
        Commands.KNIFE_WON,
        this.state.knifewinner === TeamConstants.TERRORIST
          ? Commands.T
          : Commands.CT
      );
    } else if (this.state.paused) {
      this.matchPause();
    }
    this.state.freeze = true;
  }

  stay(team: TeamConstants) {
    if (team === this.state.knifewinner) {
      this.addToCommandQueue(Commands.KNIFE_STAY);
      this.state.knifewinner = null;
      this.restart3Times();
      this.startRecord();
    }
  }

  swap(team) {
    if (team === this.state.knifewinner) {
      this.addToCommandQueue(Commands.KNIFE_SWAP);
      this.state.knifewinner = null;
      this.restart3Times();
      this.startRecord();
    }
  }

  quit() {
    this.say('\x10Goodbye from OrangeBot');
    this.addToCommandQueue(Commands.REMOVE_WHITELIST_ADDRESS);

    //Todo: Make sure there are no memory leaks
    //Todo: Advertise to serverHandler that this server has shut down
  }

  debug() {
    this.say(
      `\x10live: ${this.state.live}` +
        ` paused: ${this.state.paused}` +
        ` freeze: ${this.state.freeze}` +
        ` knife: ${this.state.knife}` +
        ` knifewinner: ${this.state.knifewinner}` +
        ` ready T: ${this.state.ready.TERRORIST}` +
        ` ready CT: ${this.state.ready.CT}` +
        ` unpause T: ${this.state.unpause.TERRORIST}` +
        ` unpause CT: ${this.state.unpause.CT}`
    );
    // this.calculateStats(true);
  }

  say(msg: string) {
    this.addToCommandQueue(Commands.SAY, msg);
  }

  warmup() {
    this.state.ready[TeamConstants.TERRORIST] = false;
    this.state.ready[TeamConstants.CT] = false;
    this.state.unpause[TeamConstants.TERRORIST] = false;
    this.state.unpause[TeamConstants.CT] = false;
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
}
