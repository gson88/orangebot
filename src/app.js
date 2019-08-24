"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
exports.__esModule = true;
var getPublicIP = require('public-ip');
var localIp = require('ip').address();
var id64 = require('./utils/steam-id-64');
var Server = require('./classes/Server');
var ServerHandler = require('./classes/ServerHandler');
var SocketHandler = require('./classes/SocketHandler');
var Logger = require('./utils/logger');
/**
 * @param {{ servers, admins, defaults, gameConfigs, socketPort, admins, serverType }} config
 */
var run = function (config) { return __awaiter(_this, void 0, void 0, function () {
    var servers, defaults, gameConfigs, admins, socketPort, serverType, socketIp, _a, serverHandler, socket;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                servers = config.servers, defaults = config.defaults, gameConfigs = config.gameConfigs, admins = config.admins, socketPort = config.socketPort, serverType = config.serverType;
                if (!(serverType === 'local')) return [3 /*break*/, 1];
                _a = localIp;
                return [3 /*break*/, 3];
            case 1: return [4 /*yield*/, getPublicIP.v4()];
            case 2:
                _a = _b.sent();
                _b.label = 3;
            case 3:
                socketIp = _a;
                serverHandler = new ServerHandler();
                socket = new SocketHandler(socketPort, serverHandler);
                serverHandler.addServers(servers.map(function (_server) {
                    var server = new Server(_server, defaults, gameConfigs)
                        .setAdmins(admins.map(id64))
                        .whitelistSocket(socketIp, socketPort)
                        .startServer();
                    socket.init(server.port, server.ip);
                    return server;
                }));
                return [2 /*return*/];
        }
    });
}); };
process.on('unhandledRejection', function (err) {
    Logger.error('Uncaught promise rejection');
    Logger.error(err);
    process.exit(1);
});
process.on('uncaughtException', function (err) {
    if (err.code === 'EADDRINUSE') {
        Logger.error('Could not bind UDP Socket to port', err.port);
        Logger.error('Maybe try to use another port?');
        process.exit(1);
    }
    Logger.error('Uncaught exception');
    Logger.error(err);
    process.exit(1);
});
exports["default"] = { run: run };
