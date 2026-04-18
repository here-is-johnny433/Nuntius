const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const { handleMessage } = require('./forwarder');

const AUTH_DIR = path.join(__dirname, '..', 'auth');

// Hardcoded WA version — Baileys auto-fetch breaks periodically.
// Update to a known-good value when upgrading Baileys.
const WA_VERSION = [2, 3000, 1023223821];

const MAX_RECONNECT_MS = 30000;

let sock = null;
let connected = false;
let reconnectDelay = 1000;
let pairingRequested = false;

function getSock() { return sock; }
function isConnected() { return connected; }

async function start(logger) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    version: WA_VERSION,
    auth: state,
    printQRInTerminal: false,
    logger: logger.child({ module: 'baileys' }),
    browser: ['Nuntius', 'Chrome', '1.0'],
    syncFullHistory: false,
  });

  if (!sock.authState.creds.registered && !pairingRequested) {
    pairingRequested = true;
    const pairNumber = process.env.PAIR_NUMBER;
    if (!pairNumber) {
      logger.error('PAIR_NUMBER not set in .env — cannot request pairing code.');
      process.exit(1);
    }
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairNumber);
        const formatted = code && code.match(/.{1,4}/g) ? code.match(/.{1,4}/g).join('-') : code;
        logger.info(`\n\n========================================\n  PAIRING CODE: ${formatted}\n  Open WhatsApp → Linked Devices → Link with phone number\n========================================\n`);
      } catch (err) {
        logger.error({ err }, 'Failed to request pairing code');
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      connected = true;
      reconnectDelay = 1000;
      logger.info('Connected to WhatsApp');
    } else if (connection === 'close') {
      connected = false;
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      logger.warn({ statusCode }, 'WhatsApp connection closed');
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Session logged out — delete auth/ and re-pair.');
        return;
      }
      const delay = reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
      logger.info({ delayMs: delay }, 'Scheduling reconnect');
      setTimeout(() => {
        start(logger).catch((err) => logger.error({ err }, 'Reconnect failed'));
      }, delay);
    } else if (connection === 'connecting') {
      logger.info('Connecting to WhatsApp...');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg, logger);
      } catch (err) {
        logger.error({ err, key: msg && msg.key }, 'Error handling message');
      }
    }
  });
}

module.exports = { start, getSock, isConnected };
