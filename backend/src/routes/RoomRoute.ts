import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";

export default class RoomRoute implements RouteInterface {
    private readonly basePath = "/rooms";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth());

        this.app.get("/", async (c) => {
            const search = c.req.query("search") || "";
            const mediaType = c.req.query("mediaType") || "all";
            const page = parseInt(c.req.query("page") || "1");
            const limit = parseInt(c.req.query("limit") || "20");

            return c.json({
                rooms: [
                    {
                        id: 1,
                        roomCode: "18492043",
                        title: "Watch Party Movie Night",
                        description: "มาดูวิดีโอสนุกๆ ด้วยกันครับ",
                        hostId: 1,
                        host: {
                            id: 1,
                            displayName: "HostName",
                            avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                        },
                        status: "active",
                        mediaType: "youtube",
                        currentMediaId: 1,
                        isPrivate: false,
                        participantCount: 5,
                        maxParticipants: 50,
                        createdAt: new Date().toISOString(),
                    },
                ],
                total: 1,
                page,
                limit,
                filters: {
                    search,
                    mediaType,
                },
            });
        });

        this.app.post("/", async (c) => {
            return c.json(
                {
                    message: "Room created successfully",
                    room: {
                        id: 1,
                        roomCode: "18492043",
                        title: "New Stream Room",
                        description: "Room description",
                        hostId: 1,
                        status: "active",
                        mediaType: "none",
                        currentMediaId: null,
                        isPrivate: false,
                        maxParticipants: 50,
                        createdAt: new Date().toISOString(),
                    },
                },
                201
            );
        });

        this.app.get("/code/:code", async (c) => {
            const code = c.req.param("code");
            return c.json({
                room: {
                    id: 1,
                    roomCode: code,
                    title: "Room Found by Code",
                    description: "Room description",
                    hostId: 1,
                    status: "active",
                    mediaType: "youtube",
                    isPrivate: false,
                    maxParticipants: 50,
                    createdAt: new Date().toISOString(),
                },
            });
        });

        this.app.get("/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                room: {
                    id: Number(id),
                    roomCode: "18492043",
                    title: "Stream Room Details",
                    description: "Room description",
                    hostId: 1,
                    status: "active",
                    mediaType: "youtube",
                    isPrivate: false,
                    maxParticipants: 50,
                    createdAt: new Date().toISOString(),
                },
            });
        });

        this.app.post("/:id/verify-passcode", async (c) => {
            const id = c.req.param("id");
            return c.json({
                verified: true,
                roomId: Number(id),
            });
        });

        this.app.patch("/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "Room updated successfully",
                room: {
                    id: Number(id),
                    roomCode: "18492043",
                    title: "Updated Room Title",
                    description: "Updated description",
                    isPrivate: false,
                    maxParticipants: 50,
                },
            });
        });

        this.app.post("/:id/end", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "Room ended successfully",
                roomId: Number(id),
                endedAt: new Date().toISOString(),
            });
        });

        this.app.get("/:id/playback", async (c) => {
            const id = c.req.param("id");
            return c.json({
                roomId: Number(id),
                playbackState: {
                    mediaId: "1",
                    mediaType: "youtube",
                    sourceUrl: "dQw4w9WgXcQ",
                    currentTime: "0.000",
                    isPlaying: "false",
                    playbackSpeed: "1.00",
                    volume: "1.00",
                    updatedBy: "1",
                    updatedAt: new Date().toISOString(),
                },
            });
        });

        this.app.get("/:id/participants", async (c) => {
            const id = c.req.param("id");
            return c.json({
                roomId: Number(id),
                count: 1,
                participants: [
                    {
                        userId: 1,
                        displayName: "HostUser",
                        avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                        role: "host",
                        joinedAt: new Date().toISOString(),
                    },
                ],
            });
        });

        this.app.get("/:id/messages", async (c) => {
            const id = c.req.param("id");
            return c.json({
                roomId: Number(id),
                messages: [
                    {
                        id: "msg_sample",
                        senderId: 1,
                        senderName: "HostUser",
                        avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                        message: "ยินดีต้อนรับสู่ห้องสตรีม YouStream!",
                        messageType: "chat",
                        createdAt: new Date().toISOString(),
                    },
                ],
            });
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
