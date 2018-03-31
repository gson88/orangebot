class ServerHandler {
  constructor () {
    this.servers = { };
    setInterval(this.tickCommandQueue.bind(this), 100);
    // setInterval(this.tickSomethingElse.bind(this), 30000);
  }
  
  addServer (server) {
    this.servers[server.getIpAndPort()] = server;
  }
  
  removeServer (server) {
    delete this.servers[server.getIpAndPort()];
  }
  
  getServer (ipAndPort) {
    if (typeof this.servers[ipAndPort] !== 'undefined') {
      return this.servers[ipAndPort];
    }
    
    return null;
  }
  
  tickCommandQueue() {
    for (let i in this.servers) {
      if (this.servers[i].commandQueue.length > 0) {
        const cmd = this.servers[i].commandQueue.shift();
        this.servers[i].execRconCommand(cmd);
      }
    }
  }
  
  tickSomethingElse () {
    // for (let i in this.servers) {
    //   if (!this.servers.hasOwnProperty(i)) {
    //     return;
    //   }
    //
    //   const theServer = this.servers[i];
    //
    //   const now = Date.now();
    //   if (theServer.lastlog < (now - 1000 * 60 * 10) && theServer.state.players.length < 3) {
    //     console.log('Dropping idle server ' + i);
    //     this.removeServer(theServer);
    //     continue;
    //   }
    //
    //   if (!theServer.state.live) {
    //     if (theServer.state.knife) {
    //       theServer.rcon(messages.WARMUP_KNIFE);
    //       if (config.ready_time) {
    //         theServer.rcon(messages.WARMUP_TIME.format(config.ready_time));
    //       }
    //     } else if (theServer.state.maps.length) {
    //       theServer.rcon(messages.WARMUP);
    //       if (config.ready_time) {
    //         theServer.rcon(messages.WARMUP_TIME.format(config.ready_time));
    //       }
    //     } else {
    //       theServer.rcon(messages.WELCOME);
    //     }
    //   } else if (theServer.state.paused && theServer.state.freeze) {
    //     //theServer.matchPause();
    //   }
    // }
  }
}

module.exports = ServerHandler;