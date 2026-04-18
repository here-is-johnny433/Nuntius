require('dotenv').config();
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
} = require('@whiskeysockets/baileys');

const WA_VERSION = [2, 3000, 1023223821];

async function main() {
  const authDir = path.join(__dirname, '..', 'auth');
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version: WA_VERSION,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'warn' }),
    browser: ['Nuntius', 'Chrome', '1.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    console.error('Not paired yet. Run `npm start` first to pair the device, then run this script.');
    process.exit(1);
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      try {
        const groups = await sock.groupFetchAllParticipating();
        const entries = Object.values(groups);
        console.log(`\nFound ${entries.length} group(s):\n`);
        for (const g of entries) {
          console.log(`  ${g.id}  —  ${g.subject || '(no subject)'}`);
        }
        console.log('');
      } catch (err) {
        console.error('Failed to fetch groups:', err);
      }
      process.exit(0);
    } else if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      console.error('Connection closed before groups could be fetched. statusCode=', code);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
