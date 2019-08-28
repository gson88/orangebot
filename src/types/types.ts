export interface IConfig {
  servers: IServerConfig[];
  gameConfigs: IGameConfigs;
  defaults: IDefaultConfig;
  admins: string[];
  socketPort: number;
  serverType: 'local' | 'external';
}

export interface IServerConfig {
  host: string;
  port: number;
  rconpass: string;
}

export interface IGameConfigs {
  [configName: string]: string;
}

export interface IDefaultConfig {
  record: boolean;
  knife: boolean;
  ot: boolean;
  fullmap: boolean;
  pause_time: number;
  ready_time: number;
}

export interface NamedRegexMatches {
  capture: (name: string) => string;
}
