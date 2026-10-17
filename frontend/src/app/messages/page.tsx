"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import SiteHeader from "../../components/SiteHeader";
import { listActiveRooms, type Room } from "../../features/rooms/api";
import { ApiError, clearTokens, getAccessToken, getSocketUrl, hasSession } from "../../lib/api";
import styles from "./page.module.css";

type ChatMessage = {
  id: string;
  senderId: number;
  senderName: string;
  message: string;
  createdAt: string;
};

type SocketError = { code?: string; message?: string };

export default function MessagesPage() {
  const socketRef = useRef<Socket | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Choose a room");
  const [error, setError] = useState("");
  const activeRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;

  useEffect(() => {
    let isCurrent = true;

    async function loadRooms() {
      if (!hasSession()) {
        setSignedOut(true);
        setLoading(false);
        return;
      }

      try {
        const activeRooms = await listActiveRooms();
        if (!isCurrent) return;
        const publicRooms = activeRooms.filter((room) => !room.isPrivate);
        setRooms(publicRooms);
        setSelectedRoomId(publicRooms[0]?.id ?? null);
      } catch (loadError) {
        if (!isCurrent) return;
        if (loadError instanceof ApiError && loadError.status === 401) {
          clearTokens();
          setSignedOut(true);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Could not load active rooms.");
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    }

    void loadRooms();
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    if (!activeRoom) {
      setMessages([]);
      setConnected(false);
      setConnectionStatus("Choose a room");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSignedOut(true);
      return;
    }

    let isCurrent = true;
    const socket = io(getSocketUrl(), { autoConnect: false, auth: { token } });
    socketRef.current = socket;
    setMessages([]);
    setConnected(false);
    setConnectionStatus("Connecting...");
    setError("");

    socket.on("connect", () => socket.emit("room:join", { roomId: activeRoom.id }));
    socket.on("room:joined", (data: { recentMessages?: ChatMessage[] }) => {
      if (!isCurrent) return;
      setMessages(data.recentMessages ?? []);
      setConnected(true);
      setConnectionStatus("Connected");
      setError("");
    });
    socket.on("chat:new-message", (message: ChatMessage) => {
      if (!isCurrent) return;
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message].slice(-100));
    });
    socket.on("error", (socketError: SocketError) => {
      if (!isCurrent) return;
      setError(socketError.message || "Could not join this room.");
      if (socketError.code !== "CHAT_RATE_LIMIT") {
        setConnected(false);
        setConnectionStatus("Unable to join");
      }
    });
    socket.on("chat:error", (chatError: { message?: string }) => {
      if (isCurrent) setError(chatError.message || "Could not send the message.");
    });
    socket.on("room:ended", () => {
      if (!isCurrent) return;
      setConnected(false);
      setConnectionStatus("Room ended");
      setError("This room has ended.");
    });
    socket.on("connect_error", () => {
      if (!isCurrent) return;
      setConnected(false);
      setConnectionStatus("Connection failed");
      setError("Could not connect to the realtime server.");
    });
    socket.connect();

    return () => {
      isCurrent = false;
      if (socket.connected) socket.emit("room:leave", { roomId: activeRoom.id });
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [activeRoom]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !activeRoom || !connected || !socketRef.current?.connected) return;
    socketRef.current.emit("chat:send", { roomId: activeRoom.id, message });
    setDraft("");
    setError("");
  }

  return (
    <div className={styles.page}>
      <SiteHeader activePage="messages" />

      <main className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.headingRow}>
            <div>
              <p className={styles.eyebrow}>LIVE ROOM CHAT</p>
              <h1>Room conversations</h1>
            </div>
            <Link aria-label="Browse rooms" className={styles.browseLink} href="/#rooms" title="Browse rooms">+</Link>
          </div>

          <div className={styles.list}>
            {loading ? <p className={styles.stateText}>Loading active rooms...</p> : null}
            {!loading && signedOut ? (
              <div className={styles.stateBlock}><p>Sign in to see live room chats.</p><Link href="/login">Sign in</Link></div>
            ) : null}
            {!loading && !signedOut && error && rooms.length === 0 ? <p className={styles.stateText} role="alert">{error}</p> : null}
            {!loading && !signedOut && !error && rooms.length === 0 ? (
              <div className={styles.stateBlock}><p>No public rooms are live right now.</p><Link href="/#rooms">Browse rooms</Link></div>
            ) : null}
            {rooms.map((room) => (
              <button
                aria-pressed={selectedRoomId === room.id}
                className={`${styles.conversation} ${selectedRoomId === room.id ? styles.selectedConversation : ""}`}
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                type="button"
              >
                <span className={styles.roomIcon} aria-hidden="true">{room.title.slice(0, 1).toUpperCase()}</span>
                <span className={styles.meta}>
                  <span className={styles.row}><strong>{room.title}</strong><span>{room.participantCount ?? 0} here</span></span>
                  <span className={styles.roomHost}>Hosted by {room.host?.displayName || "YouStream member"}</span>
                </span>
                <span className={styles.liveDot} aria-label="Live" />
              </button>
            ))}
          </div>
          <p className={styles.sidebarFooter}>Messages are shared with everyone in the room.</p>
        </aside>

        <section aria-label="Room chat" className={styles.chatPanel}>
          {activeRoom ? (
            <>
              <div className={styles.chatHeader}>
                <div>
                  <p className={styles.chatLabel}>LIVE ROOM CHAT</p>
                  <h2>{activeRoom.title}</h2>
                  <p className={styles.roomDetails}>Hosted by {activeRoom.host?.displayName || "YouStream member"} · {activeRoom.participantCount ?? 0} in room</p>
                </div>
                <div className={styles.headerActions}>
                  <span className={connected ? styles.connected : styles.connection}>{connectionStatus}</span>
                  <Link href={`/room/${activeRoom.id}`} title="Open this watch room">Open room</Link>
                </div>
              </div>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <div aria-live="polite" className={styles.messages}>
                {messages.length === 0 ? <p className={styles.emptyChat}>No messages yet. Say hello to everyone in the room.</p> : messages.map((message) => (
                  <article className={styles.message} key={message.id}>
                    <div className={styles.messageMeta}>
                      <strong>{message.senderName || "YouStream member"}</strong>
                      <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    </div>
                    <p>{message.message}</p>
                  </article>
                ))}
              </div>
              <form className={styles.inputRow} onSubmit={sendMessage}>
                <label className={styles.visuallyHidden} htmlFor="room-message">Message the room</label>
                <input autoComplete="off" disabled={!connected} id="room-message" maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder={connected ? "Write a message to the room..." : "Connecting to room..."} value={draft} />
                <button disabled={!draft.trim() || !connected} type="submit">Send</button>
              </form>
            </>
          ) : (
            <div className={styles.noSelection}>
              <span className={styles.noSelectionMark} aria-hidden="true">···</span>
              <h2>{signedOut ? "Sign in to join the conversation" : "No live room selected"}</h2>
              <p>Choose an active room to read and send messages with its participants.</p>
              <Link href={signedOut ? "/login" : "/#rooms"}>{signedOut ? "Sign in" : "Browse rooms"}</Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
