# LOKA AIUSD Dashboard

Treasury-backed stablecoin + RWA cash flow marketplace.

## Project Structure

```
├── src/                  Frontend source (React 19 + TypeScript + Vite)
│   ├── components/       UI components
│   ├── services/         API client
│   ├── App.tsx           Root component
│   ├── index.tsx         Entry point
│   ├── constants.tsx     Icons, colors
│   └── types.ts          Shared types
├── server/               Backend (Express 5 + Prisma + Socket.IO)
│   ├── src/              Server source
│   │   ├── routes/       API endpoints
│   │   ├── services/     Business logic (AI, etc.)
│   │   ├── middleware/   Auth, error handling
│   │   └── socket/       WebSocket setup
│   └── prisma/           Schema + seed
├── docs/                 Product documentation
│   ├── requirement.md    PRD v3.0 (authoritative)
│   └── Loka_Credit_System.md
├── index.html            Vite HTML entry
├── vite.config.ts        Vite config (proxy → :3002)
└── package.json          Frontend dependencies
```

## Quick Start

```bash
# Frontend
npm install
npm run dev              # Vite on :3000

# Backend
cd server
npm install
npm run db:push          # Create DB tables
npm run db:seed          # Seed demo data
npm run dev              # Express on :3002
```

