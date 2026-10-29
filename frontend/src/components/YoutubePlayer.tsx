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
  getPlayerState: () => number;
  isMuted: () => boolean;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  unMute: () => void;
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YoutubePlayerInstance | null>(null);
  const onControlRef = useRef(onControl);
  const onErrorRef = useRef(onError);
  const initialPlaybackRef = useRef({ currentTime, isPlaying, playbackSpeed });
  const suppressEventsUntilRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingState, setIsPlayingState] = useState(isPlaying);

  useEffect(() => {
    onControlRef.current = onControl;
    onErrorRef.current = onError;
    initialPlaybackRef.current = { currentTime, isPlaying, playbackSpeed };
  });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const targetDiv = document.createElement("div");
    targetDiv.className = styles.playerTarget;
    wrapper.appendChild(targetDiv);

    let isDisposed = false;
    let player: YoutubePlayerInstance | null = null;
    let sampleTimer: number | null = null;
    setIsReady(false);

    void loadYoutubeApi()
      .then((api) => {
        if (isDisposed) return;

        player = new api.Player(targetDiv, {
          videoId,
          playerVars: {
            autoplay: isHost ? 0 : 1,
            controls: isHost ? 1 : 0,
            disablekb: isHost ? 0 : 1,
            enablejsapi: 1,
            fs: isHost ? 1 : 0,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
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
                setIsPlayingState(true);
                try {
                  event.target.playVideo();
                } catch {
                  if (typeof event.target.mute === "function") {
                    event.target.mute();
                    event.target.playVideo();
                    setIsMuted(true);
                  }
                }
              } else {
                setIsPlayingState(false);
                event.target.pauseVideo();
              }

              // Fallback for viewers if browser blocked unmuted autoplay
              if (!isHost && initial.isPlaying) {
                window.setTimeout(() => {
                  const target = playerRef.current;
                  if (!target || isDisposed) return;
                  try {
                    const state = target.getPlayerState();
                    if (state !== api.PlayerState.PLAYING && typeof target.mute === "function") {
                      target.mute();
                      target.playVideo();
                      setIsMuted(true);
                    }
                  } catch {
                    // ignore
                  }
                }, 800);
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
              if (event.data === api.PlayerState.PLAYING) {
                setIsPlayingState(true);
              } else if (event.data === api.PlayerState.PAUSED || event.data === api.PlayerState.ENDED) {
                setIsPlayingState(false);
              }

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
      try {
        player?.destroy();
      } catch {
        // ignore
      }
      targetDiv.remove();
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
    if (sync.action === "play") {
      try {
        player.playVideo();
      } catch {
        if (typeof player.mute === "function") {
          player.mute();
          player.playVideo();
          setIsMuted(true);
        }
      }
    }
    if (sync.action === "pause") {
      player.pauseVideo();
    }
    suppressEventsUntilRef.current = Date.now() + 1000;
  }, [isReady, sync]);

  function handleUnmute() {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.unMute();
      setIsMuted(false);
    } catch {
      // ignore
    }
  }

  function handleOverlayClick() {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) {
      handleUnmute();
    }
    if (initialPlaybackRef.current.isPlaying && !isPlayingState) {
      try {
        player.playVideo();
      } catch {
        // ignore
      }
    }
  }

  return (
    <div aria-label={isHost ? "YouTube video player" : "Shared YouTube video"} className={`${styles.container} ${isHost ? styles.hostContainer : styles.cleanViewerContainer}`}>
      <div className={styles.playerWrapper} ref={wrapperRef} />

      {!isHost && (
        <div className={styles.viewerOverlay} onClick={handleOverlayClick}>
          {isMuted && (
            <button
              className={styles.unmuteButton}
              onClick={(event) => {
                event.stopPropagation();
                handleUnmute();
              }}
              type="button">
              <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="15">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <span>แตะเพื่อเปิดเสียง</span>
            </button>
          )}

          {!isPlayingState && (
            <div className={styles.pauseCard}>
              <div className={styles.pauseBadge}>
                <span className={styles.pauseDot} />
                <span>ผู้สร้างห้องหยุดวิดีโอ</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
