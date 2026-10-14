"use client";

import { useState, type FormEvent } from "react";
import styles from "./page.module.css";

type Room = {
  id: string;
  title: string;
  host: string;
  category: string;
  viewers: number;
  poster: string;
  code: string;
};

const initialRooms: Room[] = [
  {
    id: "room-1",
    title: "Late night cinema club",
    host: "Mina",
    category: "Film",
    viewers: 8,
    poster:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1000&q=85",
    code: "MOVIE042",
  },
  {
    id: "room-2",
    title: "Tiny desk discoveries",
    host: "Jordan",
    category: "Music",
    viewers: 5,
    poster:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=85",
    code: "MUSIC108",
  },
  {
    id: "room-3",
    title: "One more episode",
    host: "Sam",
    category: "Series",
    viewers: 12,
    poster:
      "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1000&q=85",
    code: "SERIES221",
  },
];

const categories = ["All rooms", "Film", "Music", "Series"];

export default function Home() {
  const [rooms, setRooms] = useState(initialRooms);
  const [activeCategory, setActiveCategory] = useState("All rooms");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const [notice, setNotice] = useState("");

  const filteredRooms = rooms.filter((room) => {
    const matchesCategory =
      activeCategory === "All rooms" || room.category === activeCategory;
    const matchesSearch = `${room.title} ${room.host}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());

    return matchesCategory && matchesSearch;
  });

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = roomTitle.trim();
    if (!title) return;

    const room: Room = {
      id: `room-${Date.now()}`,
      title,
      host: "You",
      category: "Film",
      viewers: 1,
      poster:
        "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1000&q=85",
      code: Math.random().toString(36).slice(2, 10).toUpperCase(),
    };

    setRooms((currentRooms) => [room, ...currentRooms]);
    setActiveCategory("All rooms");
    setSearch("");
    setRoomTitle("");
    setIsCreateOpen(false);
    setNotice(`"${title}" is ready as a local preview. Backend room creation comes next.`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="YouStream home">
          <span className={styles.brandMark}>y</span>
          <span>YouStream</span>
        </a>
        <nav className={styles.nav} aria-label="Main navigation">
          <a className={styles.navActive} href="#rooms">
            Discover
          </a>
          <a href="#about">About</a>
        </nav>
        <button
          className={styles.headerAction}
          onClick={() => setIsCreateOpen(true)}
          type="button"
        >
          <span aria-hidden="true">+</span> Create room
        </button>
      </header>

      <main id="top">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroImage} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>
              <span className={styles.liveDot} /> GOOD THINGS ARE BETTER TOGETHER
            </p>
            <h1 id="hero-title">
              Your videos.
              <br />
              Your people.
              <br />
              <span>One shared moment.</span>
            </h1>
            <p className={styles.heroDescription}>
              Press play together, wherever life has you. Find your people and
              make tonight a little more memorable.
            </p>
            <div className={styles.heroActions}>
              <button
                className={styles.primaryButton}
                onClick={() => setIsCreateOpen(true)}
                type="button"
              >
                Start a room <span aria-hidden="true">&rarr;</span>
              </button>
              <a className={styles.textButton} href="#rooms">
                Browse rooms <span aria-hidden="true">&darr;</span>
              </a>
            </div>
          </div>
          <div className={styles.heroCaption}>
            <span className={styles.captionLine} />
            <span>THE LIVING ROOM, REIMAGINED</span>
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
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rooms or hosts"
                type="search"
                value={search}
              />
              <span className={styles.searchShortcut}>/</span>
            </label>
          </div>

          <div className={styles.roomToolbar}>
            <div className={styles.categoryTabs} aria-label="Filter rooms">
              {categories.map((category) => (
                <button
                  aria-pressed={activeCategory === category}
                  className={
                    activeCategory === category ? styles.categoryActive : ""
                  }
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  type="button"
                >
                  {category}
                </button>
              ))}
            </div>
            <span className={styles.roomCount}>
              <span className={styles.liveDot} /> {filteredRooms.length} sample rooms
            </span>
          </div>

          {filteredRooms.length > 0 ? (
            <div className={styles.roomGrid}>
              {filteredRooms.map((room, index) => (
                <article className={styles.roomCard} key={room.id}>
                  <div
                    className={styles.roomPoster}
                    style={{ backgroundImage: `url("${room.poster}")` }}
                  >
                    <span className={styles.roomCategory}>{room.category}</span>
                    <span className={styles.viewerCount}>
                      <span className={styles.viewerIcon} aria-hidden="true" />
                      {room.viewers} watching
                    </span>
                    <span className={styles.posterIndex}>0{index + 1}</span>
                  </div>
                  <div className={styles.roomDetails}>
                    <div>
                      <h3>{room.title}</h3>
                      <p>Hosted by {room.host}</p>
                    </div>
                    <button
                      aria-label={`Preview ${room.title}`}
                      className={styles.joinButton}
                      onClick={() =>
                        setNotice(
                          `Room ${room.code} is a sample. Room joining will connect when the watch page is added.`,
                        )
                      }
                      type="button"
                    >
                      <span aria-hidden="true">&rarr;</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyMark} aria-hidden="true">
                ?
              </span>
              <p>No rooms match that search.</p>
              <button onClick={() => setSearch("")} type="button">
                Clear search
              </button>
            </div>
          )}
        </section>

        <section className={styles.aboutSection} id="about">
          <span className={styles.aboutNumber}>A BETTER WAY TO PRESS PLAY</span>
          <p>
            The best part isn&apos;t just what you&apos;re watching. It&apos;s who
            you&apos;re watching with.
          </p>
          <button onClick={() => setIsCreateOpen(true)} type="button">
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

      {notice && (
        <div className={styles.notice} role="status">
          <p>{notice}</p>
          <button
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
            type="button"
          >
            &times;
          </button>
        </div>
      )}

      {isCreateOpen && (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsCreateOpen(false);
          }}
        >
          <section
            aria-labelledby="create-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <button
              aria-label="Close dialog"
              className={styles.modalClose}
              onClick={() => setIsCreateOpen(false)}
              type="button"
            >
              &times;
            </button>
            <p className={styles.sectionEyebrow}>MAKE A LITTLE SPACE</p>
            <h2 id="create-title">Start a room</h2>
            <p className={styles.modalDescription}>
              Give your watch party a name. This creates a local preview for now.
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
                placeholder="Friday night films"
                required
                value={roomTitle}
              />
              <div className={styles.modalActions}>
                <button
                  className={styles.cancelButton}
                  onClick={() => setIsCreateOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button className={styles.primaryButton} type="submit">
                  Create preview <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
