const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const named = require('named-regexp').named;
const Commands = require('../constants/chat-commands');
const Teams = require('../constants/teams');
const Logger = require('../utils/logger');
const cleanup = require('../utils/node-cleanup');

class SocketHandler {
  constructor (socketPort, serverHandler) {
    this.serverHandler = serverHandler;
    
    socket.on('message', (msg, info) => {
      console.log('message received');
      const addr = `${info.address}:${info.port}`;
      const text = msg.toString();
      
      const server = this.serverHandler.getServer(addr);
      if (server === null) {
        console.error('Received a socket message for a server that is not in memory', addr);
        return;
      }
    
      this.handleTeamJoin(text, server);
      this.handleClantag(text, server);
      this.handlePlayerDisconnect(text, server);
      this.handleMapLoading(text, server);
      this.handleMapLoaded(text, server);
      this.handleRoundStart(text, server);
      this.handleRoundEnd(text, server);
      this.handleGameOver(text, server);
      this.handleCommand(text, server);
      
    }).on('listening', () => {
      const address = socket.address();
      Logger.log('Socket listening', `${address.address}:${address.port}`);
    }).on('close', () => {
      Logger.log('The socket closed the connection');
    }).on('error', err => {
      Logger.error('Socket error');
      Logger.error(err);
    });
    
    socket.bind(socketPort);
  
    cleanup.Cleanup(() => {
      if (socket) {
        Logger.log('Closing socket');
        socket.close(0);
      }
    });
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleTeamJoin (text, server) {
    const regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>]" switched from team [<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>] to [<](:<new_team>CT|TERRORIST|Unassigned|Spectator)[>]/);
    const match = regex.exec(text);
    if (match) {
      const steamId = match.capture('steam_id');
      
      const player = server.state.getPlayer(steamId);
      if (!player) {
        if (match.capture('steam_id') !== 'BOT') {
          server.state.addPlayer(steamId, match.capture('new_team'), match.capture('user_name'));
        }
      } else {
        player.steamid = steamId;
        player.team = match.capture('new_team');
        player.name = match.capture('user_name');
      }
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleClantag (text, server) {
    const re = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*?)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" triggered "clantag" \(value "(:<clan_tag>.*)"\)/);
    const match = re.exec(text);
    if (match) {
      const steamId = match.capture('steam_id');
      const player = server.state.getPlayer(steamId);
      
      if (!player) {
        if (match.capture('steam_id') !== 'BOT') {
          server.state.addPlayer(steamId, match.capture('user_team'), match.capture('user_name'), match.capture('clan_tag'));
        }
      } else {
        player.clantag = match.capture('clan_tag') !== '' ? match.capture('clan_tag') : undefined;
      }
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handlePlayerDisconnect (text, server) {
    // player disconnect
    const regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" disconnected/);
    const match = regex.exec(text);
    if (match) {
      const steamId = match.capture('steam_id');
      server.state.deletePlayer(steamId);
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleMapLoading (text, server) {
    // map loading
    const regex = named(/Loading map "(:<map>.*?)"/);
    const match = regex.exec(text);
    if (match) {
      server.state.clearPlayers();
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleMapLoaded (text, server) {
    // map started
    const regex = named(/Started map "(:<map>.*?)"/);
    const match = regex.exec(text);
    if (match) {
      server.newmap(match.capture('map'));
      server.updateLastLog();
    }
  
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleRoundStart (text, server) {
    // round start
    const regex = named(/World triggered "Round_Start"/);
    const match = regex.exec(text);
    if (match) {
      server.round();
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleRoundEnd (text, server) {
    // round end
    const regex = named(/Team "(:<team>.*)" triggered "SFUI_Notice_(:<team_win>Terrorists_Win|CTs_Win|Target_Bombed|Target_Saved|Bomb_Defused)" \(CT "(:<ct_score>\d+)"\) \(T "(:<t_score>\d+)"\)/);
    const match = regex.exec(text);
    if (match) {
      const score = {
        [Teams.TERRORIST]: parseInt(match.capture('t_score')),
        [Teams.CT]: parseInt(match.capture('ct_score'))
      };
      server.score(score);
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleGameOver (text, server) {
    const regex = named(/Game Over: competitive/);
    const match = regex.exec(text);
    if (match) {
      server.mapend();
      server.updateLastLog();
    }
  }
  
  /**
   * @param text
   * @param {Server} server
   */
  handleCommand (text, server) {
    // !command
    const regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator|Console)[>]" say(:<say_team>_team)? "[!.](:<text>.*)"/);
    const match = regex.exec(text);
    if (match) {
      const isAdmin = match.capture('user_id') === '0' || server.isAdmin(match.capture('steam_id'));
      const params = match.capture('text').split(' ');
      const userTeam = match.capture('user_team');
      const cmd = params[0];
      params.shift();
      switch (cmd.toLowerCase()) {
        case Commands.RESTORE:
        case Commands.REPLAY:
          if (isAdmin) {
            server.restore(params);
          }
          break;
        case Commands.STATUS:
        case Commands.STATS:
        case Commands.SCORE:
        case Commands.SCORES:
          server.stats(true);
          break;
        case Commands.RESTART:
        case Commands.RESET:
        case Commands.WARMUP:
          if (isAdmin) {
            server.warmup();
          }
          break;
        case Commands.MAPS:
        case Commands.MAP:
        case Commands.START:
        case Commands.MATCH:
        case Commands.STARTMATCH:
          if (isAdmin || !server.state.live) {
            server.start(params);
          }
          break;
        case Commands.FORCE:
          if (isAdmin) {
            server.ready(true);
          }
          break;
        case Commands.RESUME:
        case Commands.READY:
        case Commands.RDY:
        case Commands.GABEN:
        case Commands.R:
        case Commands.UNPAUSE:
          server.ready(userTeam);
          break;
        case Commands.PAUSE:
          server.pause(userTeam);
          break;
        case Commands.STAY:
          server.stay(userTeam);
          break;
        case Commands.SWAP:
        case Commands.SWITCH:
          server.swap(userTeam);
          break;
        case Commands.KNIFE:
          if (isAdmin) {
            server.knife();
          }
          break;
        case Commands.RECORD:
          if (isAdmin) {
            server.record();
          }
          break;
        case Commands.OT:
        case Commands.OVERTIME:
          if (isAdmin) {
            server.overtime();
          }
          break;
        case Commands.FULLMAP:
          if (isAdmin) {
            server.fullmap();
          }
          break;
        case Commands.SETTINGS:
          server.settings();
          break;
        case Commands.DISCONNECT:
        case Commands.QUIT:
        case Commands.LEAVE:
          if (isAdmin) {
            server.quit();
            this.serverHandler.removeServer(server);
            Logger.log(server.getIpAndPort() + ' - Disconnected by admin.');
          }
          break;
        case Commands.SAY:
          if (isAdmin) {
            server.say(params.join(' '));
          }
          break;
        case Commands.DEBUG:
          server.debug();
          break;
        default:
      }
      server.updateLastLog();
    }
  }
  
}

module.exports = SocketHandler;