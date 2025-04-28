#!/usr/bin/env node

const cookies = process.env.COOKIE.split('\n').map(s => s.trim());
const gamesList = process.env.GAMES.split('\n').map(s => s.trim());
const discordWebhook = process.env.DISCORD_WEBHOOK;
const discordUser = process.env.DISCORD_USER;
const msgDelimiter = ':';
const messages = [];
const endpoints = {
  zzz: 'https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/sign?act_id=e202406031448091',
  gi:  'https://sg-hk4e-api.hoyolab.com/event/sol/sign?act_id=e202102251931481',
  hsr: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202303301540311',
  hi3: 'https://sg-public-api.hoyolab.com/event/mani/sign?act_id=e202110291205111',
  tot: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202202281857121',
};

let hasErrors = false;
let latestGames = [];
const accountGamesCheckedIn = {}; // Tracks successful games per account

function formatGameList(games) {
  if (games.length === 1) return games[0];
  if (games.length === 2) return `${games[0]} and ${games[1]}`;
  return `${games.slice(0, -1).join(', ')}, and ${games.slice(-1)}`;
}

async function run(cookie, games, accountIndex) {
  if (!games) {
    games = latestGames;
  } else {
    games = games.split(' ');
    latestGames = games;
  }

  accountGamesCheckedIn[accountIndex] = [];

  for (let game of games) {
    game = game.toLowerCase();

    log('debug', `\n----- CHECKING IN FOR ${game} -----`);

    if (!(game in endpoints)) {
      log('error', `Game ${game} is invalid. Available games are: zzz, gi, hsr, hi3, and tot`);
      continue;
    }

    const endpoint = endpoints[game];
    const url = new URL(endpoint);
    const actId = url.searchParams.get('act_id');

    url.searchParams.set('lang', 'en-us');

    const body = JSON.stringify({ lang: 'en-us', act_id: actId });
    const headers = new Headers();

    headers.set('accept', 'application/json, text/plain, */*');
    headers.set('accept-encoding', 'gzip, deflate, br, zstd');
    headers.set('accept-language', 'en-US,en;q=0.6');
    headers.set('connection', 'keep-alive');
    headers.set('origin', 'https://act.hoyolab.com');
    headers.set('referrer', 'https://act.hoyolab.com');
    headers.set('content-type', 'application/json;charset=UTF-8');
    headers.set('cookie', cookie);
    headers.set('sec-ch-ua', '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"Linux"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fech-mode', 'cors');
    headers.set('sec-fetch-site', 'same-site');
    headers.set('sec-gpc', '1');
    headers.set("x-rpc-signgame", game);
    headers.set('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

    const res = await fetch(url, { method: 'POST', headers, body });
    const json = await res.json();
    const code = String(json.retcode);
    const successCodes = {
      '0': 'Successfully checked in!',
      '-5003': 'Already checked in for today',
    };

    if (code in successCodes) {
      log('info', game, `${successCodes[code]}`);
      accountGamesCheckedIn[accountIndex].push(formatGameName(game)); // Track
      continue;
    }

    const errorCodes = {
      '-100': 'Error not logged in. Your cookie is invalid, try setting up again',
      '-10002': 'Error not found. You haven\'t played this game',
    };

    log('debug', game, `Headers`, Object.fromEntries(res.headers));
    log('debug', game, `Response`, json);

    if (code in errorCodes) {
      log('error', game, `${errorCodes[code]}`);
      continue;
    }

    log('error', game, `Error undocumented, report to Issues page if this persists`);
  }
}

function formatGameName(code) {
  switch (code) {
    case 'zzz': return 'Zenless Zone Zero';
    case 'gi':  return 'Genshin Impact';
    case 'hsr': return 'Honkai: Star Rail';
    case 'hi3': return 'Honkai Impact 3rd';
    case 'tot': return 'Tears of Themis';
    default: return code.toUpperCase();
  }
}

function log(type, ...data) {
  console[type](...data);

  switch (type) {
    case 'debug': return;
    case 'error': hasErrors = true;
  }

  if (data[0] in endpoints) {
    data[0] = data[0].toUpperCase() + msgDelimiter;
  }

  const string = data
    .map(value => typeof value === 'object' ? JSON.stringify(value, null, 2).replace(/^"|"$/, '') : value)
    .join(' ');

  messages.push({ type, string });
}

async function discordWebhookSend() {
  log('debug', '\n----- DISCORD WEBHOOK -----');

  if (!discordWebhook.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is not a valid Discord webhook URL.');
    return;
  }

  let discordMsg = discordUser ? `<@${discordUser}>\n` : '';

  for (const accountIndex in accountGamesCheckedIn) {
    const games = accountGamesCheckedIn[accountIndex];
    if (games.length > 0) {
      discordMsg += `I checked your ${parseInt(accountIndex) + 1}${ordinalSuffix(parseInt(accountIndex) + 1)} account. `;
      discordMsg += `I did dailies in ${formatGameList(games)}. You're welcome...\n\n`;
    }
  }

  discordMsg += messages.map(msg => `(${msg.type.toUpperCase()}) ${msg.string}`).join('\n');

  const res = await fetch(discordWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: discordMsg }),
  });

  if (res.status === 204) {
    log('info', 'Successfully sent message to Discord webhook!');
    return;
  }

  log('error', 'Error sending message to Discord webhook, please check URL and permissions');
}

function ordinalSuffix(i) {
  const j = i % 10, k = i % 100;
  if (j == 1 && k != 11) return 'st';
  if (j == 2 && k != 12) return 'nd';
  if (j == 3 && k != 13) return 'rd';
  return 'th';
}

if (!cookies || !cookies.length) throw new Error('COOKIE environment variable not set!');
if (!gamesList || !gamesList.length) throw new Error('GAMES environment variable not set!');

for (const index in cookies) {
  log('info', `-- CHECKING IN FOR ACCOUNT ${Number(index) + 1} --`);
  await run(cookies[index], gamesList[index], index);
}

if (discordWebhook && URL.canParse(discordWebhook)) {
  await discordWebhookSend();
}

if (hasErrors) {
  console.log('');
  throw new Error('Error(s) occurred.');
}
