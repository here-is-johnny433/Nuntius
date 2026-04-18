const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('./config');

const FORWARD_DELAY_MS = 800;

function extractImage(message) {
  if (!message) return null;
  if (message.imageMessage) {
    return { node: message.imageMessage, caption: message.imageMessage.caption || '' };
  }
  if (message.documentMessage && typeof message.documentMessage.mimetype === 'string' && message.documentMessage.mimetype.startsWith('image/')) {
    return { node: message.documentMessage, caption: message.documentMessage.caption || '' };
  }
  // view-once is intentionally skipped — enable here if the owner wants it forwarded
  return null;
}

async function handleMessage(sock, msg, logger) {
  if (!msg || !msg.message || !msg.key) return;
  if (msg.key.fromMe) return;

  const cfg = config.get();
  if (!cfg.enabled) return;
  if (msg.key.remoteJid !== cfg.teacherJid) return;

  const image = extractImage(msg.message);
  if (!image) return;

  const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
    logger,
    reuploadRequest: sock.updateMediaMessage,
  });

  const finalCaption = image.caption
    ? `${cfg.forwardCaption}\n\n${image.caption}`
    : cfg.forwardCaption;

  await sock.sendMessage(cfg.groupJid, { image: buffer, caption: finalCaption });

  config.update((c) => {
    c.stats.forwardedCount = (c.stats.forwardedCount || 0) + 1;
    c.stats.lastForwardedAt = new Date().toISOString();
  });

  logger.info({
    from: msg.key.remoteJid,
    ts: msg.messageTimestamp,
    hasCaption: Boolean(image.caption),
  }, 'Forwarded image');

  await new Promise((r) => setTimeout(r, FORWARD_DELAY_MS));
}

module.exports = { handleMessage };
