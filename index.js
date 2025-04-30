#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cookies = process.env.COOKIE?.split('\n').map(s => s.trim());
const gamesList = process.env.GAMES?.split('\n').map(s => s.trim());
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

let fatalErrors = false;
let latestGames = [];

// Use counter/counter.json consistently and ensure it's relative to project root
const counterFilePath = path.join(__dirname, 'counter', 'counter.json');

const accountGamesCheckedIn = {};

function getCounter() {
  try {
    if (fs.existsSync(counterFilePath)) {
      const data = fs.readFileSync(counterFilePath, 'utf8');
      const json = JSON.parse(data);
      // Validate structure
      if (json && typeof json.processCounter === 'number') {
        return json.processCounter;
      }
    }
    // Default if file doesn't exist or is invalid
    return 0;
  } catch (error) {
    console.error('Error reading counter file:', error);
    return 0;
  }
}

function setCounter(newCounter) {
  try {
    // Make sure the counter directory exists
    const counterDir = path.dirname(counterFilePath);
    if (!fs.existsSync(counterDir)) {
      fs.mkdirSync(counterDir, { recursive: true });
    }
    
    const data = { 
      processCounter: newCounter,
      lastUpdated: new Date().toISOString()  // Add timestamp for debugging
    };
    fs.writeFileSync(counterFilePath, JSON.stringify(data, null, 2));
    
    // For debugging - print counter value
    console.log(`Updated counter value to: ${newCounter}`);
  } catch (error) {
    console.error('Error writing counter file:', error);
  }
}

function formatGameList(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.slice(-1)}`;
}

async function run(cookie, games, accountIndex) {
  if (!games) {
    games = latestGames;
  } else {
    games = games.split(' ');
    latestGames = games;
  }

  // Initialize for this account
  if (!accountGamesCheckedIn[accountIndex]) {
    accountGamesCheckedIn[accountIndex] = {
      didDailies: [],
      alreadyCheckedIn: [],
      // Store the original index for reference
      originalIndex: parseInt(accountIndex)
    };
  }

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
    const headers = new Headers({
      'accept': 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.6',
      'connection': 'keep-alive',
      'origin': 'https://act.hoyolab.com',
      'referer': 'https://act.hoyolab.com',
      'content-type': 'application/json;charset=UTF-8',
      'cookie': cookie,
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'sec-gpc': '1',
      'x-rpc-signgame': game,
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });

    const res = await fetch(url, { method: 'POST', headers, body });
    const json = await res.json();
    const code = String(json.retcode);

    const successCodes = {
      '0': 'Successfully checked in!',
      '-5003': 'Already checked in for today',
    };

    if (code === '0') {
      log('info', game, successCodes[code]);
      accountGamesCheckedIn[accountIndex].didDailies.push(game);
      continue;
    } else if (code === '-5003') {
      log('info', game, successCodes[code]);
      accountGamesCheckedIn[accountIndex].alreadyCheckedIn.push(game);
      continue;
    }

    const errorCodes = {
      '-100': 'Error not logged in. Your cookie is invalid, try setting up again',
      '-10002': 'Error not found. You haven\'t played this game',
    };

    log('debug', game, `Headers`, Object.fromEntries(res.headers));
    log('debug', game, `Response`, json);

    // Handling known error codes without stopping execution
    if (code in errorCodes) {
      if (code === '-100') { // Invalid cookie, we will log it, but not treat it as fatal
        log('error', game, `${errorCodes[code]}`);
      } else {
        log('error', game, `${errorCodes[code]}`); // For -10002, already checked in, etc.
      }
      continue;
    }

    log('error', game, 'Error undocumented, report to Issues page if this persists');
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

let hasSoftErrors = false;   

function log(type, ...data) {
  console[type](...data);

  switch (type) {
    case 'debug':
      return;
    case 'error':
      hasSoftErrors = true; // Soft errors like "already signed in"
      return;
    case 'fatal':
      return; // No fatal errors will stop execution now
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

  let processCounter = getCounter();  // Load the current counter
  console.log(`Current counter value before increment: ${processCounter}`);

  processCounter++;

  setCounter(processCounter);  // Save the updated counter back to the file

  if (!discordWebhook?.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is not a valid Discord webhook URL.');
    fatalErrors = true;
    return;
  }

  let discordMsg = discordUser ? `<@${discordUser}> Draco has checked your accounts again.. That's ${processCounter} times now...\n\n` : `Draco has checked your accounts again.. That's ${processCounter} times now...\n\n`;

  // Initialize game results structure
  const gameResults = {
    "Honkai: Star Rail": { accounts: {} },
    "Genshin Impact": { accounts: {} },
    "Zenless Zone Zero": { accounts: {} }
  };

  // Collect all accounts with activity in any game
  const accountsWithActivity = new Set();
  for (const accountIndex in accountGamesCheckedIn) {
    const accountData = accountGamesCheckedIn[accountIndex];
    
    // Check if this account has any activity
    if (accountData.didDailies.length > 0 || accountData.alreadyCheckedIn.length > 0) {
      accountsWithActivity.add(parseInt(accountIndex));
    }
  }

  // Convert to sorted array for consistent numbering
  const sortedAccounts = Array.from(accountsWithActivity).sort((a, b) => a - b);
  
  // Create mapping from original index to consecutive number
  const accountMapping = {};
  sortedAccounts.forEach((originalIndex, i) => {
    accountMapping[originalIndex] = i + 1; // 1-based consecutive numbering
  });

  // Process each account's results with the new numbering
  for (const accountIndex in accountGamesCheckedIn) {
    const accountData = accountGamesCheckedIn[accountIndex];
    
    // Skip if no activity
    if (accountData.didDailies.length === 0 && accountData.alreadyCheckedIn.length === 0) {
      continue;
    }
    
    // Get the new consecutive account number
    const newAccountNumber = accountMapping[parseInt(accountIndex)];
    const accountNum = `${newAccountNumber}${ordinalSuffix(newAccountNumber)}`;
    
    // Process each game
    for (const game of [...accountData.didDailies, ...accountData.alreadyCheckedIn]) {
      const gameName = formatGameName(game);
      if (!gameResults[gameName]) continue;
      
      // Initialize the account in this game's results if needed
      if (!gameResults[gameName].accounts[accountNum]) {
        gameResults[gameName].accounts[accountNum] = {
          didDailies: false,
          alreadyCheckedIn: false
        };
      }
      
      // Mark appropriate activity
      if (accountData.didDailies.includes(game)) {
        gameResults[gameName].accounts[accountNum].didDailies = true;
      }
      if (accountData.alreadyCheckedIn.includes(game)) {
        gameResults[gameName].accounts[accountNum].alreadyCheckedIn = true;
      }
    }
  }

  // Format the message for each game
  for (const [gameName, gameData] of Object.entries(gameResults)) {
    // Skip games with no activity
    if (Object.keys(gameData.accounts).length === 0) continue;
    
    discordMsg += `**${gameName}**\n`;
    
    // Collect accounts for already checked in
    const alreadyCheckedInAccounts = Object.entries(gameData.accounts)
      .filter(([_, data]) => data.alreadyCheckedIn)
      .map(([accountNum, _]) => accountNum);
    
    // Collect accounts for did dailies
    const didDailiesAccounts = Object.entries(gameData.accounts)
      .filter(([_, data]) => data.didDailies)
      .map(([accountNum, _]) => accountNum);
    
    if (alreadyCheckedInAccounts.length) {
      discordMsg += `- You've already completed daily activities on your ${formatGameList(alreadyCheckedInAccounts)} account${alreadyCheckedInAccounts.length > 1 ? 's' : ''}.\n`;
    }
    
    if (didDailiesAccounts.length) {
      discordMsg += `- Draco has done daily activities on your ${formatGameList(didDailiesAccounts)} account${didDailiesAccounts.length > 1 ? 's' : ''}.\n`;
    }
    
    discordMsg += '\n';
  }

  discordMsg += "You're welcome...";

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
  fatalErrors = true;
}

function ordinalSuffix(i) {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

(async () => {
  if (!cookies?.length) throw new Error('COOKIE environment variable not set!');
  if (!gamesList?.length) throw new Error('GAMES environment variable not set!');

  for (const index in cookies) {
    log('info', `-- CHECKING IN FOR ACCOUNT ${Number(index) + 1} --`);
    await run(cookies[index], gamesList[index], index);
  }

  if (discordWebhook) {
    await discordWebhookSend();
  }

  console.log('Finished checking in all accounts.');
})();
