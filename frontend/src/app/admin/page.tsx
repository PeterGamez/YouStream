"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { ApiError, apiRequest, clearTokens, hasSession } from "../../lib/api";
import styles from "./page.module.css";

type AdminUser = {
  id: number;
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  role: "user" | "admin";
  createdAt: string;
};

type AdminRoom = {
  id: number;
  roomCode: string;
  title: string;
  hostId: number;
  status: "active" | "ended";
  mediaType: "none" | "youtube" | "local_file";
  isPrivate: boolean;
  createdAt: string;
};

type AdminMedia = {
  id: number;
  uploaderId: number;
  sourceType: "youtube" | "local_file";
  title: string;
  sourceUrl: string;
  youtubeVideoId: string;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
};

type DashboardStats = {
  activeRoomsCount: number;
  totalUsersCount: number;
  totalMediaFilesCount: number;
  totalStorageSizeBytes: number;
};

type DashboardData = {
  stats: DashboardStats;
  users: AdminUser[];
  rooms: AdminRoom[];
  media: AdminMedia[];
};

type Section = "overview" | "users" | "rooms" | "media";

const PAGE_SIZE = 8;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function initials(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "?";
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    rooms: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></>,
    media: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11" /><path d="m9 12 2 2 4-4" /></>,
    storage: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  };

  return (
    <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width={size}>
      {paths[name] || paths.more}
    </svg>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [currentAdminId, setCurrentAdminId] = useState<number | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadDashboard() {
      if (!hasSession()) {
        router.replace("/login");
        return;
      }

      try {
        const currentUser = await apiRequest<{ id: number; role: "user" | "admin" }>("/users/me");
        if (!isCurrent) return;
        if (currentUser.role !== "admin") {
          router.replace("/");
          return;
        }
        setCurrentAdminId(currentUser.id);

        const [statsResponse, usersResponse, roomsResponse, mediaResponse] = await Promise.all([
          apiRequest<{ stats: DashboardStats }>("/admin/stats"),
          apiRequest<{ users: AdminUser[] }>("/admin/users"),
          apiRequest<{ rooms: AdminRoom[] }>("/admin/rooms"),
          apiRequest<{ media: AdminMedia[] }>("/admin/media"),
        ]);

        if (!isCurrent) return;
        setData({
          stats: statsResponse.stats,
          users: usersResponse.users,
          rooms: roomsResponse.rooms,
          media: mediaResponse.media,
        });
      } catch (error) {
        if (!isCurrent) return;
        if (error instanceof ApiError && error.status === 401) {
          clearTokens();
          router.replace("/login");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          router.replace("/");
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Could not load the admin dashboard.");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      isCurrent = false;
    };
  }, [refreshVersion, router]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.users || []).filter((user) =>
      [user.displayName, user.username, user.email].some((value) => value.toLowerCase().includes(query))
    );
  }, [data?.users, search]);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.rooms || []).filter((room) =>
      [room.title, room.roomCode, String(room.hostId)].some((value) => value.toLowerCase().includes(query))
    );
  }, [data?.rooms, search]);

  const filteredMedia = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.media || []).filter((media) =>
      [media.title, media.sourceType, media.mimeType, String(media.uploaderId)].some((value) => value.toLowerCase().includes(query))
    );
  }, [data?.media, search]);

  async function runAction(key: string, successMessage: string, request: () => Promise<unknown>) {
    setActionKey(key);
    setActionError("");
    setNotice("");
    try {
      await request();
      setNotice(successMessage);
      setIsLoading(true);
      setPage(1);
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      setActionKey("");
    }
  }

  function changeRole(user: AdminUser) {
    const role = user.role === "admin" ? "user" : "admin";
    if (!window.confirm(`Change @${user.username} to ${role === "admin" ? "an admin" : "a regular user"}? Their active sessions will be signed out.`)) {
      return;
    }
    void runAction(`user-role-${user.id}`, `Updated ${user.displayName}'s role.`, () =>
      apiRequest(`/admin/users/${user.id}/role`, { method: "PATCH", body: JSON.stringify({ role }) })
    );
  }

  function deleteUser(user: AdminUser) {
    if (!window.confirm(`Permanently delete @${user.username}? Any active rooms hosted by this account will also be ended.`)) return;
    void runAction(`user-delete-${user.id}`, `Deleted @${user.username}.`, () =>
      apiRequest(`/admin/users/${user.id}`, { method: "DELETE" })
    );
  }

  function endRoom(room: AdminRoom) {
    if (!window.confirm(`End “${room.title}”? Everyone currently watching will be removed from the room.`)) return;
    void runAction(`room-end-${room.id}`, `Ended room “${room.title}”.`, () =>
      apiRequest(`/admin/rooms/${room.id}/end`, { method: "POST" })
    );
  }

  function deleteMedia(media: AdminMedia) {
    if (!window.confirm(`Delete “${media.title}” from the media library? This cannot be undone.`)) return;
    void runAction(`media-delete-${media.id}`, `Deleted “${media.title}”.`, () =>
      apiRequest(`/admin/media/${media.id}`, { method: "DELETE" })
    );
  }

  function cleanupStorage() {
    if (!window.confirm("Remove unreferenced files from server storage? This permanently deletes files not linked to media records.")) return;
    void runAction("storage-cleanup", "Storage cleanup completed.", () =>
      apiRequest("/admin/media/cleanup", { method: "POST" })
    );
  }

  function refreshDashboard() {
    setLoadError("");
    setActionError("");
    setNotice("");
    setIsLoading(true);
    setRefreshVersion((version) => version + 1);
  }

  function changeSection(nextSection: Section) {
    setSection(nextSection);
    setSearch("");
    setPage(1);
  }

  const roomCounts = useMemo(() => {
    const rooms = data?.rooms || [];
    return {
      active: rooms.filter((room) => room.status === "active").length,
      ended: rooms.filter((room) => room.status !== "active").length,
    };
  }, [data?.rooms]);

  const navItems: { key: Section; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "overview" },
    { key: "users", label: "Users", icon: "users" },
    { key: "rooms", label: "Rooms", icon: "rooms" },
    { key: "media", label: "Media & storage", icon: "media" },
  ];

  const sectionTitle: Record<Section, string> = {
    overview: "Overview",
    users: "Users",
    rooms: "Rooms",
    media: "Media & storage",
  };

  const activeItems = section === "users" ? filteredUsers : section === "rooms" ? filteredRooms : filteredMedia;
  const pageCount = Math.max(1, Math.ceil(activeItems.length / PAGE_SIZE));
  const visibleItems = activeItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={styles.admin}>
      <aside className={styles.sidebar}>
        <Link aria-label="YouStream home" className={styles.brand} href="/">
          <span className={styles.brandMark}>y</span>
          <span>YouStream <small>ADMIN</small></span>
        </Link>

        <p className={styles.navLabel}>WORKSPACE</p>
        <nav aria-label="Admin navigation" className={styles.nav}>
          {navItems.map((item) => (
            <button
              aria-current={section === item.key ? "page" : undefined}
              className={section === item.key ? styles.navItemActive : styles.navItem}
              key={item.key}
              onClick={() => changeSection(item.key)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.key === "users" && data && <span className={styles.navCount}>{data.stats.totalUsersCount}</span>}
              {item.key === "rooms" && data && <span className={styles.navCount}>{data.stats.activeRoomsCount}</span>}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.adminBadge}><Icon name="shield" size={16} /><span>Administrator access</span></div>
          <Link className={styles.backToSite} href="/">← Back to YouStream</Link>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}><span>Workspace</span><span>/</span><strong>{sectionTitle[section]}</strong></div>
          <div className={styles.topActions}>
            <span className={styles.environment}><span /> Live data</span>
            <button
              aria-label="Refresh dashboard data"
              className={styles.refreshButton}
              disabled={isLoading}
              onClick={refreshDashboard}
              type="button"
            >
              <Icon name="refresh" size={16} /><span>Refresh</span>
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <div className={styles.pageHeading}>
            <div>
              <p className={styles.eyebrow}>YOUSTREAM CONTROL CENTER</p>
              <h1>{sectionTitle[section]}</h1>
              <p className={styles.subtitle}>
                {section === "overview" && "Monitor your platform and manage its content."}
                {section === "users" && "Review accounts and manage administrator access."}
                {section === "rooms" && "Monitor live rooms and take action when needed."}
                {section === "media" && "Review uploaded media and manage server storage."}
              </p>
            </div>
            {section !== "overview" && (
              <label className={styles.searchBox}>
                <Icon name="search" size={17} />
                <span className={styles.visuallyHidden}>Search {sectionTitle[section].toLowerCase()}</span>
                <input
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder={`Search ${sectionTitle[section].toLowerCase()}...`}
                  value={search}
                />
                {search && <button aria-label="Clear search" onClick={() => { setSearch(""); setPage(1); }} type="button"><Icon name="close" size={14} /></button>}
              </label>
            )}
          </div>

          {(loadError || actionError || notice) && (
            <div aria-live="polite" className={loadError || actionError ? styles.alertError : styles.alertSuccess} role={loadError || actionError ? "alert" : "status"}>
              <span>{loadError || actionError || notice}</span>
              {(loadError || actionError) && (
                <button onClick={refreshDashboard} type="button">Try again</button>
              )}
            </div>
          )}

          {isLoading && !data ? (
            <div aria-live="polite" className={styles.loading}><span className={styles.spinner} /> Loading admin data...</div>
          ) : loadError && !data ? (
            <section className={styles.emptyState}>
              <span className={styles.emptyIcon}><Icon name="shield" size={22} /></span>
              <h2>Dashboard unavailable</h2>
              <p>{loadError}</p>
              <button className={styles.primaryButton} onClick={refreshDashboard} type="button">Retry</button>
            </section>
          ) : data ? (
            <>
              {section === "overview" && (
                <>
                  <section aria-label="Platform statistics" className={styles.statsGrid}>
                    <StatCard label="Active rooms" value={data.stats.activeRoomsCount} icon="rooms" accent="purple" footnote="Currently live" />
                    <StatCard label="Total users" value={data.stats.totalUsersCount} icon="users" accent="blue" footnote={`${data.users.filter((user) => user.role === "admin").length} administrators`} />
                    <StatCard label="Media files" value={data.stats.totalMediaFilesCount} icon="media" accent="green" footnote="In the library" />
                    <StatCard label="Storage used" value={formatBytes(data.stats.totalStorageSizeBytes)} icon="storage" accent="orange" footnote="Tracked media files" />
                  </section>

                  <div className={styles.overviewGrid}>
                    <section className={styles.panel}>
                      <div className={styles.panelHeader}>
                        <div><h2>Room activity</h2><p>Current room status overview</p></div>
                        <button className={styles.textButton} onClick={() => changeSection("rooms")} type="button">View rooms <Icon name="arrow" size={15} /></button>
                      </div>
                      <div className={styles.roomSummary}>
                        <div className={styles.roomSummaryNumber}>{roomCounts.active}<span> active</span></div>
                        <div className={styles.roomBar} aria-label={`${roomCounts.active} active and ${roomCounts.ended} ended rooms`}>
                          <span className={styles.roomBarActive} style={{ width: `${roomCounts.active + roomCounts.ended === 0 ? 0 : (roomCounts.active / (roomCounts.active + roomCounts.ended)) * 100}%` }} />
                        </div>
                        <div className={styles.legend}><span><i className={styles.legendActive} />Active <b>{roomCounts.active}</b></span><span><i className={styles.legendEnded} />Ended <b>{roomCounts.ended}</b></span></div>
                      </div>
                    </section>
                    <section className={styles.panel}>
                      <div className={styles.panelHeader}>
                        <div><h2>Quick actions</h2><p>Common administration tasks</p></div>
                      </div>
                      <div className={styles.quickActions}>
                        <button onClick={() => changeSection("users")} type="button"><span className={styles.quickIcon}><Icon name="users" /></span><span><b>Manage users</b><small>Roles and accounts</small></span><Icon name="arrow" size={15} /></button>
                        <button onClick={() => changeSection("rooms")} type="button"><span className={styles.quickIcon}><Icon name="rooms" /></span><span><b>Review rooms</b><small>Live room moderation</small></span><Icon name="arrow" size={15} /></button>
                        <button onClick={() => changeSection("media")} type="button"><span className={styles.quickIcon}><Icon name="storage" /></span><span><b>Manage storage</b><small>Media and cleanup</small></span><Icon name="arrow" size={15} /></button>
                      </div>
                    </section>
                  </div>

                  <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <div><h2>Recent rooms</h2><p>Latest rooms across the platform</p></div>
                      <button className={styles.textButton} onClick={() => changeSection("rooms")} type="button">View all <Icon name="arrow" size={15} /></button>
                    </div>
                    <RoomTable rooms={[...data.rooms].sort((a, b) => b.id - a.id).slice(0, 5)} actionKey={actionKey} onEnd={endRoom} />
                  </section>
                </>
              )}

              {section === "users" && (
                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div><h2>All users</h2><p>{filteredUsers.length} {filteredUsers.length === 1 ? "account" : "accounts"}{search ? " found" : " registered"}</p></div>
                    <span className={styles.tableMeta}><span className={styles.statusDot} /> {data.stats.totalUsersCount} total</span>
                  </div>
                  <UserTable users={visibleItems as AdminUser[]} actionKey={actionKey} currentAdminId={currentAdminId} onChangeRole={changeRole} onDelete={deleteUser} />
                  <Pagination count={filteredUsers.length} page={page} pageCount={pageCount} onPage={setPage} />
                </section>
              )}

              {section === "rooms" && (
                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div><h2>All rooms</h2><p>{filteredRooms.length} {filteredRooms.length === 1 ? "room" : "rooms"}{search ? " found" : " in the system"}</p></div>
                    <div className={styles.statusLegend}><span><i className={styles.legendActive} />Active {roomCounts.active}</span><span><i className={styles.legendEnded} />Ended {roomCounts.ended}</span></div>
                  </div>
                  <RoomTable rooms={visibleItems as AdminRoom[]} actionKey={actionKey} onEnd={endRoom} />
                  <Pagination count={filteredRooms.length} page={page} pageCount={pageCount} onPage={setPage} />
                </section>
              )}

              {section === "media" && (
                <>
                  <section className={styles.mediaSummary}>
                    <div className={styles.panel}><span className={styles.summaryIcon}><Icon name="media" /></span><div><small>Media files</small><strong>{data.stats.totalMediaFilesCount}</strong></div></div>
                    <div className={styles.panel}><span className={styles.summaryIcon}><Icon name="storage" /></span><div><small>Tracked storage</small><strong>{formatBytes(data.stats.totalStorageSizeBytes)}</strong></div></div>
                    <button className={styles.cleanupButton} disabled={actionKey === "storage-cleanup"} onClick={cleanupStorage} type="button">
                      <Icon name="refresh" size={17} />{actionKey === "storage-cleanup" ? "Cleaning..." : "Clean unreferenced files"}
                    </button>
                  </section>
                  <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <div><h2>Media library</h2><p>{filteredMedia.length} {filteredMedia.length === 1 ? "file" : "files"}{search ? " found" : " stored"}</p></div>
                    </div>
                    <MediaTable media={visibleItems as AdminMedia[]} actionKey={actionKey} onDelete={deleteMedia} />
                    <Pagination count={filteredMedia.length} page={page} pageCount={pageCount} onPage={setPage} />
                  </section>
                </>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, accent, footnote }: { label: string; value: string | number; icon: string; accent: string; footnote: string }) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statTop}><span>{label}</span><span className={`${styles.statIcon} ${styles[accent]}`}><Icon name={icon} /></span></div>
      <strong>{value}</strong>
      <small>{footnote}</small>
    </article>
  );
}

function Pagination({ count, page, pageCount, onPage }: { count: number; page: number; pageCount: number; onPage: (page: number) => void }) {
  if (count <= PAGE_SIZE) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, count);
  return (
    <div className={styles.pagination}>
      <span>Showing <b>{start}–{end}</b> of <b>{count}</b></span>
      <div><button disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">Previous</button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => onPage(page + 1)} type="button">Next</button></div>
    </div>
  );
}

function UserTable({ users, actionKey, currentAdminId, onChangeRole, onDelete }: { users: AdminUser[]; actionKey: string; currentAdminId: number | null; onChangeRole: (user: AdminUser) => void; onDelete: (user: AdminUser) => void }) {
  if (users.length === 0) return <EmptyTable message="No users match your search." />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>User</th><th>Role</th><th>Joined</th><th><span className={styles.visuallyHidden}>Actions</span></th></tr></thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td><div className={styles.userCell}><span className={styles.avatar}>{user.avatarUrl ? <img alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} src={user.avatarUrl} /> : initials(user.displayName || user.username)}</span><span><b>{user.displayName || user.username}</b><small>@{user.username} · {user.email}</small></span></div></td>
              <td><span className={user.role === "admin" ? styles.adminRole : styles.userRole}>{user.role === "admin" && <Icon name="shield" size={13} />}{user.role}</span></td>
              <td className={styles.mutedCell}>{formatDate(user.createdAt)}</td>
              <td><div className={styles.rowActions}><button disabled={Boolean(actionKey) || user.id === currentAdminId} onClick={() => onChangeRole(user)} title={user.id === currentAdminId ? "You cannot change your own role" : undefined} type="button">{actionKey === `user-role-${user.id}` ? "Saving..." : user.role === "admin" ? "Remove admin" : "Make admin"}</button><button aria-label={`Delete ${user.username}`} className={styles.dangerAction} disabled={Boolean(actionKey) || user.id === currentAdminId} onClick={() => onDelete(user)} title={user.id === currentAdminId ? "You cannot delete your own account" : undefined} type="button">{actionKey === `user-delete-${user.id}` ? "..." : "Delete"}</button></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomTable({ rooms, actionKey, onEnd }: { rooms: AdminRoom[]; actionKey: string; onEnd: (room: AdminRoom) => void }) {
  if (rooms.length === 0) return <EmptyTable message="No rooms to show." />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Room</th><th>Host ID</th><th>Media</th><th>Status</th><th><span className={styles.visuallyHidden}>Actions</span></th></tr></thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id}>
              <td><div className={styles.roomCell}><span className={styles.roomIcon}><Icon name="rooms" size={17} /></span><span><b>{room.title}</b><small>#{room.roomCode} · {room.isPrivate ? "Private" : "Public"}</small></span></div></td>
              <td className={styles.mutedCell}>User #{room.hostId}</td>
              <td><span className={styles.typeBadge}>{room.mediaType === "local_file" ? "Local video" : room.mediaType === "youtube" ? "YouTube" : "No media"}</span></td>
              <td><span className={room.status === "active" ? styles.activeStatus : styles.endedStatus}><i />{room.status}</span></td>
              <td>{room.status === "active" ? <button className={styles.dangerAction} disabled={Boolean(actionKey)} onClick={() => onEnd(room)} type="button">{actionKey === `room-end-${room.id}` ? "Ending..." : "End room"}</button> : <span className={styles.mutedCell}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediaTable({ media, actionKey, onDelete }: { media: AdminMedia[]; actionKey: string; onDelete: (media: AdminMedia) => void }) {
  if (media.length === 0) return <EmptyTable message="No media files match your search." />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>File</th><th>Type</th><th>Uploaded by</th><th>Size</th><th><span className={styles.visuallyHidden}>Actions</span></th></tr></thead>
        <tbody>
          {media.map((item) => (
            <tr key={item.id}>
              <td><div className={styles.roomCell}><span className={styles.mediaIcon}><Icon name="media" size={17} /></span><span><b>{item.title}</b><small>{formatDate(item.createdAt)}</small></span></div></td>
              <td><span className={styles.typeBadge}>{item.sourceType === "youtube" ? "YouTube" : item.mimeType || "Video"}</span></td>
              <td className={styles.mutedCell}>User #{item.uploaderId}</td>
              <td className={styles.mutedCell}>{formatBytes(item.fileSizeBytes)}</td>
              <td><button className={styles.dangerAction} disabled={Boolean(actionKey)} onClick={() => onDelete(item)} type="button">{actionKey === `media-delete-${item.id}` ? "Deleting..." : "Delete"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyTable({ message }: { message: string }) {
  return <div className={styles.tableEmpty}>{message}</div>;
}
