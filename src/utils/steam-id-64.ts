import SteamID from 'steamid';

export default (steamid: string): string => {
  return new SteamID(steamid).getSteamID64();
};
