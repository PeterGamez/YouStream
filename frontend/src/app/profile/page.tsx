"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import SiteHeader from "../../components/SiteHeader";
import { ApiError, PROFILE_CHANGE_EVENT, apiRequest, clearTokens, getAccessToken, hasSession } from "../../lib/api";
import styles from "./page.module.css";

type UserProfile = {
  id?: number;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role?: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let isCurrent = true;

    async function loadProfile() {
      if (!hasSession()) {
        router.replace("/login");
        return;
      }

      try {
        const user = await apiRequest<UserProfile>("/users/me");
        if (!isCurrent) return;
        setProfile(user);
        setDisplayName(user.displayName);
        setAvatarUrl(user.avatarUrl || "");
        setAvatarImgFailed(false);
        setStatus("ready");
      } catch (loadError) {
        if (!isCurrent) return;
        if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 404)) {
          clearTokens();
          router.replace("/login");
          return;
        }
        if (!getAccessToken()) {
          router.replace("/login");
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "We couldn't load your profile.");
        setStatus("ready");
      }
    }

    void loadProfile();
    return () => {
      isCurrent = false;
    };
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    const trimmedAvatar = avatarUrl.trim();

    if (!trimmedName) {
      setError("Please enter a display name.");
      return;
    }

    setStatus("saving");
    setError("");
    setNotice("");
    try {
      await apiRequest("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: trimmedName,
          avatarUrl: trimmedAvatar || undefined,
        }),
      });
      setProfile((current) =>
        current
          ? {
              ...current,
              displayName: trimmedName,
              avatarUrl: trimmedAvatar || current.avatarUrl,
            }
          : current
      );
      setDisplayName(trimmedName);
      setNotice("Your changes have been saved.");
      window.dispatchEvent(new Event(PROFILE_CHANGE_EVENT));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We couldn't save your changes.");
    } finally {
      setStatus("ready");
    }
  }

  function signOut() {
    clearTokens();
    router.replace("/login");
  }

  const activeAvatarSrc = avatarUrl.trim() || profile?.avatarUrl;
  const isUnchanged = profile !== null && displayName.trim() === profile.displayName && avatarUrl.trim() === (profile.avatarUrl || "").trim();

  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.main}>
        <Link className={styles.backLink} href="/">
          &larr; Back to rooms
        </Link>
        <section className={styles.panel}>
          <p className={styles.eyebrow}>YOUR PROFILE</p>
          <h1>Your profile</h1>
          <p className={styles.subtitle}>Choose the name and picture people see when you watch together.</p>

          {status === "loading" ? (
            <p className={styles.state} aria-live="polite">
              Loading your profile...
            </p>
          ) : profile ? (
            <>
              <div className={styles.accountDetails}>
                <div className={styles.avatarWrapper}>
                  {activeAvatarSrc && !avatarImgFailed ? (
                    <img alt={displayName || profile.displayName} className={styles.avatarImage} onError={() => setAvatarImgFailed(true)} src={activeAvatarSrc} />
                  ) : (
                    <div className={styles.avatarFallback} aria-hidden="true">
                      {(displayName || profile.displayName || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <strong>{displayName || profile.displayName}</strong>
                  <span>@{profile.username}</span>
                </div>
              </div>

              <form className={styles.form} onSubmit={saveProfile}>
                <label htmlFor="profile-display-name">Display name</label>
                <input autoComplete="name" id="profile-display-name" maxLength={100} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />

                <label htmlFor="profile-avatar-url">Profile picture URL (Avatar)</label>
                <input
                  autoComplete="url"
                  id="profile-avatar-url"
                  maxLength={500}
                  onChange={(event) => {
                    setAvatarUrl(event.target.value);
                    setAvatarImgFailed(false);
                  }}
                  placeholder="https://example.com/your-avatar.jpg"
                  type="url"
                  value={avatarUrl}
                />
                <span className={styles.inputHelp}>Enter a direct image link (JPG, PNG, WebP) or leave empty for default Gravatar.</span>

                <label htmlFor="profile-email">Email address</label>
                <input id="profile-email" readOnly value={profile.email} />

                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className={styles.notice} role="status">
                    {notice}
                  </p>
                )}
                <button disabled={status === "saving" || isUnchanged} type="submit">
                  {status === "saving" ? "Saving..." : "Save changes"}
                </button>
              </form>
              <button className={styles.signOutButton} onClick={signOut} type="button">
                Sign out
              </button>
            </>
          ) : (
            <div className={styles.state}>
              <p>{error || "We couldn't load your profile."}</p>
              <button onClick={() => window.location.reload()} type="button">
                Try again
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
