import regexp from 'named-regexp';
import dgram, { RemoteInfo, Socket } from 'dgram';
import Teams from '../constants/teams';
import Logger from '../utils/logger';
import * as cleanup from '../utils/node-cleanup';
import Server from './Server';

export default class SocketHandler {
  private socket: Socket = dgram.createSocket('udp4');
  private server: Server;
  private onSocketMessageCallbacks: Function[] = [];

  constructor(socketPort: number) {
    this.server = null;

    this.socket.bind(socketPort);
    this.subscribeToSocketEvents();

    cleanup.Cleanup(() => {
      if (this.socket) {
        Logger.log('Closing socket');
        this.socket.close();
      }
    });

    return this;
  }

  addSocketMessageCallback(cb) {
    this.onSocketMessageCallbacks.push(cb);
  }

  init(ip: string, port: number) {
    Logger.log('socketHandler.init', `${ip}:${port}`);
    this.socket.send('INIT', port, ip); // SRCDS won't send data if it doesn't get contacted initially
  }

  onMessage = (msg: Buffer, info: RemoteInfo) => {
    this.onSocketMessageCallbacks.map(cb => {
      cb(msg, info);
    });
  };

  subscribeToSocketEvents() {
    this.socket
      .on('message', this.onMessage)
      .on('listening', () => {
        const address = this.socket.address();
        if (typeof address !== 'string') {
          Logger.log('Socket listening', `${address.address}:${address.port}`);
        } else {
          Logger.log('Socket listening', address);
        }
      })
      .on('close', () => {
        Logger.warning('The socket connection was closed');
      })
      .on('error', err => {
        Logger.error('Socket error');
        Logger.error(err);
      });
  }

  static handleTeamJoin(text: string, server: Server) {
    const regex = regexp.named(
      /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>]" switched from team [<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>] to [<](:<new_team>CT|TERRORIST|Unassigned|Spectator)[>]/
    );
    const match = regex.exec(text);
    if (!match) {
      return;
    }

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

  static handleClantag(text: string, server: Server) {
    const regex = regexp.named(
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

  static handlePlayerDisconnect(text: string, server: Server) {
    // player disconnect
    const regex = regexp.named(
      /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" disconnected/
    );
    const match = regex.exec(text);
    if (match) {
      const steamId = match.capture('steam_id');
      server.state.deletePlayer(steamId);
      server.updateLastLog();
    }
  }

  static handleMapLoading(text: string, server: Server) {
    // map loading
    const regex = regexp.named(/Loading map "(:<map>.*?)"/);
    const match = regex.exec(text);
    if (match) {
      server.state.clearPlayers();
      server.updateLastLog();
    }
  }

  static handleMapLoaded(text: string, server: Server) {
    // map started
    const regex = regexp.named(/Started map "(:<map>.*?)"/);
    const match = regex.exec(text);
    if (match) {
      server.newmap(match.capture('map'));
      server.updateLastLog();
    }
  }

  static handleRoundStart(text: string, server: Server) {
    // round start
    const regex = regexp.named(/World triggered "Round_Start"/);
    const match = regex.exec(text);
    if (match) {
      server.round();
      server.updateLastLog();
    }
  }

  static handleRoundEnd(text: string, server: Server) {
    // round end
    const regex = regexp.named(
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

  static handleGameOver(text: string, server: Server) {
    const regex = regexp.named(/Game Over: competitive/);
    const match = regex.exec(text);
    if (match) {
      server.mapend();
      server.updateLastLog();
    }
  }

  // handleCommand(text: string, server: Server) {
  //   // !command
  //   const regex = regexp.named(
  //     /"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator|Console)[>]" say(:<say_team>_team)? "[!.](:<text>.*)"/
  //   );
  //   const match = regex.exec(text);
  //   if (!match) {
  //     return;
  //   }
  //
  //   const userId = match.capture('user_id');
  //   const steamId = match.capture('steam_id');
  //   const userTeam = match.capture('user_team');
  //   const params = match.capture('text').split(' ');
  //
  //   const isAdmin = userId === '0' || server.isAdmin(steamId);
  //   const cmd = params[0];
  //   params.shift();
  //
  //   switch (cmd.toLowerCase()) {
  //     case ChatCommandConstants.RESTORE:
  //     case ChatCommandConstants.REPLAY:
  //       if (isAdmin) {
  //         server.restore(params);
  //       }
  //       break;
  //     case ChatCommandConstants.STATUS:
  //     case ChatCommandConstants.STATS:
  //     case ChatCommandConstants.SCORE:
  //     case ChatCommandConstants.SCORES:
  //       server.calculateStats(true);
  //       break;
  //     case ChatCommandConstants.RESTART:
  //     case ChatCommandConstants.RESET:
  //     case ChatCommandConstants.WARMUP:
  //       if (isAdmin) {
  //         server.warmup();
  //       }
  //       break;
  //     case ChatCommandConstants.MAPS:
  //     case ChatCommandConstants.MAP:
  //     case ChatCommandConstants.START:
  //     case ChatCommandConstants.MATCH:
  //     case ChatCommandConstants.STARTMATCH:
  //       if (isAdmin || !server.state.live) {
  //         server.start(params);
  //       }
  //       break;
  //     case ChatCommandConstants.FORCE:
  //       if (isAdmin) {
  //         server.ready(null);
  //       }
  //       break;
  //     case ChatCommandConstants.RESUME:
  //     case ChatCommandConstants.READY:
  //     case ChatCommandConstants.RDY:
  //     case ChatCommandConstants.GABEN:
  //     case ChatCommandConstants.R:
  //     case ChatCommandConstants.UNPAUSE:
  //       server.ready(userTeam);
  //       break;
  //     case ChatCommandConstants.PAUSE:
  //       server.pause();
  //       break;
  //     case ChatCommandConstants.STAY:
  //       server.stay(userTeam);
  //       break;
  //     case ChatCommandConstants.SWAP:
  //     case ChatCommandConstants.SWITCH:
  //       server.swap(userTeam);
  //       break;
  //     case ChatCommandConstants.KNIFE:
  //       if (isAdmin) {
  //         server.knife();
  //       }
  //       break;
  //     case ChatCommandConstants.RECORD:
  //       if (isAdmin) {
  //         server.record();
  //       }
  //       break;
  //     case ChatCommandConstants.OT:
  //     case ChatCommandConstants.OVERTIME:
  //       if (isAdmin) {
  //         server.overtime();
  //       }
  //       break;
  //     case ChatCommandConstants.FULLMAP:
  //       if (isAdmin) {
  //         server.fullmap();
  //       }
  //       break;
  //     case ChatCommandConstants.SETTINGS:
  //       server.settings();
  //       break;
  //     case ChatCommandConstants.DISCONNECT:
  //     case ChatCommandConstants.QUIT:
  //     case ChatCommandConstants.LEAVE:
  //       if (isAdmin) {
  //         server.quit();
  //         this.serverHandler.removeServer(server);
  //         Logger.log(server.getIpAndPort() + ' - Disconnected by admin.');
  //       }
  //       break;
  //     case ChatCommandConstants.SAY:
  //       if (isAdmin) {
  //         server.say(params.join(' '));
  //       }
  //       break;
  //     case ChatCommandConstants.DEBUG:
  //       server.debug();
  //       break;
  //     default:
  //   }
  //   server.updateLastLog();
  // }
}
