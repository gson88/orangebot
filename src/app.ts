import getPublicIP from 'public-ip';
import ip from 'ip';
import id64 from './utils/steam-id-64';
import Server from './classes/Server';
import SocketHandler from './classes/SocketHandler';
import Logger from './utils/logger';
import ServerHandler from './classes/ServerHandler';
import { IConfig } from './types/types';

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
  const socketIp =
    serverType === 'local' ? ip.address() : await getPublicIP.v4();

  const serverHandler = new ServerHandler();
  const socketHandler = new SocketHandler(socketPort, serverHandler);

  serverHandler.addServers(
    servers.map(_server => {
      const server = new Server(_server, defaults, gameConfigs)
        .setAdmins(admins.map(id64))
        .whitelistSocket(socketIp, socketPort)
        .startServer();

      SocketHandler.init(server.port, server.ip);
      return server;
    })
  );
};

process.on('unhandledRejection', (err: any) => {
  Logger.error('Unhandled promise rejection');
  Logger.error(err);
  process.exit(1);
});

process.on('uncaughtException', (err: any) => {
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
