# La Esquina Shop Agent 🥟☕

**Meta Global AI Hackathon 2026 — Track: Startup · Theme: Build for Your World**

A bilingual (Español / English) AI ordering agent for Latino corner shops and panaderías. Customers order in plain chat — "quiero 2 pastelitos de pollo y un café con leche" — the agent builds the cart, confirms, checks out with a name, and awards loyalty points. The owner sees every order in a PIN-protected portal.

- **Live demo:** https://shopagent.velvetgeaux.com
- **Owner portal:** https://shopagent.velvetgeaux.com/owner — demo PIN **2026** (intentionally public demo PIN)
- **Meta model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — Meta Llama 3.3 70B open weights, served on Cloudflare Workers AI. Optional path: Meta Llama API (`Llama-4-Maverick-17B-128E-Instruct-FP8`) is used automatically if a `META_API_KEY` secret is set (not used in the demo).

## How it works
- `worker.js` — Cloudflare Worker: chat API (`/api/chat`), health (`/api/health`), owner API (`/api/owner`), plus a SQLite-backed Durable Object (`Store`) for carts, orders and loyalty.
- `public/index.html` — customer chat UI. `public/owner.html` — owner order portal.
- Llama 3.3 understands the customer's message (ES/EN/Spanglish) and replies in their language; menu, prices, cart math and loyalty are computed deterministically server-side so the model can't invent prices.

## Run it
```bash
npm install
npx wrangler dev          # local, uses Workers AI binding (requires Cloudflare login)
npx wrangler deploy       # deploy; edit `routes` in wrangler.toml to your own domain or remove it to use workers.dev
```
Optional: `npx wrangler secret put META_API_KEY` to route to the Meta Llama API instead of Workers AI.

## Try the demo flow
1. Open the live URL, type: `Hola, quiero 2 pastelitos de pollo y un café con leche`
2. Type: `Sí, confirma el pedido, me llamo Ana`
3. Open `/owner`, enter PIN `2026`, see the order.

## Team
Lance Butcher — VelvetGeaux LLC (solo).

License: MIT
