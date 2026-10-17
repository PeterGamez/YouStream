"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  ApiError,
  apiRequest,
  clearTokens,
  getAccessToken,
  getSocketUrl,
} from "../../../lib/api";
import styles from "./page.module.css";

type Room = {
  id: number;
  hostId: number;
  title: string;
  roomCode: string;
  description: string;
  mediaType: "none" | "youtube" | "local_file";
  isPrivate: boolean;
  maxParticipants: number;
};

type ChatMessage = {
  id: string;
  senderId: number;
  senderName: string;
  message: string;
  createdAt: string;
};

type Participant = { userId: number; displayName: string; role: string };

type PlaybackState = {
  mediaType: "none" | "youtube" | "local_file";
  sourceUrl: string;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed?: number;
};

type RoomJoined = {
  roomInfo: Room;
  participants: Participant[];
  recentMessages: ChatMessage[];
  playbackState: PlaybackState;
};

type SocketError = { code?: string; message?: string };
type MediaUploadResponse = { mediaId: number; title: string; fileUrl: string };

function readUserId(token: string | null) {
  try {
    const encodedPayload = token?.split(".")[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"))) as { userId?: number };
    return typeof payload.userId === "number" ? payload.userId : null;
  } catch {
    return null;
  }
}

function extractYoutubeId(value: string) {
  return value.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)?.[1] ?? "";
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Connecting to room...");
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [mediaMode, setMediaMode] = useState<"youtube" | "upload">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaStatus, setMediaStatus] = useState("");
  const isHost = room?.hostId === currentUserId;

  useEffect(() => {
    let isCurrent = true;
    let activeSocket: Socket | null = null;

    async function joinRoom() {
      setCurrentUserId(readUserId(getAccessToken()));
      const roomId = Number(params.roomId);
      if (!Number.isInteger(roomId) || roomId <= 0) {
        setError("This room address is invalid.");
        setStatus("Unable to join");
        return;
      }

      try {
        const response = await apiRequest<{ room: Room }>(`/rooms/${roomId}`);
        if (!isCurrent) return;
        setRoom(response.room);

        const token = getAccessToken();
        if (!token) {
          clearTokens();
          router.replace("/login");
          return;
        }

        activeSocket = io(getSocketUrl(), {
          autoConnect: false,
          auth: { token },
        });
        socketRef.current = activeSocket;

        activeSocket.on("connect", () => {
          activeSocket?.emit("room:join", { roomId });
        });
        activeSocket.on("room:joined", (data: RoomJoined) => {
          setRoom(data.roomInfo);
          setMessages(data.recentMessages || []);
          setParticipants(data.participants || []);
          setParticipantCount(data.participants?.length ?? 0);
          setPlayback(data.playbackState);
          setYoutubeVideoId(extractYoutubeId(data.playbackState.sourceUrl || ""));
          setStatus("Connected");
          setError("");
        });
        activeSocket.on("room:user-joined", (participant: Participant) => {
          setParticipantCount((count) => count + 1);
          setParticipants((current) => current.some((item) => item.userId === participant.userId)
            ? current
            : [...current, participant]);
        });
        activeSocket.on("room:user-left", (participant: { userId: number }) => {
          setParticipantCount((count) => Math.max(0, count - 1));
          setParticipants((current) => current.filter((item) => item.userId !== participant.userId));
        });
        activeSocket.on("room:participant-updated", (update: { userId: number; role: string }) => {
          setParticipants((current) => current.map((participant) => participant.userId === update.userId
            ? { ...participant, role: update.role }
            : participant));
        });
        activeSocket.on("chat:new-message", (message: ChatMessage) => {
          setMessages((current) => [...current, message].slice(-100));
        });
        activeSocket.on("error", (socketError: SocketError) => {
          setError(socketError.message || "Unable to join this room.");
          setStatus("Unable to join");
          setMediaError(socketError.message || "Could not update the room video.");
          setMediaStatus("");
          setIsUploading(false);
        });
        activeSocket.on("video:update", (update: { sourceType: "youtube" | "local_file"; youtubeId?: string; fileUrl?: string; title?: string }) => {
          const sourceUrl = update.fileUrl || (update.youtubeId ? `https://www.youtube.com/watch?v=${update.youtubeId}` : "");
          setPlayback({
            mediaType: update.sourceType,
            sourceUrl,
            currentTime: 0,
            isPlaying: false,
            playbackSpeed: 1,
          });
          setYoutubeVideoId(update.youtubeId || extractYoutubeId(sourceUrl));
          setMediaStatus(update.title ? `Now playing: ${update.title}` : "Room video updated.");
          setMediaError("");
          setIsUploading(false);
        });
        activeSocket.on("video:sync", (sync: { action: "play" | "pause" | "seek" | "ratechange"; currentTime: number; speed?: number }) => {
          const video = videoRef.current;
          if (!video || !Number.isFinite(sync.currentTime)) return;
          if (sync.action === "seek" || Math.abs(video.currentTime - sync.currentTime) > 1.5) {
            video.currentTime = sync.currentTime;
          }
          if (sync.action === "ratechange" && sync.speed) video.playbackRate = sync.speed;
          if (sync.action === "play") void video.play().catch(() => {});
          if (sync.action === "pause") video.pause();
        });
        activeSocket.on("connect_error", () => {
          setError("Could not connect to the realtime server.");
          setStatus("Connection failed");
        });
        activeSocket.connect();
      } catch (joinError) {
        if (!isCurrent) return;
        if (joinError instanceof ApiError && joinError.status === 401) {
          clearTokens();
          router.replace("/login");
          return;
        }
        setError(
          joinError instanceof Error ? joinError.message : "Could not load this room.",
        );
        setStatus("Unable to join");
      }
    }

    void joinRoom();
    return () => {
      isCurrent = false;
      if (activeSocket?.connected) {
        activeSocket.emit("room:leave", { roomId: Number(params.roomId) });
      }
      activeSocket?.disconnect();
      socketRef.current = null;
    };
  }, [params.roomId, router]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !socketRef.current?.connected) return;
    socketRef.current.emit("chat:send", {
      roomId: Number(params.roomId),
      message,
    });
    setDraft("");
  }

  function submitYoutube(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const youtubeId = extractYoutubeId(youtubeUrl.trim());
    if (!youtubeId) {
      setMediaError("Enter a valid YouTube video URL.");
      setMediaStatus("");
      return;
    }
    if (!socketRef.current?.connected || !isHost) return;
    setMediaError("");
    setMediaStatus("Updating room video...");
    socketRef.current.emit("video:change", {
      roomId: Number(params.roomId),
      sourceType: "youtube",
      youtubeId,
      title: youtubeTitle.trim() || "YouTube video",
    });
  }

  async function uploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || !socketRef.current?.connected || !isHost) return;
    if (!["video/mp4", "video/webm"].includes(selectedFile.type)) {
      setMediaError("Choose an MP4 or WebM video.");
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      setMediaError("Video files must be 500 MB or smaller.");
      return;
    }

    setMediaError("");
    setMediaStatus("Uploading video...");
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const uploaded = await apiRequest<MediaUploadResponse>("/media/upload", {
        method: "POST",
        body: formData,
      });
      if (!socketRef.current?.connected) throw new Error("Connection lost after upload. Reopen the room and retry.");
      socketRef.current.emit("video:change", {
        roomId: Number(params.roomId),
        sourceType: "local_file",
        mediaId: uploaded.mediaId,
        title: uploaded.title,
      });
      setSelectedFile(null);
      setMediaStatus("Upload complete. Updating room video...");
    } catch (uploadError) {
      setMediaError(uploadError instanceof Error ? uploadError.message : "Could not upload this video.");
      setMediaStatus("");
      setIsUploading(false);
    }
  }

  function sendPlaybackControl(action: "play" | "pause" | "seek" | "ratechange", video: HTMLVideoElement) {
    if (!isHost || !socketRef.current?.connected) return;
    socketRef.current.emit("video:control", {
      roomId: Number(params.roomId),
      action,
      currentTime: video.currentTime,
      speed: video.playbackRate,
    });
  }

  const localVideoUrl = playback?.sourceUrl
    ? new URL(playback.sourceUrl, getSocketUrl()).toString()
    : "";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>y</span> YouStream
        </Link>
        <Link className={styles.backLink} href="/">
          &larr; Discover
        </Link>
      </header>

      <div className={styles.roomHeader}>
        <div>
          <p className={styles.eyebrow}>WATCH PARTY</p>
          <h1>{room?.title ?? "Loading room"}</h1>
          <p className={styles.roomMeta}>
            Room {room?.roomCode ?? "..."} <span /> {participantCount} here
          </p>
        </div>
        <span className={styles.connection}>
          <span className={status === "Connected" ? styles.connectionDot : styles.connectionDotMuted} />
          {status}
        </span>
      </div>

      {participants.length > 0 && (
        <section aria-label="Room participants" className={styles.participants}>
          <h2>Here now <span>{participants.length}</span></h2>
          <ul>
            {participants.map((participant) => (
              <li key={participant.userId}>
                <span className={styles.participantAvatar} aria-hidden="true">
                  {(participant.displayName || "?").slice(0, 1).toUpperCase()}
                </span>
                <span>{participant.displayName || "YouStream member"}</span>
                {participant.role === "host" && <span className={styles.hostBadge}>Host</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isHost && (
        <section aria-label="Host media controls" className={styles.hostControls}>
          <div className={styles.hostControlsHeading}>
            <div><p className={styles.eyebrow}>HOST CONTROLS</p><h2>Choose what to watch</h2></div>
            <div className={styles.mediaTabs} aria-label="Media source">
              <button aria-pressed={mediaMode === "youtube"} onClick={() => setMediaMode("youtube")} type="button">YouTube</button>
              <button aria-pressed={mediaMode === "upload"} onClick={() => setMediaMode("upload")} type="button">Upload</button>
            </div>
          </div>
          {mediaMode === "youtube" ? (
            <form className={styles.mediaForm} onSubmit={submitYoutube}>
              <label className={styles.visuallyHidden} htmlFor="youtube-url">YouTube video URL</label>
              <input id="youtube-url" onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Paste a YouTube link" type="url" value={youtubeUrl} />
              <label className={styles.visuallyHidden} htmlFor="youtube-title">Video title</label>
              <input id="youtube-title" onChange={(event) => setYoutubeTitle(event.target.value)} placeholder="Title (optional)" value={youtubeTitle} />
              <button disabled={!youtubeUrl.trim() || status !== "Connected"} type="submit">Play for room</button>
            </form>
          ) : (
            <form className={styles.mediaForm} onSubmit={uploadVideo}>
              <label className={styles.filePicker} htmlFor="room-video">{selectedFile?.name || "Choose MP4 or WebM (up to 500 MB)"}</label>
              <input accept="video/mp4,video/webm" className={styles.visuallyHidden} id="room-video" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} type="file" />
              <button disabled={!selectedFile || isUploading || status !== "Connected"} type="submit">{isUploading ? "Uploading..." : "Upload and play"}</button>
            </form>
          )}
          {mediaError && <p className={styles.error} role="alert">{mediaError}</p>}
          {mediaStatus && <p aria-live="polite" className={styles.mediaStatus}>{mediaStatus}</p>}
        </section>
      )}

      <div className={styles.workspace}>
        <section aria-label="Shared video" className={styles.player}>
          {playback?.mediaType === "local_file" && playback.sourceUrl ? (
            <video
              className={styles.video}
              controls={isHost}
              onPause={(event) => sendPlaybackControl("pause", event.currentTarget)}
              onPlay={(event) => sendPlaybackControl("play", event.currentTarget)}
              onRateChange={(event) => sendPlaybackControl("ratechange", event.currentTarget)}
              onSeeked={(event) => sendPlaybackControl("seek", event.currentTarget)}
              ref={videoRef}
              src={localVideoUrl}
            />
          ) : playback?.mediaType === "youtube" && youtubeVideoId ? (
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className={styles.video}
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}`}
              title={room?.title || "Shared YouTube video"}
            />
          ) : (
            <div className={styles.videoPlaceholder}>
              <span className={styles.playGlyph} aria-hidden="true">&#9654;</span>
              <p>Your shared screen will appear here.</p>
              <span className={styles.mediaHint}>
                {room?.mediaType === "none" ? "No video selected" : "Waiting for room state"}
              </span>
            </div>
          )}
        </section>

        <aside aria-label="Room chat" className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div>
              <h2>Room chat</h2>
              <p>{participantCount} in the room</p>
            </div>
            <span className={styles.chatLive}>LIVE</span>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <div aria-live="polite" className={styles.messageList}>
            {messages.length === 0 ? (
              <p className={styles.emptyChat}>Say hello to everyone in the room.</p>
            ) : (
              messages.map((message) => (
                <article className={styles.chatMessage} key={message.id}>
                  <div className={styles.messageMeta}>
                    <strong>{message.senderName || "YouStream member"}</strong>
                    <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                  <p>{message.message}</p>
                </article>
              ))
            )}
            <div ref={endOfMessagesRef} />
          </div>

          <form className={styles.chatForm} onSubmit={sendMessage}>
            <label className={styles.visuallyHidden} htmlFor="room-message">
              Message the room
            </label>
            <input
              disabled={status !== "Connected"}
              id="room-message"
              maxLength={1000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={status === "Connected" ? "Write a message..." : "Connecting..."}
              value={draft}
            />
            <button disabled={!draft.trim() || status !== "Connected"} type="submit">
              Send
            </button>
          </form>
        </aside>
      </div>
      {room?.isPrivate && (
        <p className={styles.privateNote}>This is a private room. A passcode is required to join as a viewer.</p>
      )}
    </main>
  );
}