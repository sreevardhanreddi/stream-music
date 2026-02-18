# Streaming App (React + Vite + Socket.IO)

Synchronized music playback web app. Devices in the same room stay in sync for play/pause/seek.

## Project Structure

- `server/index.js`: backend server + Socket.IO sync logic
- `server/public/audio/sample.mp3`: default sample track
- `client/`: Vite + React + Tailwind frontend
- `DEPLOYMENT.md`: Render + GitHub Pages deployment plan

## Install

```bash
npm install
npm --prefix client install
```

## Environment Setup

```bash
cp .env.example .env
cp client/.env.example client/.env
```

## Run in Development

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

## Production Build

```bash
npm run build
npm start
```

This serves the built frontend from `client/dist` and keeps Socket.IO + audio routes on the same backend.

## Replace Music

Replace this file:

- `server/public/audio/sample.mp3`

or set a different URL from the app UI.

## Deploy

See `DEPLOYMENT.md`.
