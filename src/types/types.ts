export interface IConfig {
  servers: IServer[];
  gameConfigs: IGameConfigs;
  defaults: IDefaultConfig;
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

export interface IDefaultConfig {
  record: boolean;
  knife: boolean;
  ot: boolean;
  fullmap: boolean;
  pause_time: number;
  ready_time: number;
}
