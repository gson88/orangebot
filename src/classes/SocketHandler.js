var dgram = require('dgram');
var socket = dgram.createSocket('udp4');
var named = require('named-regexp').named;
var ChatCommandConstants = require('../constants/chat-commands').ChatCommandConstants;
var Teams = require('../constants/teams');
var Logger = require('../utils/logger');
var cleanup = require('../utils/node-cleanup');
var SocketHandler = /** @class */ (function () {
    function SocketHandler(socketPort, serverHandler) {
        this.serverHandler = serverHandler;
        socket.bind(socketPort);
        this.subscribeToEvents();
        cleanup.Cleanup(function () {
            if (socket) {
                Logger.log('Closing socket');
                socket.close();
            }
        });
        return this;
    }
    SocketHandler.prototype.init = function (port, ip) {
        socket.send('INIT', port, ip); // SRCDS won't send data if it doesn't get contacted initially
    };
    SocketHandler.prototype.subscribeToEvents = function () {
        var _this = this;
        socket
            .on('message', function (msg, info) {
            var addr = info.address + ":" + info.port;
            var text = msg.toString();
            var server = _this.serverHandler.getServer(addr);
            if (server === null) {
                Logger.warning('Received a socket message for a server that is not in memory', addr);
                return;
            }
            Logger.verbose('Socket message received from serverId', server.serverId);
            _this.handleTeamJoin(text, server);
            _this.handleClantag(text, server);
            _this.handlePlayerDisconnect(text, server);
            _this.handleMapLoading(text, server);
            _this.handleMapLoaded(text, server);
            _this.handleRoundStart(text, server);
            _this.handleRoundEnd(text, server);
            _this.handleGameOver(text, server);
            _this.handleCommand(text, server);
        })
            .on('listening', function () {
            var address = socket.address();
            Logger.log('Socket listening', address.address + ":" + address.port);
        })
            .on('close', function () {
            Logger.warning('The socket connection was closed');
        })
            .on('error', function (err) {
            Logger.error('Socket error');
            Logger.error(err);
        });
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleTeamJoin = function (text, server) {
        var regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>]" switched from team [<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>] to [<](:<new_team>CT|TERRORIST|Unassigned|Spectator)[>]/);
        var match = regex.exec(text);
        if (match) {
            var steamId = match.capture('steam_id');
            var player = server.state.getPlayer(steamId);
            if (!player) {
                if (match.capture('steam_id') !== 'BOT') {
                    server.state.addPlayer(steamId, match.capture('new_team'), match.capture('user_name'));
                }
            }
            else {
                player.steamid = steamId;
                player.team = match.capture('new_team');
                player.name = match.capture('user_name');
            }
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleClantag = function (text, server) {
        var regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*?)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" triggered "clantag" \(value "(:<clan_tag>.*)"\)/);
        var match = regex.exec(text);
        if (match) {
            var steamId = match.capture('steam_id');
            var player = server.state.getPlayer(steamId);
            if (!player) {
                if (match.capture('steam_id') !== 'BOT') {
                    server.state.addPlayer(steamId, match.capture('user_team'), match.capture('user_name'), match.capture('clan_tag'));
                }
            }
            else {
                player.clantag =
                    match.capture('clan_tag') !== ''
                        ? match.capture('clan_tag')
                        : undefined;
            }
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handlePlayerDisconnect = function (text, server) {
        // player disconnect
        var regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator)[>]" disconnected/);
        var match = regex.exec(text);
        if (match) {
            var steamId = match.capture('steam_id');
            server.state.deletePlayer(steamId);
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleMapLoading = function (text, server) {
        // map loading
        var regex = named(/Loading map "(:<map>.*?)"/);
        var match = regex.exec(text);
        if (match) {
            server.state.clearPlayers();
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleMapLoaded = function (text, server) {
        // map started
        var regex = named(/Started map "(:<map>.*?)"/);
        var match = regex.exec(text);
        if (match) {
            server.newmap(match.capture('map'));
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleRoundStart = function (text, server) {
        // round start
        var regex = named(/World triggered "Round_Start"/);
        var match = regex.exec(text);
        if (match) {
            server.round();
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleRoundEnd = function (text, server) {
        var _a;
        // round end
        var regex = named(/Team "(:<team>.*)" triggered "SFUI_Notice_(:<team_win>Terrorists_Win|CTs_Win|Target_Bombed|Target_Saved|Bomb_Defused)" \(CT "(:<ct_score>\d+)"\) \(T "(:<t_score>\d+)"\)/);
        var match = regex.exec(text);
        if (match) {
            var score = (_a = {},
                _a[Teams.TERRORIST] = parseInt(match.capture('t_score')),
                _a[Teams.CT] = parseInt(match.capture('ct_score')),
                _a);
            server.score(score);
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleGameOver = function (text, server) {
        var regex = named(/Game Over: competitive/);
        var match = regex.exec(text);
        if (match) {
            server.mapend();
            server.updateLastLog();
        }
    };
    /**
     * @param text
     * @param {Server} server
     */
    SocketHandler.prototype.handleCommand = function (text, server) {
        // !command
        var regex = named(/"(:<user_name>.+)[<](:<user_id>\d+)[>][<](:<steam_id>.*)[>][<](:<user_team>CT|TERRORIST|Unassigned|Spectator|Console)[>]" say(:<say_team>_team)? "[!.](:<text>.*)"/);
        var match = regex.exec(text);
        if (match) {
            var isAdmin = match.capture('user_id') === '0' ||
                server.isAdmin(match.capture('steam_id'));
            var params = match.capture('text').split(' ');
            var userTeam = match.capture('user_team');
            var cmd = params[0];
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
    };
    return SocketHandler;
}());
module.exports = SocketHandler;
