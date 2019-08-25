import getPublicIP from 'public-ip';
import ip from 'ip';
import id64 from './utils/steam-id-64';
import Server from './classes/Server';
import SocketHandler from './classes/SocketHandler';
import Logger from './utils/logger';
import ServerHandler from './classes/ServerHandler';
import { IConfig, IGameConfigs } from './types/types';
import { RemoteInfo } from 'dgram';
import { resolve } from 'path';

const prependPathToConfigFiles = (gameConfigs: IGameConfigs): IGameConfigs => {
  return Object.entries(gameConfigs).reduce((acc, [key, value]) => {
    acc[key] = resolve(process.cwd(), 'cfg', value);
    return acc;
  }, {});
};

const run = async (config: IConfig) => {
  const {
    servers: serverConfigs,
    defaults,
    gameConfigs,
    admins,
    socketPort,
    serverType
  } = config;

  const socketIp =
    serverType === 'local' ? ip.address() : await getPublicIP.v4();

  const serverHandler = new ServerHandler();
  const socketHandler = new SocketHandler(
    socketPort,
    (msg: Buffer, info: RemoteInfo) => {
      if (msg.toString().includes('rcon from')) {
        return;
      }

      Logger.verbose('onSocketMessage', { msg, info });

      const addr = `${info.address}:${info.port}`;
      const server = serverHandler.getServerWithIpAndPort(addr);

      if (!server) {
        Logger.warning(
          'Received a socket message for a server that is not in memory',
          { addr, msg: msg.toString() }
        );
        return;
      }

      Logger.verbose('Socket message received for serverId', server.serverId);
      server.onSocketMessage(msg.toString());
    }
  );

  const fixedGameConfigs = prependPathToConfigFiles(gameConfigs);

  serverHandler.addServers(
    serverConfigs.map(serverConfig => {
      const server = new Server(serverConfig, defaults, fixedGameConfigs)
        .setAdmins(admins.map(id64))
        .whitelistSocket(socketIp, socketPort);

      socketHandler.init(serverConfig.host, serverConfig.port);
      server.startServer();

      return server;
    })
  );
};

process.on('unhandledRejection', (err: any) => {
  Logger.error('Unhandled promise rejection');
  Logger.error(err);
  process.exit(0);
});

process.on('uncaughtException', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    Logger.error('Could not bind UDP Socket to port', err.port);
    Logger.error('Maybe try to use another port?');
    process.exit(1);
  }

  Logger.error('Uncaught exception');
  Logger.log(err);

  process.exit(0);
});

export default { run };
