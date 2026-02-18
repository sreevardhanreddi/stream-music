const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const PLAY_LEAD_MS = 900;
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.VITE_DEV_ORIGIN,
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
});

const audioDir = path.join(__dirname, "public", "audio");
app.use("/audio", express.static(audioDir));

const clientDistDir = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io") || req.path.startsWith("/audio")) {
      return next();
    }
    return res.sendFile(path.join(clientDistDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send(
      'Frontend not built yet. Run "npm run dev" for local dev or "npm run build" for production build.',
    );
  });
}

const rooms = new Map();

function createRoomState() {
  const now = Date.now();
  return {
    trackUrl: "/audio/sample.mp3",
    isPlaying: false,
    anchorPositionSec: 0,
    anchorServerTimeMs: now,
    updatedAtMs: now,
  };
}

function getRoomState(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoomState());
  }
  return rooms.get(roomId);
}

function nowPositionSec(state, nowMs) {
  if (!state.isPlaying) return state.anchorPositionSec;
  return Math.max(
    0,
    state.anchorPositionSec + (nowMs - state.anchorServerTimeMs) / 1000,
  );
}

function clampPosition(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return 0;
  return value;
}

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId }) => {
    const id = (roomId || "main").trim() || "main";
    socket.join(id);
    socket.data.roomId = id;

    const state = getRoomState(id);
    socket.emit("room_state", { roomId: id, state, serverTimeMs: Date.now() });
  });

  socket.on("clock_ping", ({ clientSentAtMs }) => {
    socket.emit("clock_pong", {
      clientSentAtMs,
      serverTimeMs: Date.now(),
    });
  });

  socket.on("control", (payload = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const state = getRoomState(roomId);
    const nowMs = Date.now();

    switch (payload.action) {
      case "play": {
        const requestedPos = clampPosition(payload.positionSec);
        state.anchorPositionSec = requestedPos;
        state.anchorServerTimeMs = nowMs + PLAY_LEAD_MS;
        state.isPlaying = true;
        state.updatedAtMs = nowMs;
        break;
      }
      case "pause": {
        state.anchorPositionSec = nowPositionSec(state, nowMs);
        state.anchorServerTimeMs = nowMs;
        state.isPlaying = false;
        state.updatedAtMs = nowMs;
        break;
      }
      case "seek": {
        const requestedPos = clampPosition(payload.positionSec);
        state.anchorPositionSec = requestedPos;
        state.anchorServerTimeMs = state.isPlaying
          ? nowMs
          : state.anchorServerTimeMs;
        state.updatedAtMs = nowMs;
        break;
      }
      case "set_track": {
        const nextUrl =
          typeof payload.trackUrl === "string" ? payload.trackUrl.trim() : "";
        if (nextUrl) {
          state.trackUrl = nextUrl;
          state.isPlaying = false;
          state.anchorPositionSec = 0;
          state.anchorServerTimeMs = nowMs;
          state.updatedAtMs = nowMs;
        }
        break;
      }
      default:
        return;
    }

    io.to(roomId).emit("room_state", {
      roomId,
      state,
      serverTimeMs: Date.now(),
    });
  });
});

setInterval(() => {
  const nowMs = Date.now();
  for (const [roomId, state] of rooms.entries()) {
    io.to(roomId).emit("room_state", { roomId, state, serverTimeMs: nowMs });
  }
}, 5000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sync audio backend running at http://localhost:${PORT}`);
});
