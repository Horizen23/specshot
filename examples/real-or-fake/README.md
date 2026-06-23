# Real or Fake Meme

Guess whether each meme caption is real or fake. Toggle between real & fake API endpoints.

## Structure

```
examples/real-or-fake/
├── meme.json          → OpenAPI spec
├── specshot.config.mjs→ Project settings & Faker plugins
├── specshot.mocks.json→ Saved mock toggle state
├── client/            → React (Vite) frontend
│   └── src/
│       ├── App.jsx
│       ├── lib/api/   → Generated API client
│       └── index.css
├── server/
│   ├── server.js      → Real API (port 3000)
│   └── fake-server.js → Fake API (port 3457)
└── package.json
```

## How to setup
```bash
npm install
npm run specshot:init
```

## Run

```bash
# Terminal 1 — Real API
node server/server.js

# Terminal 2 — Fake API  
node server/fake-server.js

# Terminal 3 — Frontend
cd client && npm install && npm run dev
```

Open `http://localhost:5173`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/memes` | List all memes |
| GET | `/memes/:id` | Get single meme |
| POST | `/memes/:id/vote` | Vote `real` or `fake` |
