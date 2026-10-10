import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";

export default class AdminRoute implements RouteInterface {
    private readonly basePath = "/admin";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth());

        this.app.get("/stats", async (c) => {
            return c.json({
                stats: {
                    activeRoomsCount: 1,
                    totalUsersCount: 10,
                    totalMediaFilesCount: 5,
                    totalStorageSizeBytes: 524288000,
                },
            });
        });

        this.app.get("/users", async (c) => {
            const page = parseInt(c.req.query("page") || "1");
            const limit = parseInt(c.req.query("limit") || "20");

            return c.json({
                users: [
                    {
                        id: 1,
                        username: "admin",
                        email: "admin@youstream.app",
                        displayName: "Admin",
                        role: "admin",
                        createdAt: new Date().toISOString(),
                    },
                ],
                total: 1,
                page,
                limit,
            });
        });

        this.app.patch("/users/:id/role", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "User role updated successfully",
                userId: Number(id),
                role: "admin",
            });
        });

        this.app.delete("/users/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "User suspended successfully",
                userId: Number(id),
            });
        });

        this.app.get("/rooms", async (c) => {
            const page = parseInt(c.req.query("page") || "1");
            const limit = parseInt(c.req.query("limit") || "20");

            return c.json({
                rooms: [
                    {
                        id: 1,
                        roomCode: "18492043",
                        title: "Monitored Stream Room",
                        hostId: 1,
                        status: "active",
                        mediaType: "youtube",
                        createdAt: new Date().toISOString(),
                    },
                ],
                total: 1,
                page,
                limit,
            });
        });

        this.app.post("/rooms/:id/end", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "Room terminated by administrator",
                roomId: Number(id),
                endedAt: new Date().toISOString(),
            });
        });

        this.app.get("/media", async (c) => {
            const page = parseInt(c.req.query("page") || "1");
            const limit = parseInt(c.req.query("limit") || "20");

            return c.json({
                media: [
                    {
                        id: 1,
                        uploaderId: 1,
                        title: "video_sample.mp4",
                        fileSizeBytes: 1048576,
                        mimeType: "video/mp4",
                        createdAt: new Date().toISOString(),
                    },
                ],
                total: 1,
                page,
                limit,
            });
        });

        this.app.delete("/media/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "Media deleted by administrator",
                mediaId: Number(id),
            });
        });

        this.app.post("/media/cleanup", async (c) => {
            return c.json({
                message: "Storage cleanup completed",
                reclaimedFilesCount: 0,
                reclaimedSizeBytes: 0,
            });
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
