export default class Player {
  steamid: string;
  team: string;
  name: string;
  clantag: string;

  constructor(steamid: string, team: string, name: string, clantag: string) {
    this.steamid = steamid;
    this.team = team;
    this.name = name;
    this.clantag = clantag;
  }
}
