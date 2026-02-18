import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const DEFAULT_ROOM = "main";
const SOCKET_ORIGIN = import.meta.env.VITE_SOCKET_ORIGIN || "";
const AUDIO_BASE_URL = import.meta.env.VITE_AUDIO_BASE_URL || SOCKET_ORIGIN;
const DEFAULT_TRACK = AUDIO_BASE_URL
  ? `${AUDIO_BASE_URL.replace(/\/$/, "")}/audio/sample.mp3`
  : "/audio/sample.mp3";

function formatTime(value) {
  const total = Math.max(0, Math.floor(value));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function App() {
  const initialRoom =
    window.location.hash.replace("#", "").trim() || DEFAULT_ROOM;
  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const scheduledPlayTimer = useRef(null);
  const activeStateRef = useRef(null);
  const offsetSamplesRef = useRef([]);
  const roomIdRef = useRef(initialRoom);
  const audioEnabledRef = useRef(false);
  const serverOffsetRef = useRef(0);

  const [roomId, setRoomId] = useState(initialRoom);
  const [roomInput, setRoomInput] = useState(roomId);
  const [trackUrlInput, setTrackUrlInput] = useState(DEFAULT_TRACK);
  const [status, setStatus] = useState("Connecting...");
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [volume, setVolume] = useState(1);

  const waveformBars = useMemo(() => [0, 1, 2, 3, 4], []);

  const clearScheduledPlay = () => {
    if (scheduledPlayTimer.current) {
      clearTimeout(scheduledPlayTimer.current);
      scheduledPlayTimer.current = null;
    }
  };

  const getEstimatedServerNowMs = () => Date.now() + serverOffsetRef.current;

  const getNowPositionFromState = (state) => {
    if (!state) return 0;
    if (!state.isPlaying) return state.anchorPositionSec;
    const elapsed =
      (getEstimatedServerNowMs() - state.anchorServerTimeMs) / 1000;
    return Math.max(0, state.anchorPositionSec + elapsed);
  };

  const applyRoomState = async (state) => {
    const audio = audioRef.current;
    if (!audio) return;

    activeStateRef.current = state;
    setIsPlaying(state.isPlaying);

    if (
      audio.src !== new URL(state.trackUrl, window.location.origin).toString()
    ) {
      audio.src = state.trackUrl;
      setTrackUrlInput(state.trackUrl);
    }

    const targetNowSec = getNowPositionFromState(state);
    const driftSec = targetNowSec - (audio.currentTime || 0);

    if (!state.isPlaying) {
      clearScheduledPlay();
      if (!audio.paused) audio.pause();
      if (Math.abs(driftSec) > 0.15) {
        audio.currentTime = targetNowSec;
      }
      setCurrentTime(audio.currentTime || 0);
      return;
    }

    const targetStartLocalMs = state.anchorServerTimeMs - serverOffsetRef.current;
    const delayMs = Math.max(0, targetStartLocalMs - Date.now());

    const startPlayback = async () => {
      const pos = getNowPositionFromState(state);
      if (Math.abs(pos - (audio.currentTime || 0)) > 0.2) {
        audio.currentTime = pos;
      }

      if (!audioEnabledRef.current) {
        setStatus("Press Enable Audio on this device.");
        return;
      }

      try {
        await audio.play();
        setStatus(`Room ${roomIdRef.current} synced`);
      } catch (_err) {
        setStatus("Autoplay blocked. Press Enable Audio.");
      }
    };

    clearScheduledPlay();
    if (delayMs > 80) {
      scheduledPlayTimer.current = setTimeout(startPlayback, delayMs);
    } else {
      await startPlayback();
    }
  };

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    serverOffsetRef.current = serverOffsetMs;
  }, [serverOffsetMs]);

  useEffect(() => {
    const socketServerUrl = SOCKET_ORIGIN || undefined;
    const socket = io(socketServerUrl, {
      timeout: 5000,
      reconnection: true,
    });
    socketRef.current = socket;

    const syncClock = () => {
      socket.emit("clock_ping", { clientSentAtMs: Date.now() });
    };

    socket.on("connect", () => {
      setIsConnected(true);
      setStatus("Connected");
      socket.emit("join_room", { roomId: roomIdRef.current });
      syncClock();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setStatus("Disconnected");
    });

    socket.on("connect_error", (err) => {
      setIsConnected(false);
      setStatus(
        `Connection error: ${err?.message || "backend unavailable"} (${socketServerUrl || "same-origin"})`,
      );
    });

    socket.on("clock_pong", ({ clientSentAtMs, serverTimeMs }) => {
      const clientReceivedAtMs = Date.now();
      const rtt = clientReceivedAtMs - clientSentAtMs;
      const estimatedOffset = serverTimeMs - (clientSentAtMs + rtt / 2);

      offsetSamplesRef.current.push(estimatedOffset);
      if (offsetSamplesRef.current.length > 12) {
        offsetSamplesRef.current.shift();
      }

      const sorted = [...offsetSamplesRef.current].sort((a, b) => a - b);
      setServerOffsetMs(sorted[Math.floor(sorted.length / 2)] || 0);
    });

    socket.on("room_state", ({ roomId: incomingRoomId, state }) => {
      setRoomId(incomingRoomId);
      setRoomInput(incomingRoomId);
      window.history.replaceState({}, "", `#${incomingRoomId}`);
      void applyRoomState(state);
    });

    const clockTimer = setInterval(syncClock, 3000);

    return () => {
      clearInterval(clockTimer);
      clearScheduledPlay();
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    setRoomInput(roomId);
  }, [roomId]);

  const joinRoom = () => {
    const socket = socketRef.current;
    if (!socket) return;

    const nextRoom = roomInput.trim() || DEFAULT_ROOM;
    setRoomId(nextRoom);
    window.history.replaceState({}, "", `#${nextRoom}`);
    socket.emit("join_room", { roomId: nextRoom });
    setStatus(`Joined room ${nextRoom}`);
  };

  const enableAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      audioEnabledRef.current = true;
      setAudioEnabled(true);
      audio.muted = false;
      audio.volume = volume;
      await audio.play();
      audio.pause();
      setStatus("Audio enabled on this device");
    } catch (_err) {
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      setStatus("Audio enable failed. Try again.");
    }
  };

  const sendControl = (payload) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("control", payload);
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!seeking) {
      setCurrentTime(audio.currentTime || 0);
    }

    const activeState = activeStateRef.current;
    if (!activeState?.isPlaying) {
      audio.playbackRate = 1;
      return;
    }

    const targetNowSec = getNowPositionFromState(activeState);
    const drift = targetNowSec - (audio.currentTime || 0);

    if (Math.abs(drift) > 0.25) {
      audio.currentTime = targetNowSec;
    } else if (Math.abs(drift) > 0.05) {
      const nextRate = 1 + Math.max(-0.03, Math.min(0.03, drift * 0.12));
      audio.playbackRate = nextRate;
    } else {
      audio.playbackRate = 1;
    }
  };

  const commitSeek = () => {
    setSeeking(false);
    const positionSec = audioRef.current?.currentTime || 0;
    sendControl({ action: "seek", positionSec });
  };

  return (
    <div className="min-h-screen px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-3xl border border-cyan/20 bg-panel/80 p-6 shadow-soft backdrop-blur-sm">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-cyan/80">
            Realtime Sync Player
          </p>
          <h1 className="text-3xl font-semibold">Shared Room Audio</h1>
          <p className="mt-2 text-sm text-slate-300">
            Everyone in the same room URL gets synchronized play, pause, and
            seek.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`rounded-full px-3 py-1 ${isConnected ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200"}`}
            >
              {isConnected ? "Connected" : "Offline"}
            </span>
            <span className="rounded-full bg-slate-700/70 px-3 py-1">
              Room: {roomId}
            </span>
            <span className="rounded-full bg-slate-700/70 px-3 py-1">
              Offset: {Math.round(serverOffsetMs)} ms
            </span>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
          <section className="rounded-3xl border border-white/10 bg-panel/75 p-6 shadow-soft backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-medium">Player Controls</h2>
              <div className="flex h-8 items-end gap-1">
                {waveformBars.map((bar) => (
                  <span
                    key={bar}
                    className={`w-1.5 origin-bottom rounded-full bg-mint/90 ${isPlaying ? "animate-pulsebar" : ""}`}
                    style={{
                      animationDelay: `${bar * 110}ms`,
                      height: `${16 + bar * 4}px`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
              <button
                onClick={enableAudio}
                className="rounded-xl bg-cyan px-4 py-2 font-semibold text-ink transition hover:brightness-110"
              >
                Enable Audio
              </button>
              <button
                onClick={() =>
                  sendControl({
                    action: "play",
                    positionSec: audioRef.current?.currentTime || 0,
                  })
                }
                className="rounded-xl border border-emerald-300/40 bg-emerald-400/20 px-4 py-2 font-medium transition hover:bg-emerald-400/30"
              >
                Play
              </button>
              <button
                onClick={() => sendControl({ action: "pause" })}
                className="rounded-xl border border-rose-300/40 bg-rose-400/20 px-4 py-2 font-medium transition hover:bg-rose-400/30"
              >
                Pause
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-slate-300">
                Volume
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(event) => {
                    const nextVolume = Number(event.target.value);
                    setVolume(nextVolume);
                    if (audioRef.current) {
                      audioRef.current.volume = nextVolume;
                    }
                  }}
                  className="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-cyan"
                />
                <span>{Math.round(volume * 100)}%</span>
              </label>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration || 0)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.01"
                value={currentTime}
                onMouseDown={() => setSeeking(true)}
                onTouchStart={() => setSeeking(true)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setCurrentTime(value);
                  if (audioRef.current) {
                    audioRef.current.currentTime = value;
                  }
                }}
                onMouseUp={() => {
                  commitSeek();
                }}
                onTouchEnd={() => {
                  commitSeek();
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-cyan"
              />
            </div>

            <p className="mt-5 rounded-xl border border-cyan/20 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
              {status}
            </p>
          </section>

          <aside className="space-y-4 rounded-3xl border border-white/10 bg-panel/75 p-6 shadow-soft backdrop-blur-sm">
            <h2 className="text-xl font-medium">Room Settings</h2>
            <label className="block text-sm text-slate-300">
              Room ID
              <div className="mt-2 flex gap-2">
                <input
                  value={roomInput}
                  onChange={(event) => setRoomInput(event.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan"
                />
                <button
                  onClick={joinRoom}
                  className="rounded-xl bg-mint px-4 py-2 font-semibold text-ink transition hover:brightness-110"
                >
                  Join
                </button>
              </div>
            </label>

            <label className="block text-sm text-slate-300">
              Track URL
              <input
                value={trackUrlInput}
                onChange={(event) => setTrackUrlInput(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan"
              />
            </label>

            <button
              onClick={() =>
                sendControl({
                  action: "set_track",
                  trackUrl: trackUrlInput.trim(),
                })
              }
              className="w-full rounded-xl border border-cyan/50 bg-cyan/20 px-4 py-2 font-semibold transition hover:bg-cyan/30"
            >
              Set Track
            </button>

            <p className="text-xs text-slate-400">
              Share this URL with others:{" "}
              <span className="text-slate-200">
                {window.location.origin}/#{roomId}
              </span>
            </p>
          </aside>
        </div>
      </div>

      <audio
        ref={audioRef}
        preload="auto"
        src={DEFAULT_TRACK}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) return;
          setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
          setStatus(`Track loaded: ${trackUrlInput}`);
        }}
        onCanPlay={() => {
          if (!audioEnabled) {
            setStatus('Track ready. Click "Enable Audio" once on this device.');
          }
        }}
        onError={() => {
          const audio = audioRef.current;
          const mediaErrorCode = audio?.error?.code;
          setStatus(
            `Track failed to load (${mediaErrorCode || "unknown"}). Check URL/path.`,
          );
        }}
        onTimeUpdate={onTimeUpdate}
      />
    </div>
  );
}
