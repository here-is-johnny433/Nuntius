# Nuntius

A small self-hosted WhatsApp photo forwarder. Listens to a specific sender (a teacher) on a paired WhatsApp account and forwards incoming images to a group (the parents).

## Setup

```bash
npm install
cp .env.example .env
# edit .env — set PAIR_NUMBER (wife's WhatsApp number, country code + digits, no +),
# WEB_USER, WEB_PASS, WEB_PORT, LOG_LEVEL
```

## First run (pairing)

```bash
npm start
```

A pairing code is printed to stdout. In WhatsApp on the target phone:
**Settings → Linked Devices → Link with phone number → enter the 8-char code**.

The session is persisted to `auth/`. Subsequent restarts need no pairing.

## Find the group JID

After pairing, run:

```bash
npm run list-groups
```

This connects, prints every group the account is in with its JID and subject, and exits. Copy the right JID into `config.json` under `groupJid` (or paste it into the web UI).

## Web UI

`http://127.0.0.1:3100/` (basic auth, credentials from `.env`).

- ON/OFF toggle for the forwarder
- Connection status + stats (count, last forward time)
- Editable teacher JID, group JID, forward caption

The server binds to `127.0.0.1` only — expose it behind Caddy on a subdomain.

## PM2

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Notes

- Baileys WA version is hardcoded in `src/whatsapp.js` (`WA_VERSION`). If connection breaks after a Baileys upgrade, bump this to a current known-good build.
- View-once images are ignored by default. Enable in `src/forwarder.js` → `extractImage()` if needed.
- Config writes are atomic (`.tmp` + rename). No database.
