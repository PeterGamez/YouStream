"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import SiteHeader from "../components/SiteHeader";
import { type Room, type RoomMediaType, createRoom as createRoomRequest, listActiveRooms } from "../features/rooms/api";
import { ApiError, clearTokens, hasSession } from "../lib/api";
import styles from "./page.module.css";

const categories = [
  { id: "all", label: "All rooms" },
  { id: "youtube", label: "YouTube" },
  { id: "local_file", label: "Uploaded" },
  { id: "none", label: "No video yet" },
] as const;

type RoomFilter = (typeof categories)[number]["id"];
const roomPosters: Record<RoomMediaType, string[]> = {
  none: ["/images/room-custom.png", "/images/room-music.png"],
  youtube: ["/images/room-series.jpg", "/images/room-music.png"],
  local_file: ["/images/room-film.jpg", "/images/room-series.jpg"],
};

function getRoomPoster(room: Room) {
  const posters = (room?.mediaType && roomPosters[room.mediaType]) || roomPosters.none;
  const index = Math.abs(Number(room?.id) || 0) % posters.length;
  return posters[index];
}

const mediaLabels: Record<RoomMediaType, string> = {
  none: "No video yet",
  youtube: "YouTube",
  local_file: "Uploaded video",
};

export default function Home() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomStatus, setRoomStatus] = useState<"loading" | "signed-out" | "error" | "ready">("loading");
  const [roomError, setRoomError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<RoomFilter>("all");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [roomPasscode, setRoomPasscode] = useState("");
  const [createError, setCreateError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if (event.key === "/" && !event.altKey && !event.ctrlKey && !event.metaKey && !isTypingTarget) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (isCreateOpen) {
      function handleDialogKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape" && !isSubmitting) {
          setIsCreateOpen(false);
        }
      }

      window.addEventListener("keydown", handleDialogKeyDown);
      return () => window.removeEventListener("keydown", handleDialogKeyDown);
    }

    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }, [isCreateOpen, isSubmitting]);

  useEffect(() => {
    let isCurrent = true;

    async function loadRooms() {
      if (!hasSession()) {
        setRoomStatus("signed-out");
        return;
      }

      setRoomStatus("loading");
      setRoomError("");
      try {
        const activeRooms = await listActiveRooms();
        if (!isCurrent) return;
        setRooms(activeRooms);
        setRoomStatus("ready");
      } catch (error) {
        if (!isCurrent) return;
        if (error instanceof ApiError && error.status === 401) {
          clearTokens();
          setRoomStatus("signed-out");
        } else {
          setRoomError(error instanceof Error ? error.message : "Could not load rooms.");
          setRoomStatus("error");
        }
      }
    }

    void loadRooms();
    return () => {
      isCurrent = false;
    };
  }, [reloadKey]);

  const filteredRooms = rooms.filter((room) => {
    const matchesCategory = activeCategory === "all" || room.mediaType === activeCategory;
    const normalizedSearch = search.trim().toLowerCase();
    const matchesSearch = [room.title, room.roomCode, room.host?.displayName].filter(Boolean).some((value) => (value || "").toLowerCase().includes(normalizedSearch));

    return matchesCategory && matchesSearch;
  });

  function openCreateRoom() {
    if (!hasSession()) {
      router.push("/login");
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreateError("");
    setRoomTitle("");
    setRoomVisibility("public");
    setRoomPasscode("");
    setIsCreateOpen(true);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = roomTitle.trim();
    if (!title) return;
    if (roomVisibility === "private" && roomPasscode.trim().length < 4) {
      setCreateError("Passcodes must contain at least 4 characters.");
      return;
    }

    setIsSubmitting(true);
    setCreateError("");
    try {
      const room = await createRoomRequest(title, {
        isPrivate: roomVisibility === "private",
        passcode: roomVisibility === "private" ? roomPasscode.trim() : undefined,
      });
      setIsCreateOpen(false);
      setRoomTitle("");
      setRoomPasscode("");
      router.push(`/room/${room.roomCode}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearTokens();
        router.push("/login");
        return;
      }
      setCreateError(error instanceof Error ? error.message : "Could not create the room.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <SiteHeader onCreateRoom={openCreateRoom} />

      <main id="top">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroImage} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>
              <span className={styles.liveDot} /> GOOD THINGS ARE BETTER TOGETHER
            </p>
            <h1 id="hero-title">
              Run videos
              <br />
              in sync with friends
              <br />
              <span>Share a moment.</span>
            </h1>
            <p className={styles.heroDescription}>Press play together.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} onClick={openCreateRoom} type="button">
                Start a room <span aria-hidden="true">&rarr;</span>
              </button>
              <a className={styles.textButton} href="#rooms">
                Browse rooms <span aria-hidden="true">&darr;</span>
              </a>
            </div>
          </div>
          <div className={styles.heroCaption}>
            <span className={styles.captionLine} />
            <span>The living room</span>
          </div>
          <div className={styles.heroIndex} aria-hidden="true">
            01 <span>/</span> 03
          </div>
        </section>

        <section className={styles.roomsSection} id="rooms">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>THE COMMUNITY LOUNGE</p>
              <h2>Find your next watch party</h2>
            </div>
            <label className={styles.searchBox}>
              <span className={styles.searchIcon} aria-hidden="true" />
              <span className={styles.srOnly}>Search rooms</span>
              <input ref={searchInputRef} onChange={(event) => setSearch(event.target.value)} placeholder="Search rooms or hosts" type="search" value={search} />
              <kbd className={styles.searchShortcut} aria-hidden="true">
                /
              </kbd>
            </label>
          </div>

          <div className={styles.roomToolbar}>
            <div className={styles.categoryTabs} aria-label="Filter rooms">
              {categories.map((category) => (
                <button
                  aria-pressed={activeCategory === category.id}
                  className={activeCategory === category.id ? styles.categoryActive : ""}
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  type="button">
                  {category.label}
                </button>
              ))}
            </div>
            {roomStatus === "ready" && (
              <span className={styles.roomCount} aria-live="polite">
                <span className={styles.liveDot} />
                {filteredRooms.length === rooms.length ? `${rooms.length} active ${rooms.length === 1 ? "room" : "rooms"}` : `${filteredRooms.length} of ${rooms.length} active rooms`}
              </span>
            )}
          </div>

          {roomStatus === "loading" ? (
            <div className={styles.emptyState} aria-live="polite">
              <p>Loading active rooms...</p>
            </div>
          ) : roomStatus === "signed-out" ? (
            <div className={styles.emptyState}>
              <p>Sign in to browse active rooms and start a watch party.</p>
              <Link className={styles.emptyLink} href="/login">
                Sign in or create account <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          ) : roomStatus === "error" ? (
            <div className={styles.emptyState} role="alert">
              <p>{roomError || "Could not load active rooms."}</p>
              <button onClick={() => setReloadKey((key) => key + 1)} type="button">
                Try again
              </button>
            </div>
          ) : filteredRooms.length > 0 ? (
            <div className={styles.roomGrid}>
              {filteredRooms.map((room, index) => (
                <article className={styles.roomCard} key={room.id}>
                  <div className={styles.roomPoster} style={{ backgroundImage: `url("${getRoomPoster(room)}")` }}>
                    <span className={styles.roomCategory}>{mediaLabels[room.mediaType]}</span>
                    <span className={styles.viewerCount}>
                      <span className={styles.viewerIcon} aria-hidden="true" />
                      {room.participantCount ?? 0} watching
                    </span>
                    <span className={styles.posterIndex}>0{index + 1}</span>
                  </div>
                  <div className={styles.roomDetails}>
                    <div>
                      <h3>{room.title}</h3>
                      <p>
                        Hosted by {room.host?.displayName ?? "YouStream member"}
                        {room.isPrivate ? " · Private" : ""}
                      </p>
                    </div>
                    <Link aria-label={`Join ${room.title}`} className={styles.joinButton} href={`/room/${room.roomCode}`}>
                      <span aria-hidden="true">&rarr;</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : search.trim() ? (
            <div className={styles.emptyState}>
              <p>No rooms match that search.</p>
              <button onClick={() => setSearch("")} type="button">
                Clear search
              </button>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyMark} aria-hidden="true">
                +
              </span>
              <p>No one is watching together right now.</p>
              <button onClick={openCreateRoom} type="button">
                Start the first room
              </button>
            </div>
          )}
        </section>

        <section className={styles.aboutSection} id="about">
          <span className={styles.aboutNumber}>A BETTER WAY TO PRESS PLAY</span>
          <p>The best part isn&apos;t just what you&apos;re watching. It&apos;s who you&apos;re watching with.</p>
          <button onClick={openCreateRoom} type="button">
            Make it a moment <span aria-hidden="true">&rarr;</span>
          </button>
        </section>
      </main>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top">
          <span className={styles.brandMark}>y</span>
          <span>YouStream</span>
        </a>
        <span>Watch close, even from far away.</span>
        <span className={styles.footerYear}>2026</span>
      </footer>

      {isCreateOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (!isSubmitting && event.target === event.currentTarget) {
              setIsCreateOpen(false);
            }
          }}>
          <section aria-describedby="create-description" aria-labelledby="create-title" aria-modal="true" className={styles.modal} role="dialog">
            <button aria-label="Close dialog" className={styles.modalClose} disabled={isSubmitting} onClick={() => setIsCreateOpen(false)} type="button">
              &times;
            </button>
            <p className={styles.sectionEyebrow}>MAKE A LITTLE SPACE</p>
            <h2 id="create-title">Start a room</h2>
            <p className={styles.modalDescription} id="create-description">
              Give your watch party a name. It will be saved to your account.
            </p>
            <form onSubmit={createRoom}>
              <label className={styles.fieldLabel} htmlFor="room-title">
                Room name
              </label>
              <input
                autoFocus
                className={styles.roomTitleInput}
                id="room-title"
                maxLength={80}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder="Type a name for your room"
                required
                value={roomTitle}
              />

              <fieldset className={styles.visibilityFieldset}>
                <legend className={styles.fieldLabel}>Room access</legend>
                <div className={styles.visibilityOptions}>
                  <label className={roomVisibility === "public" ? styles.visibilityOptionActive : styles.visibilityOption}>
                    <input checked={roomVisibility === "public"} name="room-visibility" onChange={() => setRoomVisibility("public")} type="radio" value="public" />
                    <span>
                      <strong>Public</strong>
                      <small>Anyone in the lobby can join</small>
                    </span>
                  </label>
                  <label className={roomVisibility === "private" ? styles.visibilityOptionActive : styles.visibilityOption}>
                    <input checked={roomVisibility === "private"} name="room-visibility" onChange={() => setRoomVisibility("private")} type="radio" value="private" />
                    <span>
                      <strong>Passcode protected</strong>
                      <small>Viewers need a passcode</small>
                    </span>
                  </label>
                </div>
              </fieldset>

              {roomVisibility === "private" && (
                <>
                  <label className={styles.fieldLabel} htmlFor="room-passcode">
                    Passcode
                  </label>
                  <input
                    className={styles.roomTitleInput}
                    id="room-passcode"
                    minLength={4}
                    onChange={(event) => setRoomPasscode(event.target.value)}
                    placeholder="At least 4 characters"
                    required
                    type="password"
                    value={roomPasscode}
                  />
                </>
              )}

              {createError && (
                <p className={styles.formError} role="alert">
                  {createError}
                </p>
              )}
              <div className={styles.modalActions}>
                <button className={styles.cancelButton} disabled={isSubmitting} onClick={() => setIsCreateOpen(false)} type="button">
                  Cancel
                </button>
                <button className={styles.primaryButton} disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Creating..." : "Create room"}
                  {!isSubmitting && <span aria-hidden="true">&rarr;</span>}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
