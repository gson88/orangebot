const dgram = require('dgram');
const socket = dgram.createSocket('udp4');
const named = require('named-regexp').named;
const { ChatCommandConstants } = require('../constants/chat-commands');
const Teams = require('../constants/teams');
const Logger = require('../utils/logger');
const cleanup = require('../utils/node-cleanup');

class SocketHandler {
  serverHandler;

  constructor(socketPort, serverHandler) {
    this.serverHandler = serverHandler;

    socket.bind(socketPort);
    this.subscribeToEvents();

    cleanup.Cleanup(() => {
      if (socket) {
        Logger.log('Closing socket');
        socket.close();
      }
    });

    return this;
  }

  init(port: number, ip: string) {
    socket.send('INIT', port, ip); // SRCDS won't send data if it doesn't get contacted initially
  }

  subscribeToEvents() {
    socket
      .on('message', (msg, info) => {
        const addr = `${info.address}:${info.port}`;
        const text = msg.toString();
        const server = this.serverHandler.getServer(addr);

        if (server === null) {
          Logger.warning(
            'Received a socket message for a server that is not in memory',
            addr
          );
          return;
        }

        Logger.verbose(
          'Socket message received from serverId',
          server.serverId
        );

        this.handleTeamJoin(text, server);
        this.handleClantag(text, server);
        this.handlePlayerDisconnect(text, server);
        this.handleMapLoading(text, server);
        this.handleMapLoaded(text, server);
        this.handleRoundStart(text, server);
        this.handleRoundEnd(text, server);
        this.handleGameOver(text, server);
        this.handleCommand(text, server);
      })
      .on('listening', () => {
        const address = socket.address();
        Logger.log('Socket listening', `${address.address}:${address.port}`);
      })
      .on('close', () => {
        Logger.warning('The socket connection was closed');
      })
      .on('error', err => {
        Logger.error('Socket error');
        Logger.error(err);
      });
  }

  /**
   * @param text
   * @param {Server} server
   */
  handleTeamJoin(text, server) {
    const regex = named(
      /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>]" switched from team [<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>] to [<](:<new_team>CT|TERRORIST|Unassigned|Spectator)[>]/
    );
    const match = regex.exec(text);
    if (match) {
      const steamId = match.capture('steam_id');

      const player = server.state.getPlayer(steamId);
      if (!player) {
        if (match.capture('steam_id') !== 'BOT') {
          server.state.addPlayer(
            steamId,
            match.capture('new_team'),
            match.capture('user_name')
          );
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
  handleClantag(text, server) {
    const regex = named(
      /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*?)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" triggered "clantag" \(value "(:<clan_tag>.*)"\)/
    );
    const match = regex.exec(text);
    if (match) {
      const steamId = match.capture('steam_id');
      const player = server.state.getPlayer(steamId);

      if (!player) {
        if (match.capture('steam_id') !== 'BOT') {
          server.state.addPlayer(
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
      server.updateLastLog();
    }
  }

  /**
   * @param text
   * @param {Server} server
   */
  handlePlayerDisconnect(text, server) {
    // player disconnect
    const regex = named(
      /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" disconnected/
    );
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
  handleMapLoading(text, server) {
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
  handleMapLoaded(text, server) {
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
  handleRoundStart(text, server) {
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
  handleRoundEnd(text, server) {
    // round end
    const regex = named(
      /Team "(:<team>.*)" triggered "SFUI_Notice_(:<team_win>Terrorists_Win|CTs_Win|Target_Bombed|Target_Saved|Bomb_Defused)" \(CT "(:<ct_score>\d+)"\) \(T "(:<t_score>\d+)"\)/
    );
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
  handleGameOver(text, server) {
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
  handleCommand(text, server) {
    // !command
    const regex = named(
      /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator|Console)[>]" say(:<say_team>_team)? "[!.](:<text>.*)"/
    );
    const match = regex.exec(text);
    if (match) {
      const isAdmin =
        match.capture('user_id') === '0' ||
        server.isAdmin(match.capture('steam_id'));
      const params = match.capture('text').split(' ');
      const userTeam = match.capture('user_team');
      const cmd = params[0];
      params.shift();

      switch (cmd.toLowerCase()) {
        case ChatCommandConstants.RESTORE:
        case ChatCommandConstants.REPLAY:
          if (isAdmin) {
            server.restore(params);
          }
          break;
        case ChatCommandConstants.STATUS:
        case ChatCommandConstants.STATS:
        case ChatCommandConstants.SCORE:
        case ChatCommandConstants.SCORES:
          server.stats(true);
          break;
        case ChatCommandConstants.RESTART:
        case ChatCommandConstants.RESET:
        case ChatCommandConstants.WARMUP:
          if (isAdmin) {
            server.warmup();
          }
          break;
        case ChatCommandConstants.MAPS:
        case ChatCommandConstants.MAP:
        case ChatCommandConstants.START:
        case ChatCommandConstants.MATCH:
        case ChatCommandConstants.STARTMATCH:
          if (isAdmin || !server.state.live) {
            server.start(params);
          }
          break;
        case ChatCommandConstants.FORCE:
          if (isAdmin) {
            server.ready(true);
          }
          break;
        case ChatCommandConstants.RESUME:
        case ChatCommandConstants.READY:
        case ChatCommandConstants.RDY:
        case ChatCommandConstants.GABEN:
        case ChatCommandConstants.R:
        case ChatCommandConstants.UNPAUSE:
          server.ready(userTeam);
          break;
        case ChatCommandConstants.PAUSE:
          server.pause(userTeam);
          break;
        case ChatCommandConstants.STAY:
          server.stay(userTeam);
          break;
        case ChatCommandConstants.SWAP:
        case ChatCommandConstants.SWITCH:
          server.swap(userTeam);
          break;
        case ChatCommandConstants.KNIFE:
          if (isAdmin) {
            server.knife();
          }
          break;
        case ChatCommandConstants.RECORD:
          if (isAdmin) {
            server.record();
          }
          break;
        case ChatCommandConstants.OT:
        case ChatCommandConstants.OVERTIME:
          if (isAdmin) {
            server.overtime();
          }
          break;
        case ChatCommandConstants.FULLMAP:
          if (isAdmin) {
            server.fullmap();
          }
          break;
        case ChatCommandConstants.SETTINGS:
          server.settings();
          break;
        case ChatCommandConstants.DISCONNECT:
        case ChatCommandConstants.QUIT:
        case ChatCommandConstants.LEAVE:
          if (isAdmin) {
            server.quit();
            this.serverHandler.removeServer(server);
            Logger.log(server.getIpAndPort() + ' - Disconnected by admin.');
          }
          break;
        case ChatCommandConstants.SAY:
          if (isAdmin) {
            server.say(params.join(' '));
          }
          break;
        case ChatCommandConstants.DEBUG:
          server.debug();
          break;
        default:
      }
      server.updateLastLog();
    }
  }
}

module.exports = SocketHandler;
