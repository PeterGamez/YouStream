"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiRequest, saveTokens } from "../../lib/api";
import styles from "./page.module.css";

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
};

type FormMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<FormMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, email, password, displayName }),
        });

        setMode("login");
        setEmail("");
        setDisplayName("");
        setPassword("");
        setIsSubmitting(false);
        return;
      }

      const tokens = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      saveTokens(tokens);
      router.replace("/");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to connect. Check the backend and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.brand} href="/">
        <span className={styles.brandMark}>y</span> YouStream
      </Link>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>YOUR PEOPLE ARE HERE</p>
        <h1>{mode === "login" ? "Welcome back" : "Join YouStream"}</h1>
        <p className={styles.subtitle}>
          {mode === "login"
            ? "Sign in to find your watch parties."
            : "Create an account to start watching together."}
        </p>

        <div className={styles.modeSwitch} role="tablist" aria-label="Account action">
          <button
            aria-selected={mode === "login"}
            onClick={() => setMode("login")}
            role="tab"
            type="button"
          >
            Sign in
          </button>
          <button
            aria-selected={mode === "register"}
            onClick={() => setMode("register")}
            role="tab"
            type="button"
          >
            Create account
          </button>
        </div>

        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input
            autoComplete="username"
            id="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />

          {mode === "register" && (
            <>
              <label htmlFor="display-name">Display name</label>
              <input
                autoComplete="name"
                id="display-name"
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
              <label htmlFor="email">Email</label>
              <input
                autoComplete="email"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </>
          )}

          <label htmlFor="password">Password</label>
          <input
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submitButton} disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Connecting..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
            {!isSubmitting && <span aria-hidden="true">&rarr;</span>}
          </button>
        </form>
      </section>
      <p className={styles.footer}>A little closer, even from far away.</p>
    </main>
  );
}