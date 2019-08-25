import getPublicIP from 'public-ip';
import ip from 'ip';
import id64 from './utils/steam-id-64';
import Server from './classes/Server';
import SocketHandler from './classes/SocketHandler';
import Logger from './utils/logger';
import ServerHandler from './classes/ServerHandler';
import { IConfig } from './types/types';
import { RemoteInfo } from 'dgram';

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
  const socketHandler = new SocketHandler(socketPort);

  socketHandler.addSocketMessageCallback((msg: Buffer, info: RemoteInfo) => {
    const addr = `${info.address}:${info.port}`;
    const server = serverHandler.getServer(addr);

    if (!server) {
      Logger.warning(
        'Received a socket message for a server that is not in memory',
        {
          addr,
          msg
        }
      );
      return;
    }

    Logger.verbose('Socket message received from serverId', server.serverId);
    server.handleSocketMessage(msg.toString());
  });

  const serverInstances = serverConfigs.map(serverConfig => {
    const server = new Server(serverConfig, defaults, gameConfigs)
      .setAdmins(admins.map(id64))
      .whitelistSocket(socketIp, socketPort);

    socketHandler.init(server.ip, server.port);
    server.startServer();

    return server;
  });
  serverHandler.addServers(serverInstances);
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
