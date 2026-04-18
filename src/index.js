require('dotenv').config();
const pino = require('pino');
const config = require('./config');
const wa = require('./whatsapp');
const web = require('./web');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function main() {
  config.load();
  logger.info('Nuntius starting');
  web.start(logger);
  await wa.start(logger);
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => logger.error({ err }, 'Uncaught exception'));

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
