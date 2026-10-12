import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { UserInterface } from "../interfaces/Database";
import type { RouteInterface } from "../interfaces/Route";
import MediaModel from "../models/MediaModel";
import RoomModel from "../models/RoomModel";
import UserModel from "../models/UserModel";
import RoomStateService from "../services/RoomStateService";
import SocketService from "../services/SocketService";
import UserService from "../services/UserService";
import RoomSocket from "../sockets/RoomSocket";

export default class AdminRoute implements RouteInterface {
    private readonly basePath = "/admin";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;
    private readonly uploadDir: string;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;
        this.uploadDir = this.server.config.uploadDir;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth(), this.server.Middleware.adminOnly());

        this.app.get("/stats", async (c) => {
            try {
                let activeRoomsCount = 0;
                try {
                    activeRoomsCount = await RoomStateService.getActiveRoomCount();
                } catch {
                    const activeRooms = await RoomModel.selectActiveRooms();
                    activeRoomsCount = activeRooms.length;
                }

                const allUsers = await UserModel.selectAllUser();
                const allMedia = await MediaModel.selectAllMedia();

                const totalStorageSizeBytes = allMedia.reduce((acc, m) => acc + (Number(m.fileSizeBytes) || 0), 0);

                return c.json({
                    stats: {
                        activeRoomsCount,
                        totalUsersCount: allUsers.length,
                        totalMediaFilesCount: allMedia.length,
                        totalStorageSizeBytes,
                    },
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Stats error: ${message}`);
                return c.json({ error: "Failed to retrieve admin stats" }, 500);
            }
        });

        this.app.get("/users", async (c) => {
            try {
                const users = await UserModel.selectAllUser();

                const safeUsers = users.map((u) => ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    displayName: u.displayName,
                    avatarUrl: u.avatarUrl,
                    role: u.role,
                    createdAt: u.createdAt,
                    updatedAt: u.updatedAt,
                }));

                return c.json({
                    users: safeUsers,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Get users error: ${message}`);
                return c.json({ error: "Failed to retrieve users" }, 500);
            }
        });

        this.app.patch("/users/:id/role", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid user ID" }, 400);
                }

                const currentAdmin = await this.server.Middleware.getUser(c);
                if (currentAdmin && currentAdmin.id === id) {
                    return c.json({ error: "Cannot modify your own role" }, 400);
                }

                let body: { role: UserInterface["role"] };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const role = body.role;
                if (role !== "user" && role !== "admin") {
                    return c.json({ error: "Role must be 'user' or 'admin'" }, 400);
                }

                const user = await UserModel.selectUser(id);
                if (!user) {
                    return c.json({ error: "User not found" }, 404);
                }

                await UserModel.updateUser(id, "role", role);
                await UserService.delUser(id);

                try {
                    await SocketService.revokeUserSockets(id, "User role was changed by administrator");
                } catch (revokeErr) {
                    const revokeMsg = revokeErr instanceof Error ? revokeErr.message : String(revokeErr);
                    this.server.error("Admin Route", `Failed to revoke sockets for user ${id}: ${revokeMsg}`);
                    await UserModel.updateUser(id, "role", user.role).catch(() => {});
                    await UserService.delUser(id).catch(() => {});
                    return c.json({ error: `Failed to revoke active user socket sessions: ${revokeMsg}` }, 500);
                }

                this.server.log("Admin Route", `Updated role for user ${id} to ${role}`);

                return c.json({
                    message: "User role updated successfully",
                    userId: id,
                    role,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Update role error: ${message}`);
                return c.json({ error: "Failed to update user role" }, 500);
            }
        });

        this.app.delete("/users/:id", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid user ID" }, 400);
                }

                const currentAdmin = await this.server.Middleware.getUser(c);
                if (currentAdmin && currentAdmin.id === id) {
                    return c.json({ error: "Cannot delete or suspend your own account" }, 400);
                }

                const user = await UserModel.selectUser(id);
                if (!user) {
                    return c.json({ error: "User not found" }, 404);
                }

                const activeRooms = await RoomModel.selectActiveRoomsByHost(id);

                for (const room of activeRooms) {
                    let cleanedUp = false;
                    let lastError: Error | null = null;
                    const maxRetries = 3;

                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                        try {
                            await RoomModel.endRoom(room.id);
                            await RoomStateService.cleanupRoom(room.id);
                            RoomSocket.endRoom(room.id, "Room ended: Host account was suspended by administrator");
                            cleanedUp = true;
                            break;
                        } catch (roomErr) {
                            lastError = roomErr instanceof Error ? roomErr : new Error(String(roomErr));
                            this.server.warn("Admin Route", `Attempt ${attempt}/${maxRetries} failed to cleanup room ${room.id} for user ${id}: ${lastError.message}`);
                            if (attempt < maxRetries) {
                                await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
                            }
                        }
                    }

                    if (!cleanedUp) {
                        this.server.error("Admin Route", `Aborting user deletion: failed to terminate room ${room.id} for user ${id} after ${maxRetries} attempts`);
                        return c.json(
                            {
                                error: `Failed to terminate active room ${room.id}. User deletion aborted: ${lastError?.message || "Unknown error"}`,
                            },
                            500
                        );
                    }
                }

                await UserModel.deleteUser(id);
                await UserService.delUser(id);

                try {
                    await SocketService.revokeUserSockets(id, "User account was suspended by administrator");
                } catch (revokeErr) {
                    const revokeMsg = revokeErr instanceof Error ? revokeErr.message : String(revokeErr);
                    this.server.error("Admin Route", `Failed to revoke sockets for deleted user ${id}: ${revokeMsg}`);
                    return c.json({ error: `Failed to revoke active user socket sessions: ${revokeMsg}` }, 500);
                }

                this.server.log("Admin Route", `User ${id} suspended/deleted by admin`);

                return c.json({
                    message: "User suspended successfully",
                    userId: id,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Delete user error: ${message}`);
                return c.json({ error: "Failed to delete user" }, 500);
            }
        });

        this.app.get("/rooms", async (c) => {
            try {
                const rooms = await RoomModel.selectAllRoom();

                const safeRooms = rooms.map((r) => {
                    const { passcode, ...safeRoom } = r;
                    return safeRoom;
                });

                return c.json({
                    rooms: safeRooms,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Get rooms error: ${message}`);
                return c.json({ error: "Failed to retrieve rooms" }, 500);
            }
        });

        this.app.post("/rooms/:id/end", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const room = await RoomModel.selectRoom(id);
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                await RoomModel.endRoom(id);

                try {
                    await RoomStateService.cleanupRoom(id);
                } catch {
                    // ignore
                }

                try {
                    RoomSocket.endRoom(id, "Room terminated by administrator");
                } catch {
                    // ignore
                }

                this.server.log("Admin Route", `Room ${id} terminated by admin`);

                return c.json({
                    message: "Room terminated by administrator",
                    roomId: id,
                    endedAt: new Date().toISOString(),
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `End room error: ${message}`);
                return c.json({ error: "Failed to terminate room" }, 500);
            }
        });

        this.app.get("/media", async (c) => {
            try {
                const media = await MediaModel.selectAllMedia();

                return c.json({
                    media,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Get media error: ${message}`);
                return c.json({ error: "Failed to retrieve media files" }, 500);
            }
        });

        this.app.delete("/media/:id", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid media ID" }, 400);
                }

                const media = await MediaModel.selectMedia(id);
                if (!media) {
                    return c.json({ error: "Media not found" }, 404);
                }

                if (media.filePath && existsSync(media.filePath)) {
                    try {
                        unlinkSync(media.filePath);
                    } catch {
                        // ignore
                    }
                }

                await MediaModel.deleteMedia(id);

                this.server.log("Admin Route", `Media ${id} deleted by admin`);

                return c.json({
                    message: "Media deleted by administrator",
                    mediaId: id,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Delete media error: ${message}`);
                return c.json({ error: "Failed to delete media" }, 500);
            }
        });

        this.app.post("/media/cleanup", async (c) => {
            try {
                if (!existsSync(this.uploadDir)) {
                    return c.json({
                        message: "Storage cleanup completed",
                        reclaimedFilesCount: 0,
                        reclaimedSizeBytes: 0,
                    });
                }

                const allMedia = await MediaModel.selectAllMedia();
                const activeFilePaths = new Set(allMedia.map((m) => m.filePath).filter((p): p is string => Boolean(p)));

                const filesOnDisk = readdirSync(this.uploadDir);
                let reclaimedFilesCount = 0;
                let reclaimedSizeBytes = 0;

                for (const file of filesOnDisk) {
                    const fullPath = path.join(this.uploadDir, file);
                    if (!activeFilePaths.has(fullPath)) {
                        try {
                            const stat = statSync(fullPath);
                            reclaimedSizeBytes += stat.size;
                            unlinkSync(fullPath);
                            reclaimedFilesCount++;
                        } catch {
                            // ignore error on single file
                        }
                    }
                }

                this.server.log("Admin Route", `Storage cleanup: ${reclaimedFilesCount} files removed, ${reclaimedSizeBytes} bytes reclaimed`);

                return c.json({
                    message: "Storage cleanup completed",
                    reclaimedFilesCount,
                    reclaimedSizeBytes,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Admin Route", `Storage cleanup error: ${message}`);
                return c.json({ error: "Failed to run storage cleanup" }, 500);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
