Audio Processing Framework (Node/Express + Redis/Bull + React/Tailwind + SQLite/Prisma)
================================================================================================

Overview
--------
Mini full‑stack audio processing framework. Upload audio, process in background, and visualize results.

- Backend: Express API + Bull/Redis queue + Prisma/SQLite
- Worker: Background processor (metadata, convert, slice, waveform) using pure JS libs (wavefile, lamejs, pureimage)
- Frontend: React (Vite) + Tailwind with light/dark mode, react-select, toasts, waveform/audio previews
- Docker Compose: redis, server, worker, client

Default Ports
-------------
- Client (Vite static via Nginx): http://localhost:5173
- API Server (Express): http://localhost:3001
- Redis: localhost:6379 (exposed)

Project Structure
-----------------
- `server/` — Express API, Prisma schema, worker, uploads
- `client/` — React + Vite app
- `docker-compose.yml` — redis, server, worker, client services

Persistent Data (host-mounted)
------------------------------
- Database: `server/prisma/dev.db`
- Uploads: `server/uploads/`

Prerequisites (for local non-Docker)
------------------------------------
- Node.js 18+ (20 recommended)
- npm
- Redis 7+ (or use `docker compose up -d redis`)

Environment Variables
---------------------
Server (`server/.env`):
- `PORT=3001`
- `DATABASE_URL=file:./dev.db`
- `REDIS_HOST=localhost` (in Docker this is `redis`)
- `REDIS_PORT=6379`
- `UPLOAD_DIR=./uploads`

Client (`client/.env.local`):
- `VITE_API_URL=http://localhost:3001/api`

Quick Start (Docker)
--------------------
Build and run everything (client, server, worker, redis):

```bash
docker compose up -d --build
```

Open:
- Client: http://localhost:5173
- API: http://localhost:3001/health

Stop:
```bash
docker compose down
```

Follow logs:
```bash
docker compose logs -f server
docker compose logs -f worker
docker compose logs -f client
docker compose logs -f redis
```

Local Development (Node + Dockerized Redis)
-------------------------------------------
1) Start Redis (dockerized):
```bash
docker compose up -d redis
```

2) API Server:
```bash
cd server
npm install
npx prisma generate
# If the DB is empty and you want to apply the existing migration:
npx prisma migrate deploy
# Start the API (dev with nodemon)
npm run dev
```

3) Worker:
```bash
cd server
npm run worker
```

4) Client:
```bash
cd client
npm install
echo "VITE_API_URL=http://localhost:3001/api" > .env.local
npm run dev
```

Open the app: http://localhost:5173

Local Development (Everything via Docker)
-----------------------------------------
If you prefer containers for all services including the client:
```bash
docker compose up -d --build
```
Use the same URLs listed above. Hot reloading is not enabled inside the container; for active FE dev, prefer the local dev flow.

Common Tasks
------------
- View API routes: `GET /` at http://localhost:3001
- Health check: http://localhost:3001/health
- Uploads are served from `GET /uploads/:filename`

Cleaning Old Jobs/Files
-----------------------
- Automatic cleanup runs periodically in the server
- Manual delete per job via UI (trash button on a job)
- API also exposes cleanup/delete endpoints (see server routes)

Troubleshooting
---------------
- Client cannot reach API (Docker):
  - Ensure `VITE_API_URL` used at build time points to `http://localhost:3001/api` (default in docker-compose)
  - Rebuild client if you change it: `docker compose build client && docker compose up -d client`
- Port already in use:
  - API/Server: uses 3001; the server will attempt to kill conflicting processes in local dev. Alternatively free the port or change `PORT`.
  - Client: 5173 for Docker nginx (80 in-container). For Vite dev, default is 5173.
- Database:
  - SQLite file is persisted at `server/prisma/dev.db`. If schema changes, run `npx prisma migrate dev` (dev) or `npx prisma migrate deploy` (prod/Docker).
- Tailwind dark mode:
  - Tailwind v4 uses `@custom-variant dark` in `client/src/index.css`. The toggle adds/removes the `dark` class on `<html>`. Restart Vite if styles don’t update after config changes.

Build Details (Docker)
----------------------
- Client: Multi-stage build (Node -> Nginx). Build arg `VITE_API_URL` controls API base URL at build time.
- Server/Worker: Node 18-alpine base, Prisma client generated at build, volumes mount uploads and SQLite DB for persistence.

License
-------
MIT (adjust as needed)


