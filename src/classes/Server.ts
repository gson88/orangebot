import fs from 'fs';
import RCon from 'simple-rcon';
import regexp from 'named-regexp';
import id64 from '../utils/steam-id-64';
import TeamConstants from '../constants/teams';
import Commands from '../constants/rcon-commands';
import ServerState from './ServerState';
import {
  formatString,
  cleanString,
  cleanChatString
} from '../utils/string-utils';
import Logger from '../utils/logger';
import { IDefaultConfig, IGameConfigs, IServer } from '../types/types';

export default class Server {
  static nrInstances = 0;

  ip: string;
  port: number;
  rconpass: string;
  serverId: number;
  admins: string[] = [];
  commandQueue: any[] = [];
  defaultSettings: IDefaultConfig;
  configFiles: {
    [key: string]: string;
  };
  rconConnection: any = null;
  state: ServerState;

  constructor(
    serverConfig: IServer,
    defaults: IDefaultConfig,
    gameConfigs: IGameConfigs
  ) {
    Logger.log('Creating new Server with serverId', Server.nrInstances);

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

  getRconConnection() {
    if (this.rconConnection) {
      return this.rconConnection;
    }

    this.rconConnection = this.createRconConnection();
    return this.rconConnection;
  }

  createRconConnection() {
    return new RCon({
      host: this.ip,
      port: this.port,
      password: this.rconpass,
      connect: true
    })
      .on('error', err => {
        Logger.error('Could not connect to rcon on server');
        throw err;
      })
      .on('disconnected', () => {
        this.rconConnection = null;
      });
  }

  getIpAndPort(): string {
    return `${this.ip}:${this.port}`;
  }

  updateLastLog() {
    this.state.updateLastLog();
  }

  whitelistSocket(socketIp, socketPort) {
    this.addToCommandQueue(
      `sv_rcon_whitelist_address ${socketIp};logaddress_add ${socketIp}:${socketPort};log on`
    );
    return this;
  }

  startServer() {
    this.getGameStatus();

    setTimeout(() => {
      this.addToCommandQueue(Commands.SAY_WELCOME);
    }, 1000);

    Logger.log(`${this.ip}:${this.port} - Connected to Server.`);
    return this;
  }

  addToCommandQueue(commands: string) {
    if (!commands) {
      return;
    }

    const splitCommands = commands.split(';').map(cmd => cmd.trim());
    this.commandQueue = this.commandQueue.concat(splitCommands);
  }

  execRconCommand(command = '') {
    const conn = this.getRconConnection();

    Logger.verbose('Sending command:', command);
    conn.exec(command);
  }

  clantag(team) {
    if (team !== TeamConstants.TERRORIST && team !== TeamConstants.CT) {
      return team;
    }

    const tags = {};
    let ret = 'mix1';
    if (
      team === TeamConstants.CT &&
      this.clantag(TeamConstants.TERRORIST) === 'mix1'
    ) {
      ret = 'mix2';
    }

    for (let i in this.state.players) {
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

  isAdmin(steamid) {
    return this.admins.indexOf(id64(steamid)) >= 0;
  }

  stats(tochat) {
    const team1 = this.clantag(TeamConstants.TERRORIST);
    const team2 = this.clantag(TeamConstants.CT);
    const stat = {
      [team1]: [],
      [team2]: []
    };
    for (const i in this.state.maps) {
      if (this.state.score[this.state.maps[i]] !== undefined) {
        if (this.state.score[this.state.maps[i]][team1] !== undefined) {
          stat[team1][i] = this.state.score[this.state.maps[i]][team1];
        } else {
          stat[team1][i] = 'x';
        }
        if (this.state.score[this.state.maps[i]][team2] !== undefined) {
          stat[team2][i] = this.state.score[this.state.maps[i]][team2];
        } else {
          stat[team2][i] = 'x';
        }
      } else {
        stat[team1][i] = 'x';
        stat[team2][i] = 'x';
      }
    }
    const maps = [];
    const scores = { team1: 0, team2: 0 };
    for (let j = 0; j < this.state.maps.length; j++) {
      maps.push(
        this.state.maps[j] + ' ' + stat[team1][j] + '-' + stat[team2][j]
      );

      if (this.state.maps[j] !== this.state.map) {
        if (stat[team1][j] > stat[team2][j]) {
          scores.team1 += 1;
        } else if (stat[team1][j] < stat[team2][j]) {
          scores.team2 += 1;
        }
      }
    }

    const chat = '\x10' + team1 + ' [\x06' + maps.join(', ') + '\x10] ' + team2;
    if (tochat) {
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
    return chat;
  }

  restore(round) {
    let roundNum: number | string = parseInt(round);
    if (roundNum < 10) {
      roundNum = '0' + String(roundNum);
    }
    this.addToCommandQueue(
      formatString(Commands.RESTORE_ROUND, `backup_round${roundNum}.txt`, round)
    );
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
    setTimeout(() => {
      this.addToCommandQueue(Commands.SAY_LIVE + ';mp_unpause_match');
    }, 5000);
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
      this.addToCommandQueue(Commands.SAY_PAUSE_ALREADY);
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

  getGameStatus() {
    const conn = this.getRconConnection();
    conn.exec('status', res => {
      const regex = regexp.named(/map\s+:\s+(:<map>.*?)\s/);
      const match = regex.exec(res.body);
      if (match === null) {
        return;
      }

      this.state.map = match.capture('map');
      this.stats(false);
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
        setTimeout(() => {
          this.addToCommandQueue(Commands.SAY_LIVE);
        }, 5000);
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
      this.stats(false);
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
    const config_unformatted = fs.readFileSync(file, 'utf8');
    return config_unformatted.replace(/(\r\n\t|\n|\r\t)/gm, '; ');
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
    this.stats(false);
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
  }

  debug() {
    this.addToCommandQueue(
      'say \x10live: ' +
        this.state.live +
        ' paused: ' +
        this.state.paused +
        ' freeze: ' +
        this.state.freeze +
        ' knife: ' +
        this.state.knife +
        ' knifewinner: ' +
        this.state.knifewinner +
        ' ready: T:' +
        this.state.ready.TERRORIST +
        ' CT:' +
        this.state.ready.CT +
        ' unpause: T:' +
        this.state.unpause.TERRORIST +
        ' CT:' +
        this.state.unpause.CT
    );
    this.stats(true);
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
}
