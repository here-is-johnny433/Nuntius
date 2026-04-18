const express = require('express');
const config = require('./config');
const wa = require('./whatsapp');

function basicAuth(user, pass) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx !== -1) {
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        if (u === user && p === pass) return next();
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="Nuntius"');
    res.status(401).send('Authentication required');
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderPage(cfg, connected) {
  const onClass = cfg.enabled ? 'on' : 'off';
  const onLabel = cfg.enabled ? 'ON' : 'OFF';
  const connClass = connected ? 'ok' : 'bad';
  const connLabel = connected ? 'Connected to WhatsApp' : 'Disconnected';
  const last = cfg.stats && cfg.stats.lastForwardedAt ? cfg.stats.lastForwardedAt : 'never';
  const count = (cfg.stats && cfg.stats.forwardedCount) || 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nuntius</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1.2rem; color: #222; background: #fafafa; }
  h1 { color: #075E54; margin-bottom: 1rem; }
  .toggle { font-size: 1.6rem; font-weight: 700; padding: 1.2rem 2rem; border: none; border-radius: 10px; color: white; cursor: pointer; width: 100%; transition: background .15s; }
  .toggle.on { background: #25D366; }
  .toggle.off { background: #888; }
  .badge { display: inline-block; padding: .3rem .7rem; border-radius: 4px; font-size: .85rem; color: white; font-weight: 600; }
  .badge.ok { background: #25D366; }
  .badge.bad { background: #d33; }
  .card { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1rem 1.2rem; margin: 1rem 0; }
  label { display: block; margin: .8rem 0 .25rem; font-weight: 600; font-size: .85rem; color: #555; }
  input[type=text] { width: 100%; padding: .55rem; font-family: ui-monospace, Menlo, monospace; font-size: .9rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
  button.save { margin-top: 1rem; padding: .6rem 1.4rem; background: #075E54; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
  .stat { font-size: 1rem; margin: .3rem 0; }
  .muted { color: #666; font-size: .85rem; }
</style>
</head>
<body>
<h1>📸 Nuntius</h1>
<button id="toggle" class="toggle ${onClass}">${onLabel}</button>

<div class="card">
  <div>Status: <span id="conn" class="badge ${connClass}">${connLabel}</span></div>
  <div class="stat" style="margin-top:.8rem;">Forwarded: <strong id="count">${count}</strong></div>
  <div class="stat">Last forward: <span id="last" class="muted">${escapeHtml(last)}</span></div>
</div>

<form class="card" method="POST" action="/config">
  <label>Teacher JID</label>
  <input type="text" name="teacherJid" value="${escapeHtml(cfg.teacherJid)}">
  <label>Group JID</label>
  <input type="text" name="groupJid" value="${escapeHtml(cfg.groupJid)}">
  <label>Forward Caption</label>
  <input type="text" name="forwardCaption" value="${escapeHtml(cfg.forwardCaption)}">
  <button type="submit" class="save">Save</button>
</form>

<script>
  const btn = document.getElementById('toggle');
  function paintToggle(enabled) {
    btn.classList.toggle('on', enabled);
    btn.classList.toggle('off', !enabled);
    btn.textContent = enabled ? 'ON' : 'OFF';
  }
  btn.addEventListener('click', async () => {
    const r = await fetch('/toggle', { method: 'POST' });
    const j = await r.json();
    paintToggle(j.enabled);
  });
  async function poll() {
    try {
      const r = await fetch('/status.json');
      const j = await r.json();
      document.getElementById('count').textContent = j.stats.forwardedCount || 0;
      document.getElementById('last').textContent = j.stats.lastForwardedAt || 'never';
      const conn = document.getElementById('conn');
      conn.className = 'badge ' + (j.connected ? 'ok' : 'bad');
      conn.textContent = j.connected ? 'Connected to WhatsApp' : 'Disconnected';
      paintToggle(j.enabled);
    } catch (e) { /* ignore */ }
  }
  setInterval(poll, 5000);
</script>
</body>
</html>`;
}

function start(logger) {
  const user = process.env.WEB_USER;
  const pass = process.env.WEB_PASS;
  const port = parseInt(process.env.WEB_PORT || '3100', 10);

  if (!user || !pass) {
    logger.error('WEB_USER and WEB_PASS must be set in .env');
    process.exit(1);
  }

  const app = express();
  app.use(basicAuth(user, pass));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.get('/', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage(config.get(), wa.isConnected()));
  });

  app.post('/toggle', (req, res) => {
    const updated = config.update((c) => { c.enabled = !c.enabled; });
    logger.info({ enabled: updated.enabled }, 'Toggled');
    res.json({ enabled: updated.enabled });
  });

  app.post('/config', (req, res) => {
    const { teacherJid, groupJid, forwardCaption } = req.body || {};
    const updated = config.update((c) => {
      if (typeof teacherJid === 'string' && teacherJid.trim()) c.teacherJid = teacherJid.trim();
      if (typeof groupJid === 'string' && groupJid.trim()) c.groupJid = groupJid.trim();
      if (typeof forwardCaption === 'string') c.forwardCaption = forwardCaption;
    });
    logger.info({ teacherJid: updated.teacherJid, groupJid: updated.groupJid }, 'Config updated via web');
    if (req.is('application/json')) res.json(updated);
    else res.redirect('/');
  });

  app.get('/status.json', (req, res) => {
    const cfg = config.get();
    res.json({
      enabled: cfg.enabled,
      connected: wa.isConnected(),
      stats: cfg.stats || { forwardedCount: 0, lastForwardedAt: null },
    });
  });

  app.listen(port, '127.0.0.1', () => {
    logger.info(`Web UI listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { start };
