"use client";

import Link from "next/link";
import styles from "./SiteHeader.module.css";

type SiteHeaderProps = {
  activePage: "discover" | "notifications" | "messages";
  onCreateRoom?: () => void;
};

export default function SiteHeader({
  activePage,
  onCreateRoom,
}: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="YouStream home">
        <span className={styles.brandMark}>y</span>
        <span>YouStream</span>
      </Link>

      <nav className={styles.nav} aria-label="Main navigation">
        <Link
          className={activePage === "discover" ? styles.activeLink : ""}
          href="/#rooms"
        >
          Discover
        </Link>
        <Link
          className={activePage === "messages" ? styles.activeLink : ""}
          href="/messages"
        >
          Messages
        </Link>
        <Link
          className={activePage === "notifications" ? styles.activeLink : ""}
          href="/notifications"
        >
          Notifications
        </Link>
      </nav>

      <div className={styles.actions}>
        <Link className={styles.signInLink} href="/login">
          Sign in
        </Link>
        <Link
          aria-label="Messages"
          className={styles.messagesButton}
          href="/messages"
        >
          <span aria-hidden="true">&#9993;</span>
          <span className={styles.messagesLabel}>Messages</span>
        </Link>
        {onCreateRoom && (
          <button
            className={styles.createButton}
            onClick={onCreateRoom}
            type="button"
          >
            <span aria-hidden="true">+</span> Create room
          </button>
        )}
      </div>
    </header>
  );
}