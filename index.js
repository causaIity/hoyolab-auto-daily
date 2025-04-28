const fullGameNames = {
  zzz: 'Zenless Zone Zero',
  gi:  'Genshin Impact',
  hsr: 'Honkai: Star Rail',
  hi3: 'Honkai Impact 3rd',
  tot: 'Tears of Themis',
}

let accountResults = [];

function formatListForSentence(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

// updated run() function
async function run(cookie, games, accountNumber) {
  const result = {
    accountNumber,
    alreadyDone: [],
    didToday: [],
    errors: []
  };

  if (!games) {
    games = latestGames;
  } else {
    games = games.split(' ');
    latestGames = games;
  }

  for (let game of games) {
    game = game.toLowerCase();

    log('debug', `\n----- CHECKING IN FOR ${game} -----`);

    if (!(game in endpoints)) {
      log('error', `Game ${game} is invalid.`);
      continue;
    }

    const endpoint = endpoints[game];
    const url = new URL(endpoint);
    const actId = url.searchParams.get('act_id');

    url.searchParams.set('lang', 'en-us');

    const body = JSON.stringify({
      lang: 'en-us',
      act_id: actId
    });

    const headers = new Headers();
    headers.set('accept', 'application/json, text/plain, */*');
    headers.set('accept-encoding', 'gzip, deflate, br, zstd');
    headers.set('accept-language', 'en-US,en;q=0.6');
    headers.set('connection', 'keep-alive');
    headers.set('origin', 'https://act.hoyolab.com');
    headers.set('referer', 'https://act.hoyolab.com');
    headers.set('content-type', 'application/json;charset=UTF-8'); // fixed typo
    headers.set('cookie', cookie);
    headers.set('sec-ch-ua', '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"Linux"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-site');
    headers.set('sec-gpc', '1');
    headers.set('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    headers.set("x-rpc-signgame", game);

    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      const json = await res.json();
      const code = String(json.retcode);

      if (code === '0') {
        log('info', game, 'Successfully checked in!');
        result.didToday.push(fullGameNames[game]);
      } else if (code === '-5003') {
        log('info', game, 'Already checked in for today');
        result.alreadyDone.push(fullGameNames[game]);
      } else if (code === '-100') {
        log('error', game, 'Error not logged in. Cookie invalid.');
        result.errors.push(fullGameNames[game]);
      } else if (code === '-10002') {
        log('error', game, 'Error: you have not played this game.');
        result.errors.push(fullGameNames[game]);
      } else {
        log('error', game, 'Undocumented error occurred.');
        result.errors.push(fullGameNames[game]);
      }
    } catch (error) {
      log('error', game, 'Network error during fetch.');
      result.errors.push(fullGameNames[game]);
    }
  }

  accountResults.push(result);
}

// updated log() function (minor, clean)
function log(type, ...data) {
  if (type !== 'debug') {
    console[type](...data);
  }
  if (type === 'error') {
    hasErrors = true;
  }
}

// updated discordWebhookSend() function
async function discordWebhookSend() {
  log('debug', '\n----- DISCORD WEBHOOK -----');

  if (!discordWebhook.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is invalid.');
    return;
  }

  let discordMsg = "";

  if (discordUser) {
    discordMsg += `<@${discordUser}> `;
  }

  for (const result of accountResults) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = result.accountNumber % 100;
    const suffix = (v > 10 && v < 20) ? 'th' : (suffixes[v % 10] || 'th');

    if (result.errors.length > 0) {
      discordMsg += `Give me another cookie for ${formatListForSentence(result.errors)}...\n`;
    } else {
      let message = `I checked your ${result.accountNumber}${suffix} account. `;

      if (result.alreadyDone.length) {
        message += `Your dailies were already completed in ${formatListForSentence(result.alreadyDone)}`;
      }
      if (result.didToday.length) {
        if (result.alreadyDone.length) {
          message += `, but I did them in ${formatListForSentence(result.didToday)}`;
        } else {
          message += `I did them in ${formatListForSentence(result.didToday)}`;
        }
      }
      message += `. You're welcome...\n`;
      discordMsg += message;
    }
  }

  const res = await fetch(discordWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: discordMsg })
  });

  if (res.status === 204) {
    log('info', 'Successfully sent message to Discord!');
    return;
  }

  log('error', 'Error sending Discord message.');
}

