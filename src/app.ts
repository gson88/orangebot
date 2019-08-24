import { IConfig } from './types/types';

const getPublicIP = require('public-ip');
const localIp = require('ip').address();
const id64 = require('./utils/steam-id-64');
const Server = require('./classes/Server');
const SocketHandler = require('./classes/SocketHandler');
const Logger = require('./utils/logger');
import ServerHandler from './classes/ServerHandler';

/**
 * @param {{ servers, admins, defaults, gameConfigs, socketPort, admins, serverType }} config
 */
const run = async (config: IConfig) => {
  const {
    servers,
    defaults,
    gameConfigs,
    admins,
    socketPort,
    serverType
  } = config;
  const socketIp = serverType === 'local' ? localIp : await getPublicIP.v4();

  const serverHandler = new ServerHandler();
  const socket = new SocketHandler(socketPort, serverHandler);

  serverHandler.addServers(
    servers.map(_server => {
      const server = new Server(_server, defaults, gameConfigs)
        .setAdmins(admins.map(id64))
        .whitelistSocket(socketIp, socketPort)
        .startServer();

      socket.init(server.port, server.ip);
      return server;
    })
  );
};

process.on('unhandledRejection', err => {
  Logger.error('Uncaught promise rejection');
  Logger.error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  if (err.code === 'EADDRINUSE') {
    Logger.error('Could not bind UDP Socket to port', err.port);
    Logger.error('Maybe try to use another port?');
    process.exit(1);
  }

  Logger.error('Uncaught exception');
  Logger.error(err);
  process.exit(1);
});

export default { run };
