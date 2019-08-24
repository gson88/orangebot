"use strict";
exports.__esModule = true;
var steamid_1 = require("steamid");
var g = '';
g = 123;
exports["default"] = (function (steamid) {
    return new steamid_1["default"](String(steamid)).getSteamID64();
});
