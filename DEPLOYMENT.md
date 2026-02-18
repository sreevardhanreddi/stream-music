# Deployment Plan

## Goal

- Backend on Render (Node + Socket.IO)
- Frontend on GitHub Pages (Vite build)

## 1. Prepare Environment Values

Backend (Render env vars):

- `PORT=3000` (Render also injects `PORT` automatically)
- `FRONTEND_ORIGIN=https://<your-github-username>.github.io`

Frontend build env (`client/.env.production`):

- `VITE_SOCKET_ORIGIN=https://<your-render-service>.onrender.com`
- `VITE_AUDIO_BASE_URL=https://<your-render-service>.onrender.com`
- `VITE_BASE_PATH=/` for user/org Pages, or `/<repo-name>/` for project Pages

## 2. Deploy Backend to Render

1. Push this repo to GitHub.
2. In Render, create **Web Service** from this repo.
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Root directory: repo root
4. Add env var `FRONTEND_ORIGIN` as your GitHub Pages URL.
5. Deploy and copy backend URL, e.g. `https://your-app.onrender.com`.

## 3. Deploy Frontend to GitHub Pages

1. In `client/.env.production`, set:

```bash
VITE_SOCKET_ORIGIN=https://your-app.onrender.com
VITE_AUDIO_BASE_URL=https://your-app.onrender.com
VITE_BASE_PATH=/your-repo-name/
```

2. Build frontend:

```bash
npm --prefix client install
npm --prefix client run build
```

3. Publish `client/dist` to GitHub Pages.

### Option A: `gh-pages` branch manually

- Push contents of `client/dist` to `gh-pages` branch.
- Configure repo Pages source to `gh-pages` branch.

### Option B: GitHub Actions (recommended)

- Add a workflow to build `client/` and deploy `client/dist` to Pages on push to `main`.
- Store `VITE_SOCKET_ORIGIN` and `VITE_AUDIO_BASE_URL` as repo secrets or env in workflow.

## 4. Verify

1. Open frontend URL on GitHub Pages.
2. Confirm status shows connected.
3. Click `Enable Audio`, then `Play`.
4. Open the same URL in another device/tab and confirm sync playback.

## Notes

- Render free instances may sleep; first request can be slow.
- If Socket.IO fails, verify `FRONTEND_ORIGIN` exactly matches your Pages origin.
