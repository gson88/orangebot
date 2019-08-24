export default {
  WELCOME:
    "say \x10Hi! I'm OrangeBot v3.0.;say \x10Start a match with \x06!start map \x08map map",
  WARMUP: 'say \x10Match will start when both teams are \x06!ready\x10',
  WARMUP_KNIFE:
    'say \x10Knife round will start when both teams are \x06!ready\x10',
  WARMUP_TIME: 'say \x10or after a maximum of \x06{0}\x10 seconds.',
  WARMUP_TIMEOUT: 'say \x10Starting round in \x0620\x10 seconds.',
  KNIFE_DISABLED: 'say \x10Cancelled knife round.',
  KNIFE_STARTING:
    'mp_unpause_match;mp_warmup_pausetimer 0;mp_warmuptime 5;mp_warmup_start; say \x10Both teams are \x06!ready\x10, starting knife round in:;say \x085...',
  KNIFE_STARTED: 'say \x10Knife round started! GL HF!',
  KNIFE_WON:
    'mp_pause_match;mp_t_default_secondary "weapon_glock";mp_ct_default_secondary "weapon_hkp2000";mp_free_armor 0;mp_give_player_c4 1;say \x06{0} \x10won the knife round!;say \x10Do you want to \x06!stay\x10 or \x06!swap\x10?',
  KNIFE_STAY: 'mp_unpause_match',
  KNIFE_SWAP: 'mp_unpause_match;mp_swapteams',
  PAUSE_ENABLED: 'mp_pause_match;say \x10Pausing match on freeze time!',
  PAUSE_MISSING: 'say \x10All your pauses have been used up already',
  PAUSE_REMAINING: 'say \x10Pauses remaining: \x06{0}\x10 of \x06{1}',
  PAUSE_TIMEOUT: 'say \x10Continuing in \x0620 seconds',
  PAUSE_TIME: 'say \x10Pause will automatically end in \x06{0} seconds',
  PAUSE_ALREADY: 'say \x10A pause was already called.',
  MATCH_STARTING:
    'mp_unpause_match;mp_warmup_pausetimer 0;mp_warmuptime 0;mp_warmup_end;log on;say \x10Both teams are \x06!ready.',
  MATCH_STARTED: 'say \x10Match started! GL HF!',
  MATCH_PAUSED: 'say \x10Match will resume when both teams are \x06!ready\x10.',
  MATCH_UNPAUSE:
    'mp_unpause_match;say \x10Both teams are \x06!ready\x10, resuming match!',
  ROUND_STARTED: 'mp_respawn_on_death_t 0;mp_respawn_on_death_ct 0',
  READY: 'say \x10{0} are \x06!ready\x10, waiting for {1}.',
  LIVE: 'say \x03LIVE!;say \x0eLIVE!;say \x02LIVE!',
  T: 'Terrorists',
  CT: 'Counter-Terrorists',
  GOTV_OVERLAY:
    'mp_teammatchstat_txt "Match {0} of {1}"; mp_teammatchstat_1 "{2}"; mp_teammatchstat_2 "{3}"',
  DEMO_REC: 'say \x10Started recording GOTV Demo: \x06{0}',
  DEMO_FINISHED: 'say \x10Finished recording GOTV Demo: \x06{0}',
  DEMO_RECDISABLED: 'say \x10Disabled GOTV Demo recording.',
  DEMO_RECENABLED: 'say \x10Enabled GOTV Demo recording.',
  OT_ENABLED: 'say \x10Enabled Overtime.',
  OT_DISABLED: 'say \x10Disabled Overtime.',
  FM_ENABLED: 'say \x10Map will be fully played out.',
  FM_DISABLED: 'say \x10Map will not be played out.',
  SETTINGS: 'say \x10Match Settings:',
  SETTINGS_KNIFE: 'say \x10Knife: \x06{0}',
  SETTINGS_RECORDING: 'say \x10GOTV Demo recording: \x06{0}',
  SETTINGS_OT: 'say \x10Overtime: \x06{0}',
  SETTINGS_FULLMAP: 'say \x10Full Map: \x06{0}',
  SETTINGS_MAPS: 'say \x10Maps: \x06{0}',
  MAP_FINISHED: 'say \x10Map finished! \x06GG',
  MAP_CHANGE: 'say \x10Changing map in 20 seconds to: \x06{0}',
  CHANGE_MAP: 'changelevel ${0}',
  SERIES_FINISHED: 'say \x10Finished the series!',
  RESTORE_ROUND:
    'mp_backup_restore_load_file "{0}",say \x10Round \x06{1}\x10 has been restored, resuming match in:,say \x085...',
  SAY: 'say {0}'
};
