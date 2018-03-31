const getPublicIP = require('public-ip');
const id64 = require('./utils/steam-id-64');
const localIp = require('ip').address();
const Server = require('./classes/Server');
const ServerHandler = require('./classes/ServerHandler');
const SocketHandler = require('./classes/SocketHandler');
const Logger = require('./utils/logger');

/**
 * @param {{ servers, admins, defaults, gameConfigs, socketPort, admins, serverType }} config
 */
const run = async config => {
  const { servers, defaults, gameConfigs, admins, socketPort, serverType } = config;
  const socketIp = serverType === 'local' ? localIp : await getPublicIP.v4();
  
  const serverHandler = new ServerHandler();
  const server =
    new Server(servers[0], defaults, gameConfigs)
      .setAdmins(admins.map(id64));
  
  serverHandler.addServer(server);
  server.startServer(socketIp, socketPort);
  new SocketHandler(socketPort, serverHandler);
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
    Logger.log('Exiting with code 1.');
    process.exit(1);
  }
  
  Logger.error('Uncaught exception');
  Logger.error(err);
  process.exit(1);
});

module.exports = { run };