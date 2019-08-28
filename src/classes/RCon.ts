import RC from 'simple-rcon';
import Logger from '../utils/logger';

export default class RCon {
  private rconPromise: Promise<any>;
  private rconConnection: any;
  private host: string;
  private port: number;
  private rconpass: string;

  constructor(host, port, rconpass) {
    this.host = host;
    this.port = port;
    this.rconpass = rconpass;
  }

  private async getRconConnection() {
    Logger.log('getRconConnection');

    if (this.rconPromise) {
      Logger.log('Waiting for promise');
      return this.rconPromise;
    }

    if (this.rconConnection) {
      Logger.log('RconConnection instance existed');
      return this.rconConnection;
    }

    await this.createRconConnection();
    return this.rconConnection;
  }

  private async createRconConnection() {
    Logger.verbose('createRconConnection');
    this.rconConnection = new RC({
      host: this.host,
      port: this.port,
      password: this.rconpass,
      connect: true
    })
      .on('error', err => {
        Logger.error('Rcon error');
        throw err;
      })
      .on('disconnected', a => {
        Logger.log('Rcon disconnected', a);
        this.rconConnection = null;
      });

    this.rconPromise = new Promise(resolve => {
      this.rconConnection.on('connected', () => {
        Logger.log('Rcon connected');
        resolve(this.rconConnection);
        this.rconPromise = null;
      });
    });

    return this.rconPromise;
  }

  async execRconCommand(command: string): Promise<any> {
    Logger.log('Preparing to send rcon command');
    const conn = await this.getRconConnection();
    Logger.log('Sending command:', command);

    return new Promise(resolve => {
      conn.exec(command, resp => {
        Logger.log('rcon response', resp.body.split('\n'));
        resolve(resp);
      });
    });
  }
}
