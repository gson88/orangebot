import Server from './Server';

export default class ServerHandler {
  servers: {
    [key: string]: Server;
  } = {};

  constructor() {
    setInterval(this.tickCommandQueue, 100);
  }

  addServer = (server: Server) => {
    this.servers[server.getIpAndPort()] = server;
  };

  addServers = (servers: Server[]) => {
    servers.forEach(this.addServer);
  };

  removeServer = (server: Server) => {
    delete this.servers[server.getIpAndPort()];
  };

  getServer = (ipAndPort: string) => {
    return typeof this.servers[ipAndPort] !== 'undefined'
      ? this.servers[ipAndPort]
      : null;
  };

  tickCommandQueue = () => {
    Object.values(this.servers)
      .filter(server => server.commandQueue.length > 0)
      .forEach(server => {
        server.execRconCommand(server.commandQueue.shift());
      });
  };
}
