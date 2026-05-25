import { useEffect, useRef } from "react";
import type { LiveFlowStatus } from "./liveFlow";

interface Props {
  tmin: number;
  tmax: number;
  time: number;
  setTime: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  liveFlow: boolean;
  setLiveFlow: (b: boolean) => void;
  liveFlowStatus: LiveFlowStatus;
}

const SPEEDS = [0.1, 0.5, 1, 2, 5];

export function PlayBar({
  tmin,
  tmax,
  time,
  setTime,
  playing,
  setPlaying,
  speed,
  setSpeed,
  liveFlow,
  setLiveFlow,
  liveFlowStatus,
}: Props) {
  const lastWall = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const timeRef = useRef(time);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    if (!playing) {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      return;
    }
    lastWall.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dtWall = (now - lastWall.current) / 1000;
      lastWall.current = now;
      // 1x speed = play the full sim window over 5 seconds of wall clock
      const dtSim = (dtWall * (tmax - tmin) * speed) / 5;
      let next = timeRef.current + dtSim;
      if (next >= tmax) {
        next = tmin;
      }
      timeRef.current = next;
      setTime(next);
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [playing, speed, tmax, tmin, setTime]);

  const timeLabel = formatTime(time);

  return (
    <div
      className="playbar"
      role="toolbar"
      aria-label="Transient playback"
      title="Scrub or play the transient simulation time. Live Flow animates wire current at the selected time."
    >
      <span className="playbar-label">Playback</span>
      <button
        className="play-btn"
        onClick={() => setPlaying(!playing)}
        title={playing ? "Pause" : "Play"}
        aria-label={playing ? "Pause transient playback" : "Play transient playback"}
        aria-pressed={playing}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect x="3" y="2" width="3" height="10" fill="currentColor" />
            <rect x="8" y="2" width="3" height="10" fill="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14">
            <polygon points="3,2 11,7 3,12" fill="currentColor" />
          </svg>
        )}
      </button>
      <input
        type="range"
        className="time-slider"
        min={tmin}
        max={tmax}
        step={(tmax - tmin) / 1000}
        value={time}
        aria-label="Transient playback time"
        aria-valuetext={timeLabel}
        onChange={(e) => {
          setPlaying(false);
          setTime(Number(e.target.value));
        }}
      />
      <span className="time-readout" aria-live="polite">{timeLabel}</span>
      <div className="speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`speed-btn ${speed === s ? "active" : ""}`}
            onClick={() => setSpeed(s)}
            aria-label={`Set playback speed to ${s}x`}
            aria-pressed={speed === s}
          >
            {s}×
          </button>
        ))}
      </div>
      <label
        className="live-flow-toggle"
        title={liveFlowStatus.title}
      >
        <input
          type="checkbox"
          checked={liveFlow}
          onChange={(e) => setLiveFlow(e.target.checked)}
          aria-label="Show Live Flow current animation"
        />
        <span className="live-flow-switch" aria-hidden="true">
          <span className="live-flow-switch-knob" />
        </span>
        <span className="live-flow-toggle-label">Live Flow</span>
      </label>
      {liveFlowStatus.show && (
        <span
          className={`live-flow-status ${liveFlowStatus.tone} ${liveFlowStatus.source}`}
          title={liveFlowStatus.title}
          role="status"
          aria-live="polite"
          aria-label={`Live Flow: ${liveFlowStatus.label}. ${liveFlowStatus.title}`}
        >
          <span className="live-flow-source-dot" aria-hidden="true" />
          <span className="live-flow-status-label">{liveFlowStatus.label}</span>
        </span>
      )}
    </div>
  );
}

function formatTime(t: number): string {
  const a = Math.abs(t);
  if (a < 1e-9) return `${(t * 1e12).toFixed(1)} ps`;
  if (a < 1e-6) return `${(t * 1e9).toFixed(1)} ns`;
  if (a < 1e-3) return `${(t * 1e6).toFixed(1)} µs`;
  if (a < 1) return `${(t * 1e3).toFixed(2)} ms`;
  return `${t.toFixed(3)} s`;
}
