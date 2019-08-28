import dgram, { RemoteInfo, Socket } from 'dgram';
import Logger from '../utils/logger';
import * as cleanup from '../utils/node-cleanup';

export default class SocketHandler {
  private socket: Socket = dgram.createSocket('udp4');
  private onSocketMessageCallbacks: Function[] = [];

  constructor(socketPort: number, onSocketMessageCallback?: Function) {
    this.socket.bind(socketPort);
    this.subscribeToSocketEvents();

    cleanup.Cleanup(() => {
      if (this.socket) {
        Logger.log('Closing socket');
        this.socket.close();
      }
    });

    if (onSocketMessageCallback) {
      this.addSocketMessageCallback(onSocketMessageCallback);
    }

    return this;
  }

  addSocketMessageCallback = (cb: Function) => {
    this.onSocketMessageCallbacks.push(cb);
    return this;
  };

  init(ip: string, port: number) {
    Logger.log('socketHandler.init', `${ip}:${port}`);
    this.socket.send('INIT', port, ip); // SRCDS won't send data if it doesn't get contacted initially
  }

  onMessage = (msg: Buffer, info: RemoteInfo) => {
    this.onSocketMessageCallbacks.map(cb => {
      cb(msg, info);
    });
  };

  subscribeToSocketEvents() {
    this.socket
      .on('message', this.onMessage)
      .on('listening', () => {
        const address = this.socket.address();
        if (typeof address !== 'string') {
          Logger.log('Socket listening', `${address.address}:${address.port}`);
        } else {
          Logger.log('Socket listening', address);
        }
      })
      .on('close', () => {
        Logger.warning('The socket connection was closed');
      })
      .on('error', err => {
        Logger.error('Socket error');
        Logger.error(err);
      });
  }
}
