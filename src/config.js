const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let current = null;

function load() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  current = JSON.parse(raw);
  if (!current.stats) current.stats = { forwardedCount: 0, lastForwardedAt: null };
  return current;
}

function get() {
  if (!current) load();
  return current;
}

function save(cfg) {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  current = cfg;
}

function update(mutator) {
  const next = JSON.parse(JSON.stringify(get()));
  mutator(next);
  save(next);
  return next;
}

module.exports = { load, get, save, update };
