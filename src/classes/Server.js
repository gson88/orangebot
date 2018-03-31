const fs = require('fs');
const rcon = require('simple-rcon');
const id64 = require('../utils/steam-id-64');
const named = require('named-regexp').named;
const Teams = require('../constants/teams');
const messages = require('../messages');
const ServerState = require('./ServerState');
const { cleanString, cleanChatString } = require('../utils/string-utils');
const Logger = require('../utils/logger');

class Server {
  constructor (serverConfig, defaults, gameConfigs) {
    Logger.log('Creating new Server');
    
    this.ip = serverConfig.host;
    this.port = serverConfig.port;
    this.rconpass = serverConfig.rconpass;
    this.admins = [];
    this.steamid = [];
    this.commandQueue = [];
    this.defaultSettings = defaults;
    this.configFiles = gameConfigs;
    this.rconConnection = null;
    this.state = new ServerState({ ...defaults });
  }
  
  setAdmins (admins) {
    this.admins = admins;
    return this;
  }
  
  getRconConnection () {
    if (this.rconConnection !== null) {
      Logger.log('Using existing rcon connection');
      return this.rconConnection;
    }
  
    Logger.log('Creating a new rcon connection');
    this.rconConnection = new rcon({
      host: this.ip,
      port: this.port,
      password: this.rconpass
    }).on('error', err => {
      Logger.error('Could not connect to rcon on server');
      throw err;
    }).on('disconnected', () => {
      this.rconConnection = null;
    }).connect();

    return this.rconConnection;
  }
  
  getIpAndPort () {
    return `${this.ip}:${this.port}`;
  }
  
  updateLastLog () {
    this.state.last_log = Date.now();
  }
  
  startServer (socketIp, socketPort) {
    this.getRconConnection();
    this.addToCommandQueue(`sv_rcon_whitelist_address ${socketIp};logaddress_add ${socketIp}:${socketPort};log on`);
    this.getGameStatus();
    
    setTimeout(() => {
      this.addToCommandQueue(messages.WELCOME);
    }, 1000);
    
    Logger.log(`${this.ip}:${this.port} - Connected to Server.`);
  }
  
  addToCommandQueue (cmd) {
    if (!cmd) {
      return;
    }
    
    this.commandQueue.push(cmd);
  }
  
  execRconCommand (cmd = '') {
    const commands = cmd.split(';');
    const conn = this.getRconConnection();
    
    for (let i of commands) {
      Logger.log('Sending command:', String(i));
      conn.exec(String(i));
    }
  }
  
  clantag (team) {
    if (team !== Teams.TERRORIST && team !== Teams.CT) {
      return team;
    }
    
    let tags = {};
    let ret = 'mix1';
    if (team === Teams.CT && this.clantag(Teams.TERRORIST) === 'mix1') {
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
    let max = 0;
    for (let prop in tags) {
      if (tags.hasOwnProperty(prop) && tags[prop] > max) {
        ret = prop;
      }
    }
    ret = cleanString(ret);
    if (team === Teams.CT && this.clantag(Teams.TERRORIST) === ret) {
      ret = ret + '2';
    }
    return ret;
  }
  
  isAdmin (steamid) {
    return (this.admins.indexOf(id64(steamid)) >= 0);
  }
  
  stats (tochat) {
    let team1 = this.clantag(Teams.TERRORIST);
    let team2 = this.clantag(Teams.CT);
    let stat = {
      [team1]: [],
      [team2]: []
    };
    for (let i in this.state.maps) {
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
    let maps = [];
    let scores = { team1: 0, team2: 0 };
    for (let j = 0; j < this.state.maps.length; j++) {
      maps.push(this.state.maps[j] + ' ' + stat[team1][j] + '-' + stat[team2][j]);
      
      if (this.state.maps[j] !== this.state.map) {
        if (stat[team1][j] > stat[team2][j]) {
          scores.team1 += 1;
        } else if (stat[team1][j] < stat[team2][j]) {
          scores.team2 += 1;
        }
      }
    }
    let chat = '\x10' + team1 + ' [\x06' + maps.join(', ') + '\x10] ' + team2;
    if (tochat) {
      this.addToCommandQueue('say ' + chat);
    } else {
      let index = this.state.maps.indexOf(this.state.map);
      this.addToCommandQueue(messages.GOTV_OVERLAY.format(index + 1, this.state.maps.length, scores.team1, scores.team2));
    }
    return chat;
  }
  
  restore (round) {
    let roundNum = parseInt(round);
    if (roundNum < 10) {
      roundNum = '0' + roundNum;
    }
    this.addToCommandQueue(messages.RESTORE_ROUND.format(`backup_round${roundNum}.txt`, round));
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
      this.addToCommandQueue(messages.LIVE + ';mp_unpause_match');
    }, 5000);
  }
  
  round () {
    this.state.freeze = false;
    this.state.paused = false;
    this.addToCommandQueue(messages.ROUND_STARTED);
  }
  
  pause () {
    if (!this.state.live) {
      return;
    }
    
    if (this.state.paused) {
      this.addToCommandQueue(messages.PAUSE_ALREADY);
      return;
    }
    
    this.addToCommandQueue(messages.PAUSE_ENABLED);
    this.state.paused = true;
    this.state.unpause = {
      [Teams.TERRORIST]: false,
      [Teams.CT]: false
    };
    
    if (this.state.freeze) {
      this.matchPause();
    }
  }
  
  matchPause () {
    this.addToCommandQueue(messages.MATCH_PAUSED);
    
    if (this.state.pause_time) {
      clearTimeout(this.state.pauses.timer);
      this.state.pauses.timer = setTimeout(() => {
        this.addToCommandQueue(messages.PAUSE_TIMEOUT);
        this.state.pauses.timer = setTimeout(() => {
          this.ready(true);
        }, 20 * 1000);
      }, (this.state.pause_time - 20) * 1000);
      this.addToCommandQueue(messages.PAUSE_TIME.format(this.state.pause_time));
    }
  }
  
  getGameStatus () {
    const conn = this.getRconConnection();
    conn.exec('status', res => {
      console.log(res.body);
      const regex = named(/map\s+:\s+(:<map>.*?)\s/);
      const match = regex.exec(res.body);
      if (match !== null) {
        let map = match.capture('map');
        if (this.state.maps.indexOf(map) >= 0) {
          this.state.map = map;
        } else {
          this.state.map = map;
        }
        this.stats(false);
      }
    });
  }
  
  start (maps) {
    this.state.score = [];
    if (maps.length > 0) {
      this.state.maps = maps;
      
      this.state.mapindex = 0;
      
      if (this.state.map !== maps[0]) {
        this.addToCommandQueue(messages.CHANGE_MAP.format(this.state.maps[0]));
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
  
  ready (team) {
    if (this.state.live && this.state.paused) {
      if (team === true) {
        this.state.unpause.TERRORIST = true;
        this.state.unpause.CT = true;
      } else {
        this.state.unpause[team] = true;
      }
      if (this.state.unpause.TERRORIST !== this.state.unpause.CT) {
        this.addToCommandQueue(messages.READY.format(this.state.unpause.TERRORIST ? messages.T : messages.CT, this.state.unpause.TERRORIST ? messages.CT : messages.T));
      } else if (this.state.unpause.TERRORIST === true && this.state.unpause.CT === true) {
        if ('timer' in this.state.pauses) {
          clearTimeout(this.state.pauses.timer);
        }
        this.addToCommandQueue(messages.MATCH_UNPAUSE);
        this.state.paused = false;
        this.state.unpause = {
          [Teams.TERRORIST]: false,
          [Teams.CT]: false
        };
      }
    } else if (!this.state.live) {
      if (team === true) {
        this.state.ready.TERRORIST = true;
        this.state.ready.CT = true;
      } else {
        this.state.ready[team] = true;
      }
      if (this.state.ready.TERRORIST !== this.state.ready.CT) {
        this.addToCommandQueue(messages.READY.format(this.state.ready.TERRORIST ? messages.T : messages.CT, this.state.ready.TERRORIST ? messages.CT : messages.T));
      } else if (this.state.ready.TERRORIST === true && this.state.ready.CT === true) {
        this.state.live = true;
        if ('timer' in this.state.ready) {
          clearTimeout(this.state.ready.timer);
        }
        if (this.state.knife) {
          this.addToCommandQueue(this.getConfig(this.configFiles.knife));
          this.addToCommandQueue(messages.KNIFE_STARTING);
          
          
          setTimeout(() => {
            this.addToCommandQueue(messages.KNIFE_STARTED);
          }, 9000);
        } else {
          
          this.addToCommandQueue(this.getConfig(this.configFiles.match));
          this.startrecord();
          this.addToCommandQueue(messages.MATCH_STARTING);
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
          this.addToCommandQueue(messages.LIVE);
        }, 5000);
      }
    }
  }
  
  newmap (map, delay = 10000) {
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
  
  knife () {
    if (this.state.live) {
      return;
    }
    
    if (!this.state.knife) {
      this.state.knife = true;
      this.addToCommandQueue(messages.WARMUP_KNIFE);
      this.startReadyTimer();
    } else {
      this.state.knife = false;
      this.addToCommandQueue(messages.KNIFE_DISABLED);
      if ('timer' in this.state.ready) {
        clearTimeout(this.state.ready.timer);
      }
    }
  }
  
  record () {
    if (this.state.live) {
      return;
    }
    
    if (this.state.record === true) {
      this.state.record = false;
      this.addToCommandQueue(messages.DEMO_RECDISABLED);
    } else {
      this.state.record = true;
      this.addToCommandQueue(messages.DEMO_RECENABLED);
    }
  }
  
  settings () {
    this.addToCommandQueue(messages.SETTINGS);
    this.addToCommandQueue(messages.SETTINGS_KNIFE.format(this.state.knife));
    this.addToCommandQueue(messages.SETTINGS_RECORDING.format(this.state.record));
    this.addToCommandQueue(messages.SETTINGS_OT.format(this.state.ot));
    this.addToCommandQueue(messages.SETTINGS_FULLMAP.format(this.state.fullmap));
    
    let outputmaps = '';
    for (let i = 0; i < this.state.maps.length; i++) {
      if (i + 1 < this.state.maps.length) {
        outputmaps += this.state.maps[i];
        outputmaps += ', ';
      } else {
        outputmaps += this.state.maps[i];
      }
    }
    this.addToCommandQueue(messages.SETTINGS_MAPS.format(outputmaps));
  }
  
  mapend () {
    this.addToCommandQueue(messages.MAP_FINISHED);
    this.state.mapindex++;
    if (this.state.record === true) {
      this.addToCommandQueue('tv_stoprecord');
      this.addToCommandQueue(messages.DEMO_FINISHED.format(this.state.demoname));
    }
    
    if (this.state.maps.length >= 0 && this.state.maps.length == this.state.mapindex) {
      this.addToCommandQueue(messages.SERIES_FINISHED);
      this.state.mapindex = 0;
    } else if (this.state.maps.length >= 0 && this.state.maps.length > this.state.mapindex) {
      this.addToCommandQueue(messages.MAP_CHANGE.format(this.state.maps[this.state.mapindex]));
      setTimeout(() => {
        this.addToCommandQueue('changelevel ' + this.state.maps[this.state.mapindex]);
      }, 20000);
    }
  }
  
  overtime () {
    if (this.state.ot === true) {
      this.state.ot = false;
      this.addToCommandQueue(messages.OT_DISABLED);
      this.addToCommandQueue('mp_overtime_enable 0');
    } else {
      this.state.ot = true;
      this.addToCommandQueue(messages.OT_ENABLED);
      this.addToCommandQueue(this.getConfig(this.configFiles.overtime));
    }
  }
  
  fullmap () {
    if (this.state.fullmap === true) {
      this.state.fullmap = false;
      this.addToCommandQueue(messages.FM_DISABLED);
      this.addToCommandQueue('mp_match_can_clinch 1');
    } else {
      this.state.fullmap = true;
      this.addToCommandQueue(messages.FM_ENABLED);
      this.addToCommandQueue(this.getConfig(this.configFiles.fullmap));
    }
  }
  
  startrecord () {
    if (this.state.record === true) {
      let demoname = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '') + '_' + this.state.map + '_' + cleanString(this.clantag('TERRORIST')) + '-' + cleanString(this.clantag('CT')) + '.dem';
      this.state.demoname = demoname;
      this.addToCommandQueue('tv_stoprecord; tv_record ' + demoname);
      this.addToCommandQueue(messages.DEMO_REC.format(demoname));
    }
  }
  
  getConfig (file) {
    const config_unformatted = fs.readFileSync(file, 'utf8');
    return config_unformatted.replace(/(\r\n\t|\n|\r\t)/gm, '; ');
  }
  
  lo3 () {
    this.addToCommandQueue('say \x02The Match will be live on the third restart.');
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
  
  startReadyTimer () {
    if (!this.state.ready_time) {
      return;
    }
    
    if ('timer' in this.state.ready) {
      clearTimeout(this.state.ready.timer);
    }
    
    this.addToCommandQueue(messages.WARMUP_TIME.format(this.state.ready_time));
    this.state.ready.timer = setTimeout(() => {
      this.addToCommandQueue(messages.WARMUP_TIMEOUT);
      this.state.ready.timer = setTimeout(() => {
        this.ready(true);
      }, 20 * 1000);
    }, (this.state.ready_time - 20) * 1000);
  }
  
  score (score) {
    let tagscore = {
      [this.clantag(Teams.CT)]: score.CT,
      [this.clantag(Teams.TERRORIST)]: score.TERRORIST
    };
    
    this.state.score[this.state.map] = tagscore;
    this.stats(false);
    if (( (score.TERRORIST + score.CT) === 1) && this.state.knife) {
      this.state.knifewinner = score.TERRORIST === 1 ? Teams.TERRORIST : Teams.CT;
      this.state.knife = false;
      this.addToCommandQueue(this.getConfig(this.configFiles.match));
      this.addToCommandQueue(messages.KNIFE_WON.format(this.state.knifewinner === Teams.TERRORIST ? messages.T : messages.CT));
      
    } else if (this.state.paused) {
      this.matchPause();
    }
    this.state.freeze = true;
  }
  
  stay (team) {
    if (team === this.state.knifewinner) {
      this.addToCommandQueue(messages.KNIFE_STAY);
      this.state.knifewinner = false;
      this.lo3();
      this.startrecord();
    }
  }
  
  swap (team) {
    if (team === this.state.knifewinner) {
      this.addToCommandQueue(messages.KNIFE_SWAP);
      this.state.knifewinner = false;
      this.lo3();
      this.startrecord();
    }
  }
  
  quit () {
    this.addToCommandQueue('say \x10Goodbye from OrangeBot');
    this.addToCommandQueue('logaddress_delall; log off');
  }
  
  debug () {
    this.addToCommandQueue('say \x10live: ' + this.state.live + ' paused: ' + this.state.paused + ' freeze: ' + this.state.freeze + ' knife: ' + this.state.knife + ' knifewinner: ' + this.state.knifewinner + ' ready: T:' + this.state.ready.TERRORIST + ' CT:' + this.state.ready.CT + ' unpause: T:' + this.state.unpause.TERRORIST + ' CT:' + this.state.unpause.CT);
    this.stats(true);
  }
  
  say (msg) {
    this.addToCommandQueue(`say ${cleanChatString(msg)}`);
  }
  
  warmup () {
    this.state.ready = {
      [Teams.TERRORIST]: false,
      [Teams.CT]: false
    };
    this.state.unpause = {
      [Teams.TERRORIST]: false,
      [Teams.CT]: false
    };
    this.state.live = false;
    this.state.paused = false;
    this.state.freeze = false;
    this.state.knifewinner = false;
    this.state.knife = this.defaultSettings.knife;
    this.state.record = this.defaultSettings.RECORD;
    this.state.ot = this.defaultSettings.OT;
    this.state.fullmap = this.defaultSettings.FULLMAP;
    
    this.addToCommandQueue(this.getConfig(this.configFiles.warmup));
    
    if (this.state.ot) {
      this.addToCommandQueue(this.getConfig(this.configFiles.overtime));
    }
    
    if (this.state.fullmap) {
      this.addToCommandQueue(this.getConfig(this.configFiles.fullmap));
    }
    
    this.addToCommandQueue(messages.WARMUP);
  }
}

module.exports = Server;