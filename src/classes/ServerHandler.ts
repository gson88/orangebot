import Server from './Server';

export default class ServerHandler {
  servers: { [ipAndPort: string]: Server } = {};

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
    //Todo: Prevent memory leaks
    delete this.servers[server.getIpAndPort()];
  };

  getServerWithIpAndPort = (ipAndPort: string): Server | undefined => {
    return this.servers[ipAndPort];
  };

  tickCommandQueue = () => {
    Object.values(this.servers)
      .filter(server => server.commandQueue.length > 0)
      .forEach(async server => {
        await server.execRconCommand(server.commandQueue.shift());
      });
  };
}
