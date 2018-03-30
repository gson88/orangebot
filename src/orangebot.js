const parsedArgs = require('minimist')(process.argv.slice(2));
const fs = require('fs');

if (parsedArgs.h === true) {
  printHelp();
  process.exit(0);
}

if (typeof parsedArgs.i === 'undefined') {
  parsedArgs.i = "./config.json";
} else if (parsedArgs.i === true) {
  console.log('\x1b[31mERROR\x1b[0m: You did not specify a config file with the argument -i');
  console.log('OrangeBot v3.0: Exiting with code 1.');
  process.exit(1);
}

checkConfigFileExists();

let named = require('named-regexp').named;
let rcon = require('simple-rcon');
let dns = require('dns');
let dgram = require('dgram');
const socket = dgram.createSocket('udp4');
let SteamID = require('steamid');
let admins64 = [];
let servers = {};
let localIp = require('ip').address();
let externalIp;
require('public-ip').v4().then(ip => {
  externalIp = ip;
  initConnection();
});
let tcpp = require('tcp-ping');

const messages = require('./messages');
let myip;

let config = require('./config.json');
// let nconf = require('nconf');
// let config = nconf
//   .file(parsedArgs.i)
//   .get();

let serveriteration = 0;
for (let admin of config.admins) {
  admins64.push(id64(admin));
}

let configs = Object.keys(config.configs).map(configName => config.configs[configName]);

for (let configFileName of configs) {
  if (!fs.existsSync(configFileName)) {
    console.log('\x1b[31mERROR\x1b[0m: Could not find config file:', configFileName);
    console.log('OrangeBot v3.0: Exiting with code 1.');
    process.exit(1);
  } else {
    console.log('OrangeBot v3.0: Found config file:', configFileName);
  }
}

if (config.pause_time <= 30) {
  config.pause_time = 30;
}

if (config.ready_time <= 30) {
  config.ready_time = 30;
}

String.prototype.format = function () {
  let formatted = this;
  for (let i = 0; i < arguments.length; i++) {
    let regexp = new RegExp('\\{' + i + '\\}', 'gi');
    formatted = formatted.replace(regexp, arguments[i]);
  }
  return formatted;
};

socket.on('message', function (msg, info) {
  let addr = info.address + ':' + info.port;
  let text = msg.toString(),
    param, cmd, re, match;

  if (servers[addr] === undefined && addr.match(/(\d+\.){3}\d+/)) {
    servers[addr] = new Server(String(addr), String(config.server.rconpass));
  }

  // join team
  re = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>]" switched from team [<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>] to [<](:<new_team>CT|TERRORIST|Unassigned|Spectator)[>]/);
  match = re.exec(text);
  if (match !== null) {
    if (servers[addr].state.players[match.capture('steam_id')] === undefined) {
      if (match.capture('steam_id') != 'BOT') {
        servers[addr].state.players[match.capture('steam_id')] = new Player(match.capture('steam_id'), match.capture('new_team'), match.capture('user_name'), undefined);
      }
    } else {
      servers[addr].state.players[match.capture('steam_id')].steamid = match.capture('steam_id');
      servers[addr].state.players[match.capture('steam_id')].team = match.capture('new_team');
      servers[addr].state.players[match.capture('steam_id')].name = match.capture('user_name');
    }
    servers[addr].lastlog = +new Date();
  }

  // clantag
  re = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*?)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" triggered "clantag" \(value "(:<clan_tag>.*)"\)/);
  match = re.exec(text);
  if (match !== null) {
    if (servers[addr].state.players[match.capture('steam_id')] === undefined) {
      if (match.capture('steam_id') != 'BOT') {
        servers[addr].state.players[match.capture('steam_id')] = new Player(match.capture('steam_id'), match.capture('user_team'), match.capture('user_name'), match.capture('clan_tag'));
      }
    } else {
      servers[addr].state.players[match.capture('steam_id')].clantag = match.capture('clan_tag') !== '' ? match.capture('clan_tag') : undefined;
    }
    servers[addr].lastlog = +new Date();
  }

  // disconnect
  re = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" disconnected/);
  match = re.exec(text);
  if (match !== null) {
    if (servers[addr].state.players[match.capture('steam_id')] !== undefined) {
      delete servers[addr].state.players[match.capture('steam_id')];
    }
    servers[addr].lastlog = +new Date();
  }

  // map loading
  re = named(/Loading map "(:<map>.*?)"/);
  match = re.exec(text);
  if (match !== null) {
    for (let prop in servers[addr].state.players) {
      if (servers[addr].state.players.hasOwnProperty(prop)) {
        delete servers[addr].state.players[prop];
      }
    }
    servers[addr].lastlog = +new Date();
  }

  // map started
  re = named(/Started map "(:<map>.*?)"/);
  match = re.exec(text);
  if (match !== null) {
    servers[addr].newmap(match.capture('map'));
    servers[addr].lastlog = +new Date();
  }

  // round start
  re = named(/World triggered "Round_Start"/);
  match = re.exec(text);
  if (match !== null) {
    servers[addr].round();
    servers[addr].lastlog = +new Date();
  }

  // round end
  re = named(/Team "(:<team>.*)" triggered "SFUI_Notice_(:<team_win>Terrorists_Win|CTs_Win|Target_Bombed|Target_Saved|Bomb_Defused)" \(CT "(:<ct_score>\d+)"\) \(T "(:<t_score>\d+)"\)/);
  match = re.exec(text);
  if (match !== null) {
    let score = {
      'TERRORIST': parseInt(match.capture('t_score')),
      'CT': parseInt(match.capture('ct_score'))
    };
    servers[addr].score(score);
    servers[addr].lastlog = +new Date();
  }

  re = named(/Game Over: competitive/);
  match = re.exec(text);
  if (match !== null) {
    servers[addr].mapend();
    servers[addr].lastlog = +new Date();
  }

  // !command
  re = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator|Console)[>]" say(:<say_team>_team)? "[!\.](:<text>.*)"/);
  match = re.exec(text);
  if (match !== null) {
    let isadmin = match.capture('user_id') == '0' || servers[addr].admin(match.capture('steam_id'));
    param = match.capture('text').split(' ');
    cmd = param[0];
    param.shift();
    switch (String(cmd)) {
      case 'restore':
      case 'replay':
        if (isadmin) servers[addr].restore(param);
        break;
      case 'status':
      case 'stats':
      case 'score':
      case 'scores':
        servers[addr].stats(true);
        break;
      case 'restart':
      case 'reset':
      case 'warmup':
        if (isadmin) servers[addr].warmup();
        break;
      case 'maps':
      case 'map':
      case 'start':
      case 'match':
      case 'startmatch':
        if (isadmin || !servers[addr].get().live) servers[addr].start(param);
        break;
      case 'force':
        if (isadmin) servers[addr].ready(true);
        break;
      case 'resume':
      case 'ready':
      case 'rdy':
      case 'gaben':
      case 'r':
      case 'unpause':
        servers[addr].ready(match.capture('user_team'));
        break;
      case 'pause':
        servers[addr].pause(match.capture('user_team'));
        break;
      case 'stay':
        servers[addr].stay(match.capture('user_team'));
        break;
      case 'swap':
      case 'switch':
        servers[addr].swap(match.capture('user_team'));
        break;
      case 'knife':
        if (isadmin) servers[addr].knife();
        break;
      case 'record':
        if (isadmin) servers[addr].record();
        break;
      case 'ot':
      case 'overtime':
        if (isadmin) servers[addr].overtime();
        break;
      case 'fullmap':
        if (isadmin) servers[addr].fullmap();
        break;
      case 'settings':
        servers[addr].settings();
        break;
      case 'disconnect':
      case 'quit':
      case 'leave':
        if (isadmin) {
          servers[addr].quit();
          delete servers[addr];
          console.log('OrangeBot v3.0: ' + addr + ' - Disconnected by admin.');
        }
        break;
      case 'say':
        if (isadmin) servers[addr].say(param.join(' '));
        break;
      case 'debug':
        servers[addr].debug();
        break;
      default:
    }
    servers[addr].lastlog = +new Date();
  }
});

function clean(str) {
  return str.replace(/[^A-Za-z0-9: \-_,]/g, '');
}

function cleansay(str) {
  return str.replace('ä', 'a').replace('ö', 'o').replace(/[^A-Za-z0-9:<>.?! \-_,]/g, '');
}

function Player(steamid, team, name, clantag) {
  this.steamid = steamid;
  this.team = team;
  this.name = name;
  this.clantag = clantag;
}

function Server(address, rconpass, adminip, adminid, adminname) {
  console.log('Creating new Server');

  let tag = this;
  this.state = {
    ip: address.split(':')[0],
    port: address.split(':')[1] || 27015,
    rconpass: rconpass,
    live: false,
    map: '',
    maps: [],
    mapindex: 0,
    knife: config.knifedefault,
    record: config.recorddemo,
    demoname: '',
    ot: config.otdefault,
    fullmap: config.fullmapdefault,
    score: [],
    knifewinner: false,
    paused: false,
    freeze: false,
    unpause: {
      'TERRORIST': false,
      'CT': false
    },
    ready: {
      'TERRORIST': false,
      'CT': false
    },
    steamid: [],
    admins: [],
    queue: [],
    players: {},
    pauses: {}
  };

  if (adminid && tag.state.steamid.indexOf(adminid) === -1) {
    tag.state.steamid.push(id64(adminid));
    tag.state.admins.push(adminname);
  }

  this.get = function () {
    return this.state;
  };

  this.rcon = function (cmd) {
    if (cmd === undefined) return;
    this.state.queue.push(cmd);
  };

  this.realrcon = function (cmd) {
    if (cmd === undefined) return;
    let conn = new rcon({
      host: this.state.ip,
      port: this.state.port,
      password: this.state.rconpass
    });
    conn.on('authenticated', function () {
      cmd = cmd.split(';');
      for (let i in cmd) {
        conn.exec(String(cmd[i]));
      }
      conn.close();
    }).on('error', function (err) {
      console.error(err);
      console.error('error connecting to rcon');
    });
    conn.connect();
  };

  this.clantag = function (team) {
    if (team != 'TERRORIST' && team != 'CT') {
      return team;
    }

    let tags = {};
    let ret = 'mix1';
    if (team == 'CT' && this.clantag('TERRORIST') == 'mix1') {
      ret = 'mix2';
    }
    for (let i in this.state.players) {
      if (this.state.players[i].team == team && this.state.players[i].clantag !== undefined) {
        if (tags[this.state.players[i].clantag] === undefined) {
          tags[this.state.players[i].clantag] = 0;
        }
        tags[this.state.players[i].clantag]++;
      }
    }
    let max = 0;
    for (let prop in tags) {
      if (tags.hasOwnProperty(prop) && tags[prop] > max) {
        ret = prop;
      }
    }
    ret = clean(ret);
    if (team == 'CT' && this.clantag('TERRORIST') == ret) {
      ret = ret + '2';
    }
    return ret;
  };

  this.admin = function (steamid) {
    return (this.state.steamid.indexOf(id64(steamid)) >= 0 || admins64.indexOf(id64(steamid)) >= 0);
  };

  this.hasadmin = function () {
    return (this.state.steamid.length > 0);
  };

  this.stats = function (tochat) {
    let team1 = this.clantag('TERRORIST');
    let team2 = this.clantag('CT');
    let stat = {};
    stat[team1] = [];
    stat[team2] = [];
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
    let scores = {team1: 0, team2: 0};
    for (let j = 0; j < this.state.maps.length; j++) {
      maps.push(this.state.maps[j] + ' ' + stat[team1][j] + '-' + stat[team2][j]);

      if (this.state.maps[j] != this.state.map) {
        if (stat[team1][j] > stat[team2][j]) scores.team1 += 1;
        else if (stat[team1][j] < stat[team2][j]) scores.team2 += 1;
      }
    }
    let chat = '\x10' + team1 + ' [\x06' + maps.join(', ') + '\x10] ' + team2;
    if (tochat) {
      this.rcon('say ' + chat);
    } else {
      let index = this.state.maps.indexOf(this.state.map);
      this.rcon(messages.GOTV_OVERLAY.format(index + 1, this.state.maps.length, scores.team1, scores.team2));
    }
    return chat;
  };
  this.restore = function (round) {
    let roundNum = parseInt(round);
    if (roundNum < 10) roundNum = "0" + roundNum;
    this.rcon(messages.RESTORE_ROUND.format('backup_round' + roundNum + '.txt', round));
    setTimeout(function () {
      tag.rcon('say \x054...');
    }, 1000);
    setTimeout(function () {
      tag.rcon('say \x063...');
    }, 2000);
    setTimeout(function () {
      tag.rcon('say \x102...');
    }, 3000);
    setTimeout(function () {
      tag.rcon('say \x0f1...');
    }, 4000);
    setTimeout(function () {
      tag.rcon(messages.LIVE + ';mp_unpause_match');
    }, 5000);
  };
  this.round = function () {
    this.state.freeze = false;
    this.state.paused = false;
    this.rcon(messages.ROUND_STARTED);
  };
  this.pause = function (team) {
    team = this.clantag(team);
    if (!this.state.live) return;
    if (this.state.paused) {
      this.rcon(messages.PAUSE_ALREADY);
      return;
    }

    this.rcon(messages.PAUSE_ENABLED);
    this.state.paused = true;
    this.state.unpause = {
      'TERRORIST': false,
      'CT': false
    };
    if (this.state.freeze) {
      this.matchPause();
    }
  };
  this.matchPause = function () {
    this.rcon(messages.MATCH_PAUSED);

    if (config.pause_time) {
      clearTimeout(this.state.pauses.timer);
      this.state.pauses.timer = setTimeout(function () {
        tag.rcon(messages.PAUSE_TIMEOUT);
        tag.state.pauses.timer = setTimeout(function () {
          tag.ready(true);
        }, 20 * 1000);
      }, (config.pause_time - 20) * 1000);
      this.rcon(messages.PAUSE_TIME.format(config.pause_time));
    }
  };
  this.status = function () {
    let conn = new rcon({
      host: this.state.ip,
      port: this.state.port,
      password: this.state.rconpass
    }).on('error', function (err) {
    }).exec('status', function (res) {
      let re = named(/map\s+:\s+(:<map>.*?)\s/);
      let match = re.exec(res.body);
      if (match !== null) {
        let map = match.capture('map');
        if (tag.state.maps.indexOf(map) >= 0) {
          tag.state.map = map;
        } else {
          tag.state.map = map;
        }
        tag.stats(false);
      }
      let regex = new RegExp('"(:<user_name>.*?)" (:<steam_id>STEAM_.*?) .*?' + adminip + ':', '');
      re = named(regex);
      match = re.exec(res.body);
      if (match !== null) {
        for (let i in match.captures.steam_id) {
          if (tag.state.steamid.indexOf(id64(match.captures.steam_id[i])) == -1) {
            tag.state.steamid.push(id64(match.captures.steam_id[i]));
            tag.state.admins.push(match.captures.user_name[i]);
          }
        }
      }
      conn.close();
    }).connect();
  };
  this.start = function (maps) {
    this.state.score = [];
    if (maps.length > 0) {
      this.state.maps = maps;

      this.state.mapindex = 0;

      if (this.state.map != maps[0]) {
        this.rcon('changelevel ' + this.state.maps[0]);
      } else {
        this.newmap(maps[0], 0);
      }
    } else {
      this.state.maps = [];
      this.newmap(this.state.map, 0);
      setTimeout(function () {
        tag.status();
      }, 1000);
    }
  };
  this.ready = function (team) {
    if (this.state.live && this.state.paused) {
      if (team === true) {
        this.state.unpause.TERRORIST = true;
        this.state.unpause.CT = true;
      } else {
        this.state.unpause[team] = true;
      }
      if (this.state.unpause.TERRORIST != this.state.unpause.CT) {
        this.rcon(messages.READY.format(this.state.unpause.TERRORIST ? T : CT, this.state.unpause.TERRORIST ? CT : T));
      } else if (this.state.unpause.TERRORIST === true && this.state.unpause.CT === true) {
        if ("timer" in this.state.pauses) clearTimeout(this.state.pauses.timer);
        this.rcon(messages.MATCH_UNPAUSE);
        this.state.paused = false;
        this.state.unpause = {
          'TERRORIST': false,
          'CT': false
        };
      }
    } else if (!this.state.live) {
      if (team === true) {
        this.state.ready.TERRORIST = true;
        this.state.ready.CT = true;
      } else {
        this.state.ready[team] = true;
      }
      if (this.state.ready.TERRORIST != this.state.ready.CT) {
        this.rcon(messages.READY.format(this.state.ready.TERRORIST ? T : CT, this.state.ready.TERRORIST ? CT : T));
      } else if (this.state.ready.TERRORIST === true && this.state.ready.CT === true) {
        this.state.live = true;
        if ("timer" in this.state.ready) clearTimeout(this.state.ready.timer);
        if (this.state.knife) {
          this.rcon(this.getconfig(config.configs.knife));
          tag.rcon(messages.KNIFE_STARTING);


          setTimeout(function () {
            tag.rcon(messages.KNIFE_STARTED);
          }, 9000);
        } else {

          this.rcon(this.getconfig(config.configs.match));
          this.startrecord();
          this.rcon(messages.MATCH_STARTING);
          this.lo3();
        }
        setTimeout(function () {
          tag.rcon('say \x054...');
        }, 1000);
        setTimeout(function () {
          tag.rcon('say \x063...');
        }, 2000);
        setTimeout(function () {
          tag.rcon('say \x102...');
        }, 3000);
        setTimeout(function () {
          tag.rcon('say \x0f1...');
        }, 4000);
        setTimeout(function () {
          tag.rcon(messages.LIVE);
        }, 5000);
      }
    }
  };
  this.newmap = function (map, delay) {
    if (delay === undefined) delay = 10000;
    let index = -1;
    if (this.state.maps.indexOf(map) >= 0) {
      index = this.state.maps.indexOf(map);
      this.state.map = map;
    } else {
      this.state.maps = [map];
      this.state.map = map;
    }
    setTimeout(function () {
      tag.stats(false);
      tag.warmup();
      tag.startReadyTimer();
    }, delay);
  };
  this.knife = function () {
    if (this.state.live) {
      return;
    }

    if (!this.state.knife) {
      this.state.knife = true;
      this.rcon(messages.WARMUP_KNIFE);
      this.startReadyTimer();
    } else {
      this.state.knife = false;
      this.rcon(messages.KNIFE_DISABLED);
      if ("timer" in this.state.ready) clearTimeout(this.state.ready.timer);
    }
  };

  this.record = function () {
    if (this.state.live) {
      return;
    }

    if (this.state.record === true) {
      this.state.record = false;
      this.rcon(messages.DEMO_RECDISABLED);
    } else {
      this.state.record = true;
      this.rcon(messages.DEMO_RECENABLED);
    }
  };

  this.settings = function () {
    this.rcon(messages.SETTINGS);
    this.rcon(messages.SETTINGS_KNIFE.format(this.state.knife));
    this.rcon(messages.SETTINGS_RECORDING.format(this.state.record));
    this.rcon(messages.SETTINGS_OT.format(this.state.ot));
    this.rcon(messages.SETTINGS_FULLMAP.format(this.state.fullmap));

    let outputmaps = "";
    for (let i = 0; i < this.state.maps.length; i++) {
      if (i + 1 < this.state.maps.length) {
        outputmaps += this.state.maps[i];
        outputmaps += ", ";
      } else {
        outputmaps += this.state.maps[i];
      }
    }
    this.rcon(messages.SETTINGS_MAPS.format(outputmaps));
  };

  this.mapend = function () {
    this.rcon(messages.MAP_FINISHED);
    this.state.mapindex++;
    if (this.state.record === true) {
      this.rcon('tv_stoprecord');
      this.rcon(messages.DEMO_FINISHED.format(this.state.demoname));
    }

    if (this.state.maps.length >= 0 && this.state.maps.length == this.state.mapindex) {
      this.rcon(messages.SERIES_FINISHED);
      this.state.mapindex = 0;
    } else if (this.state.maps.length >= 0 && this.state.maps.length > this.state.mapindex) {
      this.rcon(messages.MAP_CHANGE.format(this.state.maps[this.state.mapindex]));
      setTimeout(() => {
        this.rcon('changelevel ' + this.state.maps[this.state.mapindex]);
      }, 20000);
    }
  };

  this.overtime = function () {
    if (this.state.ot === true) {
      this.state.ot = false;
      this.rcon(messages.OT_DISABLED);
      this.rcon('mp_overtime_enable 0');
    } else {
      this.state.ot = true;
      this.rcon(messages.OT_ENABLED);
      this.rcon(this.getconfig(config.configs.overtime));
    }
  };

  this.fullmap = function () {
    if (this.state.fullmap === true) {
      this.state.fullmap = false;
      this.rcon(messages.FM_DISABLED);
      this.rcon('mp_match_can_clinch 1');
    } else {
      this.state.fullmap = true;
      this.rcon(messages.FM_ENABLED);
      this.rcon(this.getconfig(config.configs.fullmap));
    }
  };

  this.startrecord = function () {
    if (this.state.record === true) {
      let demoname = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '') + '_' + this.state.map + '_' + clean(this.clantag('TERRORIST')) + '-' + clean(this.clantag('CT')) + '.dem';
      this.state.demoname = demoname;
      this.rcon('tv_stoprecord; tv_record ' + demoname);
      this.rcon(messages.DEMO_REC.format(demoname));
    }
  };

  this.getconfig = function (file) {
    let config_unformatted = fs.readFileSync(file, 'utf8');
    return config_unformatted.replace(/(\r\n\t|\n|\r\t)/gm, "; ");
  };

  this.lo3 = function () {
    this.rcon('say \x02The Match will be live on the third restart.');
    this.rcon('mp_restartgame 1');
    setTimeout(function () {
      tag.rcon('mp_restartgame 1');
    }, 1000);
    setTimeout(function () {
      tag.rcon('mp_restartgame 3');
    }, 2000);
    setTimeout(function () {
      tag.rcon('say \x04Match is live!');
    }, 6000);
  };

  this.startReadyTimer = function () {
    if (!config.ready_time) {
      return;
    }

    if ("timer" in this.state.ready) {
      clearTimeout(this.state.ready.timer);
    }

    let tag = this;
    this.rcon(messages.WARMUP_TIME.format(config.ready_time));
    this.state.ready.timer = setTimeout(function () {
      tag.rcon(messages.WARMUP_TIMEOUT);
      tag.state.ready.timer = setTimeout(function () {
        tag.ready(true);
      }, 20 * 1000);
    }, (config.ready_time - 20) * 1000);
  };

  this.score = function (score) {
    let tagscore = {};
    tagscore[this.clantag('CT')] = score.CT;
    tagscore[this.clantag('TERRORIST')] = score.TERRORIST;
    this.state.score[this.state.map] = tagscore;
    this.stats(false);
    if (( (score.TERRORIST + score.CT) === 1) && this.state.knife) {
      this.state.knifewinner = score.TERRORIST === 1 ? 'TERRORIST' : 'CT';
      this.state.knife = false;
      this.rcon(this.getconfig(config.configs.match));
      this.rcon(messages.KNIFE_WON.format(this.state.knifewinner === 'TERRORIST' ? T : CT));

    } else if (this.state.paused) {
      this.matchPause();
    }
    this.state.freeze = true;
  };

  this.stay = function (team) {
    if (team === this.state.knifewinner) {
      this.rcon(messages.KNIFE_STAY);
      this.state.knifewinner = false;
      this.lo3();
      this.startrecord();
    }
  };

  this.swap = function (team) {
    if (team === this.state.knifewinner) {
      this.rcon(messages.KNIFE_SWAP);
      this.state.knifewinner = false;
      this.lo3();
      this.startrecord();
    }
  };

  this.quit = function () {
    this.rcon('say \x10Goodbye from OrangeBot');
    this.rcon('logaddress_delall; log off');
  };

  this.debug = function () {
    this.rcon('say \x10live: ' + this.state.live + ' paused: ' + this.state.paused + ' freeze: ' + this.state.freeze + ' knife: ' + this.state.knife + ' knifewinner: ' + this.state.knifewinner + ' ready: T:' + this.state.ready.TERRORIST + ' CT:' + this.state.ready.CT + ' unpause: T:' + this.state.unpause.TERRORIST + ' CT:' + this.state.unpause.CT);
    this.stats(true);
  };

  this.say = function (msg) {
    this.rcon('say ' + cleansay(msg));
  };

  this.warmup = function () {
    this.state.ready = {
      'TERRORIST': false,
      'CT': false
    };
    this.state.unpause = {
      'TERRORIST': false,
      'CT': false
    };
    this.state.live = false;
    this.state.paused = false;
    this.state.freeze = false;
    this.state.knifewinner = false;
    this.state.knife = config.knifedefault;
    this.state.record = config.recorddemo;
    this.state.ot = config.otdefault;
    this.state.fullmap = config.fullmapdefault;

    this.rcon(this.getconfig(config.configs.warmup));

    if (this.state.ot) {
      this.rcon(this.getconfig(config.configs.overtime));
    }

    if (this.state.fullmap) {
      this.rcon(this.getconfig(config.configs.fullmap));
    }

    tag.rcon(messages.WARMUP);
  };
  this.rcon('sv_rcon_whitelist_address ' + myip + ';logaddress_add ' + myip + ':' + config.port + ';log on');
  this.status();
  setTimeout(function () {
    tag.rcon(messages.WELCOME);
  }, 1000);
  socket.send("plz go", 0, 6, this.state.port, this.state.ip); // SRCDS won't send data if it doesn't get contacted initially
  console.log('OrangeBot v3.0: ' + this.state.ip + ':' + this.state.port + ' - Connected to Server.');
}

setInterval(function () {
  for (let i in servers) {
    if (!servers.hasOwnProperty(i)){
      return;
    }

    let now = +new Date();
    if (servers[i].lastlog < now - 1000 * 60 * 10 && servers[i].state.players.length < 3) {
      console.log('Dropping idle server ' + i);
      delete servers[i];
      continue;
    }
    if (!servers[i].state.live) {
      if (servers[i].state.knife) {
        servers[i].rcon(messages.WARMUP_KNIFE);
        if (config.ready_time) servers[i].rcon(messages.WARMUP_TIME.format(config.ready_time));
      } else if (servers[i].state.maps.length) {
        servers[i].rcon(messages.WARMUP);
        if (config.ready_time) servers[i].rcon(messages.WARMUP_TIME.format(config.ready_time));
      } else {
        servers[i].rcon(messages.WELCOME);
      }
    } else if (servers[i].state.paused && servers[i].state.freeze) {
      //servers[i].matchPause();
    }
  }
}, 30000);

setInterval(function () {
  for (let i in servers) {
    if (servers[i].state.queue.length > 0) {
      let cmd = servers[i].state.queue.shift();
      servers[i].realrcon(cmd);
    }
  }
}, 100);

socket.bind(config.port);
process.on('uncaughtException', function (err) {

  if (err.code === 'EADDRINUSE') {
    console.log('OrangeBot v3.0: \x1b[31mERROR\x1b[0m: Could not bind UDP Socket to port ' + config.port);
    console.log('OrangeBot v3.0: \x1b[31mERROR\x1b[0m: Maybe try to use another port?');
    console.log('OrangeBot v3.0: Exiting with code 1.');
    process.exit(1);
  }
});

function addServer(host, port, rconpass) {

  if (serveriteration < config.server.length) {
    console.log('OrangeBot v3.0: ' + host + ':' + port + ' - Trying to establish connection to Server . . .');
    tcpp.probe(host, port, function (err, available) {
      if (available) {
        dns.lookup(host, 4, function (err, ip) {
          console.log('OrangeBot v3.0: ' + host + ':' + port + ' - Server is reachable. Adding to server list and connecting . . .');
          servers[ip + ':' + port] = new Server(ip + ':' + port, rconpass);
          serveriteration++;
          addServer(config.server[serveriteration].host, config.server[serveriteration].port, config.server[serveriteration].rconpass);
        });
      } else {
        console.log('OrangeBot v3.0: ' + host + ':' + port + ' - ERROR: Server is not reachable.');
        serveriteration++;
        addServer(config.server[serveriteration].host, config.server[serveriteration].port, config.server[serveriteration].rconpass);
      }
    });
  }
}

function initConnection() {
  console.log('OrangeBot v3.0: UDP Socket listening on ' + config.port);
  console.log('____________________________________________________________');
  console.log();

  if (config.serverType === "local") {
    myip = localIp;
  }
  else {
    myip = externalIp;
  }

  addServer(config.server[0].host, config.server[0].port, config.server[0].rconpass);

  // setTimeout(() => {
  //   console.log('____________________________________________________________');
  //   console.log();
  //   console.log('OrangeBot v3.0: If you want to add more servers without putting them in your json, you can add them on-the-fly In-game by typing this in your console:');
  //   console.log('OrangeBot v3.0: connect YOURSERVER; password YOURPASSWORD; rcon_password YOURRCON; rcon sv_whitelist_address ' + externalIp + '; rcon logaddress_add ' + externalIp + ':' + config.myport + ';rcon log on; rcon rcon_password ' + config.rcon_pass);
  //   console.log('OrangeBot v3.0: Make sure to fill YOURSERVER, YOURPASSWORD and YOURRCON with your own data.');
  //   console.log('____________________________________________________________');
  //   console.log();
  // }, config.server.length * 1000);
}

function id64(steamid) {
  return (new SteamID(String(steamid))).getSteamID64();
}

function checkConfigFileExists() {
  console.log('OrangeBot v3.0: Checking if we can find config file ...');
  if (!fs.existsSync(parsedArgs.i)) {
    console.log('\x1b[31mERROR\x1b[0m: Could not find ini file: ' + parsedArgs.i);
    console.log('OrangeBot v3.0: Exiting with code 1.');
    process.exit(1);
  } else {
    console.log('OrangeBot v3.0: Found config file: ' + parsedArgs.i);
  }
}

function printHelp() {
  console.log('Usage:             node orangebot.js [-i json] [-h]');
  console.log('Description:       OrangeBot v3.0 is a CS:GO matchmaking bot written in node.js.');
  console.log('GitHub:            https://github.com/dejavueakay/orangebot');
  console.log();
  console.log('Arguments:');
  console.log(' -i json                    Set the json file to use');
  console.log(' -h                                See this help');
  console.log();
  console.log('For further documentation, visit our GitHub wiki: https://github.com/dejavueakay/orangebot/wiki');
  process.exit();
}