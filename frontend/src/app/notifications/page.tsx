import Link from "next/link";

import SiteHeader from "../../components/SiteHeader";
import styles from "./page.module.css";

export default function NotificationsPage() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main className={styles.main}>
        <p className={styles.eyebrow}>YOUR ACTIVITY</p>
        <h1>Notifications</h1>
        <p className={styles.subtitle}>Invitations and updates from your watch circle.</p>

        <section aria-label="Notifications" className={styles.emptyState}>
          <span className={styles.icon} aria-hidden="true">
            !
          </span>
          <h2>No notifications yet</h2>
          <p>This page is ready for real notifications. The backend does not have a notification endpoint yet.</p>
          <Link href="/#rooms">
            Browse watch rooms <span aria-hidden="true">&rarr;</span>
          </Link>
        </section>
      </main>
    </div>
  );
}
