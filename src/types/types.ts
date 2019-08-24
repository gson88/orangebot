export interface IConfig {
  servers: IServer[];
  defaults: string[];
  gameConfigs: IGameConfigs;
  admins: string[];
  socketPort: number;
  serverType: 'local' | 'external';
}

export interface IServer {
  host: string;
  port: number;
  rconpass: string;
}

export interface IGameConfigs {
  [key: string]: string;
}
