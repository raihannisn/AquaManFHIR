# Setup

## Prerequisites

- Node.js 20.11 or later and npm.
- Network access to the public OneAquaHealth API for live data.
- Optional Gemini API key for the natural-language agent.

## Install

From the repository root:

```sh
npm install
copy .env.example .env
```

Edit `.env` only on the backend host. `GEMINI_API_KEY` is never exposed to Vite. `OAH_API_BASE_URL` defaults to the verified `https://api.enora-oah.eu` base URL.

## Run

```sh
npm run dev
```

The Express API listens on port 3001. Vite serves the frontend on port 5173 and proxies `/api` requests to Express. Override `PORT`, `FRONTEND_ORIGIN`, and `VITE_API_BASE_URL` through environment configuration where needed.

## Verify

```sh
npm test
npm run build
```

`GET /api/health` checks backend readiness. Source availability is shown separately in the application because an API process may be healthy while OneAquaHealth is unreachable.

## Persistence

The prototype uses a short-lived in-memory source cache and resource repository. Resources are lost on restart. `DATABASE_URL` is reserved for a future persistent implementation and is not currently required.
