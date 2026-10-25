"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./YoutubePlayer.module.css";

type PlaybackAction = "play" | "pause" | "seek" | "ratechange";

type YoutubeSync = {
  action: PlaybackAction;
  currentTime: number;
  speed?: number;
};

type YoutubePlayerInstance = {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlaybackRate: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
};

type YoutubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: { target: YoutubePlayerInstance }) => void;
        onStateChange: (event: { data: number; target: YoutubePlayerInstance }) => void;
        onError: (event: { data: number }) => void;
      };
    }
  ) => YoutubePlayerInstance;
  PlayerState: {
    ENDED: number;
    PAUSED: number;
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YoutubeApi> | null = null;

function loadYoutubeApi(): Promise<YoutubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const scriptUrl = "https://www.youtube.com/iframe_api";
    let script = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    const previousCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error("The YouTube player API did not initialize."));
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener("error", () => reject(new Error("Could not load the YouTube player API.")), { once: true });
  });

  return youtubeApiPromise;
}

type YoutubePlayerProps = {
  videoId: string;
  isHost: boolean;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed?: number;
  sync: YoutubeSync | null;
  onControl: (action: PlaybackAction, currentTime: number, speed: number) => void;
  onError: (message: string) => void;
};

export default function YoutubePlayer({ videoId, isHost, currentTime, isPlaying, playbackSpeed, sync, onControl, onError }: YoutubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YoutubePlayerInstance | null>(null);
  const onControlRef = useRef(onControl);
  const onErrorRef = useRef(onError);
  const initialPlaybackRef = useRef({ currentTime, isPlaying, playbackSpeed });
  const suppressEventsUntilRef = useRef(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    onControlRef.current = onControl;
    onErrorRef.current = onError;
    initialPlaybackRef.current = { currentTime, isPlaying, playbackSpeed };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isDisposed = false;
    let player: YoutubePlayerInstance | null = null;
    let sampleTimer: number | null = null;
    setIsReady(false);

    void loadYoutubeApi()
      .then((api) => {
        if (isDisposed) return;

        player = new api.Player(container, {
          videoId,
          playerVars: {
            autoplay: 0,
            controls: isHost ? 1 : 0,
            disablekb: isHost ? 0 : 1,
            enablejsapi: 1,
            fs: isHost ? 1 : 0,
            origin: window.location.origin,
            playsinline: 1,
          },
          events: {
            onReady: (event) => {
              if (isDisposed) return;
              playerRef.current = event.target;
              const initial = initialPlaybackRef.current;
              if (initial.playbackSpeed && initial.playbackSpeed !== 1) {
                event.target.setPlaybackRate(initial.playbackSpeed);
              }
              if (initial.currentTime > 0) {
                event.target.seekTo(initial.currentTime, true);
              }
              if (initial.isPlaying) {
                event.target.playVideo();
              } else {
                event.target.pauseVideo();
              }
              suppressEventsUntilRef.current = Date.now() + 1000;
              setIsReady(true);

              let previousTime = event.target.getCurrentTime();
              let previousRate = event.target.getPlaybackRate();
              let previousSample = Date.now();

              sampleTimer = window.setInterval(() => {
                const target = playerRef.current;
                if (!target) return;

                const now = Date.now();
                const nextTime = target.getCurrentTime();
                const nextRate = target.getPlaybackRate();
                const elapsed = (now - previousSample) / 1000;
                const expectedDelta = elapsed * previousRate;

                if (isHost && Math.abs(nextTime - previousTime) > 0.75 && Math.abs(nextTime - previousTime - expectedDelta) > 0.75 && now >= suppressEventsUntilRef.current) {
                  onControlRef.current("seek", nextTime, nextRate);
                }
                if (isHost && nextRate !== previousRate && now >= suppressEventsUntilRef.current) {
                  onControlRef.current("ratechange", nextTime, nextRate);
                }

                previousTime = nextTime;
                previousRate = nextRate;
                previousSample = now;
              }, 500);
            },
            onStateChange: (event) => {
              if (!isHost || Date.now() < suppressEventsUntilRef.current) return;
              if (event.data === api.PlayerState.PLAYING) {
                onControlRef.current("play", event.target.getCurrentTime(), event.target.getPlaybackRate());
              } else if (event.data === api.PlayerState.PAUSED || event.data === api.PlayerState.ENDED) {
                onControlRef.current("pause", event.target.getCurrentTime(), event.target.getPlaybackRate());
              }
            },
            onError: (event) => {
              const message =
                event.data === 5
                  ? "YouTube couldn't play this video in the embedded player. Try a video that allows embedding, or test another public video."
                  : `YouTube couldn't play this video (error ${event.data}).`;
              onErrorRef.current(message);
            },
          },
        });
      })
      .catch((error: unknown) => {
        if (!isDisposed) {
          onErrorRef.current(error instanceof Error ? error.message : "Could not initialize the YouTube player.");
        }
      });

    return () => {
      isDisposed = true;
      if (sampleTimer !== null) window.clearInterval(sampleTimer);
      playerRef.current = null;
      player?.destroy();
    };
  }, [isHost, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady || !sync) return;

    if (sync.action === "seek" || Math.abs(player.getCurrentTime() - sync.currentTime) > 1.5) {
      player.seekTo(sync.currentTime, true);
    }
    if (sync.speed && sync.action === "ratechange") {
      player.setPlaybackRate(sync.speed);
    }
    if (sync.action === "play") player.playVideo();
    if (sync.action === "pause") player.pauseVideo();
    suppressEventsUntilRef.current = Date.now() + 1000;
  }, [isReady, sync]);

  return <div aria-label={isHost ? "YouTube video player" : "Shared YouTube video"} className={`${styles.player} ${isHost ? "" : styles.viewer}`} ref={containerRef} />;
}
