"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, PROFILE_CHANGE_EVENT, SESSION_CHANGE_EVENT, apiRequest, clearTokens, hasSession } from "../lib/api";
import styles from "./SiteHeader.module.css";

type SiteHeaderProps = {
  onCreateRoom?: () => void;
};

type CurrentUser = {
  displayName: string;
  avatarUrl?: string;
};

export default function SiteHeader({ onCreateRoom }: SiteHeaderProps) {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const updateSession = () => {
      const signedIn = hasSession();
      setIsSignedIn(signedIn);

      if (!signedIn) {
        setProfileName("");
        setProfileAvatar("");
        setAvatarError(false);
        return;
      }

      void apiRequest<CurrentUser>("/users/me")
        .then((user) => {
          if (isCurrent) {
            setProfileName(user.displayName);
            setProfileAvatar(user.avatarUrl || "");
            setAvatarError(false);
          }
        })
        .catch((error: unknown) => {
          if (!isCurrent) return;
          if (error instanceof ApiError && error.status === 401) {
            clearTokens();
            return;
          }
          setProfileName("");
          setProfileAvatar("");
        });
    };

    updateSession();
    window.addEventListener("storage", updateSession);
    window.addEventListener(SESSION_CHANGE_EVENT, updateSession);
    window.addEventListener(PROFILE_CHANGE_EVENT, updateSession);
    return () => {
      isCurrent = false;
      window.removeEventListener("storage", updateSession);
      window.removeEventListener(SESSION_CHANGE_EVENT, updateSession);
      window.removeEventListener(PROFILE_CHANGE_EVENT, updateSession);
    };
  }, []);

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="YouStream home">
        <span className={styles.brandMark}>y</span>
        <span>YouStream</span>
      </Link>

      {(isSignedIn !== null || onCreateRoom) && (
        <div className={styles.actions}>
          {isSignedIn === false && (
            <Link className={styles.signInLink} href="/login">
              Sign in
            </Link>
          )}
          {isSignedIn === true && (
            <Link aria-label="Edit profile" className={styles.profileLink} href="/profile">
              <span aria-hidden="true" className={styles.profileAvatar}>
                {profileAvatar && !avatarError ? (
                  <img
                    alt=""
                    onError={() => setAvatarError(true)}
                    src={profileAvatar}
                  />
                ) : (
                  (profileName || "P").slice(0, 1).toUpperCase()
                )}
              </span>
              <span>{profileName || "Profile"}</span>
            </Link>
          )}
          {onCreateRoom && (
            <button className={styles.createButton} onClick={onCreateRoom} type="button">
              <span aria-hidden="true">+</span> Create room
            </button>
          )}
        </div>
      )}
    </header>
  );
}
