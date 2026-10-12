import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import Gravatar from "../integrations/Gravatar";
import type { RoomMediaType, RoomSafeDTO } from "../interfaces/Database";
import type { RouteInterface } from "../interfaces/Route";
import type { RoomType } from "../interfaces/Type";
import RoomModel from "../models/RoomModel";
import UserModel from "../models/UserModel";
import RoomStateService from "../services/RoomStateService";
import RoomSocket from "../sockets/RoomSocket";

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
            try {
                const search = (c.req.query("search") || "").trim().toLowerCase();
                const mediaType = c.req.query("mediaType") || "all";

                const allRooms = await RoomModel.selectAllRoom();
                const filteredRooms = allRooms.filter((r) => {
                    if (r.status !== "active") return false;

                    if (search) {
                        const titleMatch = (r.title || "").toLowerCase().includes(search);
                        const codeMatch = (r.roomCode || "").toLowerCase().includes(search);
                        if (!titleMatch && !codeMatch) return false;
                    }

                    if (mediaType !== "all" && r.mediaType !== mediaType) {
                        return false;
                    }

                    return true;
                });

                const roomsWithDetails = await Promise.all(
                    filteredRooms.map(async (room) => {
                        let host = {
                            id: room.hostId,
                            displayName: "Host",
                            avatarUrl: Gravatar.getDefaultAvatarURL(),
                        };

                        try {
                            const hostUser = await UserModel.selectUser(room.hostId);
                            if (hostUser) {
                                host = {
                                    id: hostUser.id,
                                    displayName: hostUser.displayName,
                                    avatarUrl: hostUser.avatarUrl,
                                };
                            }
                        } catch {
                            // ignore host lookup error
                        }

                        let participantCount = 0;
                        try {
                            participantCount = await RoomStateService.getParticipantCount(room.id);
                        } catch {
                            // ignore redis error
                        }

                        const safeRoom: RoomSafeDTO & { host: typeof host; participantCount: number } = {
                            id: room.id,
                            roomCode: room.roomCode,
                            title: room.title,
                            description: room.description,
                            hostId: room.hostId,
                            host,
                            status: room.status,
                            mediaType: room.mediaType,
                            currentMediaId: room.currentMediaId,
                            isPrivate: room.isPrivate,
                            participantCount,
                            maxParticipants: room.maxParticipants,
                            createdAt: room.createdAt,
                            updatedAt: room.updatedAt,
                            endedAt: room.endedAt,
                        };

                        return safeRoom;
                    })
                );

                return c.json({
                    rooms: roomsWithDetails,
                    filters: {
                        search,
                        mediaType,
                    },
                });
            } catch (error: any) {
                this.server.error("Room Route", `Get /rooms error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve rooms" }, 500);
            }
        });

        this.app.post("/", async (c) => {
            try {
                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                let body: {
                    title?: string;
                    description?: string;
                    isPrivate?: boolean;
                    maxParticipants?: number;
                    mediaType?: RoomMediaType;
                    passcode?: string;
                };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const title = body.title?.trim();
                if (!title) {
                    return c.json({ error: "Room title is required" }, 400);
                }
                if (title.length > 150) {
                    return c.json({ error: "Room title cannot exceed 150 characters" }, 400);
                }

                const description = body.description?.trim() || "";
                const isPrivate = Boolean(body.isPrivate);
                const maxParticipants = body.maxParticipants ?? 100;
                const mediaType: RoomMediaType = body.mediaType || "none";

                let passcodeHash: string = null;
                if (isPrivate) {
                    const passcode = body.passcode?.trim();
                    if (!passcode || passcode.length < 4) {
                        return c.json({ error: "Private rooms require a passcode of at least 4 characters" }, 400);
                    }
                    passcodeHash = await this.server.Password.hash(passcode);
                }

                let roomCode = "";
                let exists = true;
                while (exists) {
                    roomCode = Math.floor(10000000 + Math.random() * 90000000).toString();
                    exists = await RoomModel.selectRoomExistsByCode(roomCode);
                }

                const roomId = await RoomModel.createRoom(roomCode, title, user.id, description, isPrivate, passcodeHash, maxParticipants, mediaType, null);

                try {
                    await RoomStateService.addActiveRoom(roomId);
                    await RoomStateService.setPlaybackState(roomId, {
                        mediaId: null,
                        mediaType,
                        sourceUrl: "",
                        currentTime: 0,
                        isPlaying: false,
                        playbackSpeed: 1,
                        volume: 1,
                        updatedBy: user.id,
                        updatedAt: new Date().toISOString(),
                    });
                } catch (redisErr: any) {
                    this.server.warn("Room Route", `Redis init error for room ${roomId}: ${redisErr?.message || redisErr}`);
                }

                const createdRoom = await RoomModel.selectRoom(roomId);
                const safeRoom: RoomSafeDTO = {
                    id: createdRoom.id,
                    roomCode: createdRoom.roomCode,
                    title: createdRoom.title,
                    description: createdRoom.description,
                    hostId: createdRoom.hostId,
                    status: createdRoom.status,
                    mediaType: createdRoom.mediaType,
                    currentMediaId: createdRoom.currentMediaId,
                    isPrivate: createdRoom.isPrivate,
                    maxParticipants: createdRoom.maxParticipants,
                    createdAt: createdRoom.createdAt,
                    updatedAt: createdRoom.updatedAt,
                    endedAt: createdRoom.endedAt,
                };

                this.server.log("Room Route", `Created room ${roomId} (${roomCode}) by user ${user.id}`);

                return c.json(
                    {
                        message: "Room created successfully",
                        room: safeRoom,
                    },
                    201
                );
            } catch (error: any) {
                this.server.error("Room Route", `Post /rooms error: ${error?.message || error}`);
                return c.json({ error: "Failed to create room" }, 500);
            }
        });

        this.app.get("/code/:code", async (c) => {
            try {
                const code = c.req.param("code")?.trim();
                if (!code) {
                    return c.json({ error: "Room code is required" }, 400);
                }

                const room = await RoomModel.selectRoomByCode(code);
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                let host = undefined;
                try {
                    const hostUser = await UserModel.selectUser(room.hostId);
                    if (hostUser) {
                        host = {
                            id: hostUser.id,
                            displayName: hostUser.displayName,
                            avatarUrl: hostUser.avatarUrl,
                        };
                    }
                } catch {
                    // ignore
                }

                let participantCount = 0;
                try {
                    participantCount = await RoomStateService.getParticipantCount(room.id);
                } catch {
                    // ignore
                }

                const safeRoom: RoomSafeDTO & { host?: typeof host; participantCount: number } = {
                    id: room.id,
                    roomCode: room.roomCode,
                    title: room.title,
                    description: room.description,
                    hostId: room.hostId,
                    host,
                    status: room.status,
                    mediaType: room.mediaType,
                    currentMediaId: room.currentMediaId,
                    isPrivate: room.isPrivate,
                    participantCount,
                    maxParticipants: room.maxParticipants,
                    createdAt: room.createdAt,
                    updatedAt: room.updatedAt,
                    endedAt: room.endedAt,
                };

                return c.json({ room: safeRoom });
            } catch (error: any) {
                this.server.error("Room Route", `Get /rooms/code/:code error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve room by code" }, 500);
            }
        });

        this.app.get("/:id", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const room = await RoomModel.selectRoom(id);
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                let host = undefined;
                try {
                    const hostUser = await UserModel.selectUser(room.hostId);
                    if (hostUser) {
                        host = {
                            id: hostUser.id,
                            displayName: hostUser.displayName,
                            avatarUrl: hostUser.avatarUrl,
                        };
                    }
                } catch {
                    // ignore
                }

                let participantCount = 0;
                try {
                    participantCount = await RoomStateService.getParticipantCount(room.id);
                } catch {
                    // ignore
                }

                const safeRoom: RoomSafeDTO & { host?: typeof host; participantCount: number } = {
                    id: room.id,
                    roomCode: room.roomCode,
                    title: room.title,
                    description: room.description,
                    hostId: room.hostId,
                    host,
                    status: room.status,
                    mediaType: room.mediaType,
                    currentMediaId: room.currentMediaId,
                    isPrivate: room.isPrivate,
                    participantCount,
                    maxParticipants: room.maxParticipants,
                    createdAt: room.createdAt,
                    updatedAt: room.updatedAt,
                    endedAt: room.endedAt,
                };

                return c.json({ room: safeRoom });
            } catch (error: any) {
                this.server.error("Room Route", `Get /rooms/:id error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve room" }, 500);
            }
        });

        this.app.post("/:id/verify-passcode", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const room = await RoomModel.selectRoom(id);
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                if (!room.isPrivate || !room.passcode) {
                    return c.json({ verified: true, roomId: room.id });
                }

                let body: { passcode?: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Passcode is required", verified: false }, 400);
                }

                const passcode = body.passcode?.trim();
                if (!passcode) {
                    return c.json({ error: "Passcode is required", verified: false }, 400);
                }

                const match = await this.server.Password.verify(passcode, room.passcode);
                if (!match) {
                    return c.json({ error: "Invalid passcode", verified: false }, 401);
                }

                return c.json({ verified: true, roomId: room.id });
            } catch (error: any) {
                this.server.error("Room Route", `Verify passcode error: ${error?.message || error}`);
                return c.json({ error: "Failed to verify room passcode" }, 500);
            }
        });

        this.app.patch("/:id", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                const room = await RoomModel.selectRoom(id);
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                if (room.hostId !== user.id && user.role !== "admin") {
                    return c.json({ error: "Forbidden: Only the room host can update room details" }, 403);
                }

                let body: {
                    title?: string;
                    description?: string;
                    maxParticipants?: number;
                    isPrivate?: boolean;
                    passcode?: string;
                };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const fieldsToUpdate: Partial<RoomType> = {};

                if (body.title !== undefined) {
                    const trimmedTitle = body.title?.trim();
                    if (!trimmedTitle || trimmedTitle.length > 150) {
                        return c.json({ error: "Title must be between 1 and 150 characters" }, 400);
                    }
                    fieldsToUpdate.title = trimmedTitle;
                }

                if (body.description !== undefined) {
                    fieldsToUpdate.description = body.description?.trim() || "";
                }

                if (body.maxParticipants !== undefined) {
                    fieldsToUpdate.maxParticipants = body.maxParticipants;
                }

                if (body.isPrivate !== undefined) {
                    const isPrivate = Boolean(body.isPrivate);
                    fieldsToUpdate.isPrivate = isPrivate;
                    if (isPrivate) {
                        const passcode = body.passcode?.trim();
                        if (passcode) {
                            if (passcode.length < 4) {
                                return c.json({ error: "Private rooms require a passcode of at least 4 characters" }, 400);
                            }
                            fieldsToUpdate.passcode = await this.server.Password.hash(passcode);
                        } else if (!room.isPrivate || !room.passcode) {
                            return c.json({ error: "Private rooms require a passcode of at least 4 characters" }, 400);
                        }
                    } else {
                        fieldsToUpdate.passcode = null;
                    }
                } else if (body.passcode !== undefined) {
                    if (!room.isPrivate) {
                        return c.json({ error: "Cannot set a passcode for a public room" }, 400);
                    }
                    const passcode = body.passcode?.trim();
                    if (!passcode || passcode.length < 4) {
                        return c.json({ error: "Private rooms require a passcode of at least 4 characters" }, 400);
                    }
                    fieldsToUpdate.passcode = await this.server.Password.hash(passcode);
                }

                if (Object.keys(fieldsToUpdate).length > 0) {
                    await RoomModel.updateRoomFields(id, fieldsToUpdate);
                }

                const updatedRoom = await RoomModel.selectRoom(id);
                const safeRoom: RoomSafeDTO = {
                    id: updatedRoom.id,
                    roomCode: updatedRoom.roomCode,
                    title: updatedRoom.title,
                    description: updatedRoom.description,
                    hostId: updatedRoom.hostId,
                    status: updatedRoom.status,
                    mediaType: updatedRoom.mediaType,
                    currentMediaId: updatedRoom.currentMediaId,
                    isPrivate: updatedRoom.isPrivate,
                    maxParticipants: updatedRoom.maxParticipants,
                    createdAt: updatedRoom.createdAt,
                    updatedAt: updatedRoom.updatedAt,
                    endedAt: updatedRoom.endedAt,
                };

                return c.json({
                    message: "Room updated successfully",
                    room: safeRoom,
                });
            } catch (error: any) {
                this.server.error("Room Route", `Update room error: ${error?.message || error}`);
                return c.json({ error: "Failed to update room" }, 500);
            }
        });

        this.app.post("/:id/end", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                const room = await RoomModel.selectRoom(id);
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                if (room.hostId !== user.id && user.role !== "admin") {
                    return c.json({ error: "Forbidden: Only the room host can end the room" }, 403);
                }

                await RoomModel.endRoom(id);

                try {
                    await RoomStateService.cleanupRoom(id);
                } catch (redisErr: any) {
                    this.server.warn("Room Route", `Redis cleanup error for room ${id}: ${redisErr?.message || redisErr}`);
                }

                try {
                    RoomSocket.endRoom(id, "Room has been ended by the host");
                } catch (socketErr: any) {
                    this.server.warn("Room Route", `Socket endRoom emit error: ${socketErr?.message || socketErr}`);
                }

                this.server.log("Room Route", `Room ${id} ended by user ${user.id}`);

                return c.json({
                    message: "Room ended successfully",
                    roomId: id,
                    endedAt: new Date().toISOString(),
                });
            } catch (error: any) {
                this.server.error("Room Route", `End room error: ${error?.message || error}`);
                return c.json({ error: "Failed to end room" }, 500);
            }
        });

        this.app.get("/:id/playback", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                let playbackState = await RoomStateService.getPlaybackState(id);
                if (!playbackState) {
                    playbackState = {
                        mediaId: null,
                        mediaType: "none",
                        sourceUrl: "",
                        currentTime: 0,
                        isPlaying: false,
                        playbackSpeed: 1,
                        volume: 1,
                        updatedBy: 0,
                        updatedAt: new Date().toISOString(),
                    };
                }

                return c.json({
                    roomId: id,
                    playbackState,
                });
            } catch (error: any) {
                this.server.error("Room Route", `Get playback error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve playback state" }, 500);
            }
        });

        this.app.get("/:id/participants", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const participants = await RoomStateService.getParticipants(id);

                return c.json({
                    roomId: id,
                    count: participants.length,
                    participants,
                });
            } catch (error: any) {
                this.server.error("Room Route", `Get participants error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve room participants" }, 500);
            }
        });

        this.app.get("/:id/messages", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid room ID" }, 400);
                }

                const messages = await RoomStateService.getMessages(id, 100);

                return c.json({
                    roomId: id,
                    messages,
                });
            } catch (error: any) {
                this.server.error("Room Route", `Get messages error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve room messages" }, 500);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
