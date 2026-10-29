import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RoomHostDTO, RoomMediaType, RoomSafeDTO } from "../interfaces/Database";
import type { RouteInterface } from "../interfaces/Route";
import type { RoomType } from "../interfaces/Type";
import RoomModel from "../models/RoomModel";
import UserModel from "../models/UserModel";
import RoomReconciliationService from "../services/RoomReconciliationService";
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

                const activeRooms = await RoomModel.selectRoomsWithHost();
                const filteredRooms = activeRooms.filter((r) => {
                    if (search) {
                        const titleMatch = (r.title || "").toLowerCase().includes(search);
                        const codeMatch = (r.roomCode || "").toLowerCase().includes(search);
                        const hostMatch = (r.host?.displayName || "").toLowerCase().includes(search);
                        if (!titleMatch && !codeMatch && !hostMatch) return false;
                    }

                    if (mediaType !== "all" && r.mediaType !== mediaType) {
                        return false;
                    }

                    return true;
                });

                const roomsWithDetails = await Promise.all(
                    filteredRooms.map(async (room) => {
                        let participantCount = 0;
                        try {
                            participantCount = await RoomStateService.getParticipantCount(room.id);
                        } catch {
                            // ignore redis error
                        }

                        const safeRoom: RoomSafeDTO & { host: RoomHostDTO; participantCount: number } = {
                            id: room.id,
                            roomCode: room.roomCode,
                            title: room.title,
                            description: room.description,
                            hostId: room.hostId,
                            host: room.host,
                            mediaType: room.mediaType,
                            currentMediaId: room.currentMediaId,
                            isPrivate: room.isPrivate,
                            participantCount,
                            maxParticipants: room.maxParticipants,
                            createdAt: room.createdAt,
                            updatedAt: room.updatedAt,
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
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Get /rooms error: ${message}`);
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
                const rawMax = body.maxParticipants !== undefined ? Number(body.maxParticipants) : 100;
                if (isNaN(rawMax) || rawMax < 1 || rawMax > 1000) {
                    return c.json({ error: "Max participants must be a number between 1 and 1000" }, 400);
                }
                const maxParticipants = rawMax;
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
                } catch (redisErr) {
                    const redisMsg = redisErr instanceof Error ? redisErr.message : String(redisErr);
                    this.server.warn("Room Route", `Redis init error for room ${roomId}: ${redisMsg}`);
                }

                const createdRoom = await RoomModel.selectRoom(roomId);
                const safeRoom: RoomSafeDTO = {
                    id: createdRoom.id,
                    roomCode: createdRoom.roomCode,
                    title: createdRoom.title,
                    description: createdRoom.description,
                    hostId: createdRoom.hostId,
                    mediaType: createdRoom.mediaType,
                    currentMediaId: createdRoom.currentMediaId,
                    isPrivate: createdRoom.isPrivate,
                    maxParticipants: createdRoom.maxParticipants,
                    createdAt: createdRoom.createdAt,
                    updatedAt: createdRoom.updatedAt,
                };

                this.server.log("Room Route", `Created room ${roomId} (${roomCode}) by user ${user.id}`);

                return c.json(
                    {
                        message: "Room created successfully",
                        room: safeRoom,
                    },
                    201
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Post /rooms error: ${message}`);
                return c.json({ error: "Failed to create room" }, 500);
            }
        });

        this.app.get("/:code", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
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

                const effectiveMedia = await RoomReconciliationService.getEffectiveRoomMedia(room.id, {
                    mediaType: room.mediaType,
                    currentMediaId: room.currentMediaId,
                });

                const safeRoom: RoomSafeDTO & { host?: typeof host; participantCount: number } = {
                    id: room.id,
                    roomCode: room.roomCode,
                    title: room.title,
                    description: room.description,
                    hostId: room.hostId,
                    host,
                    mediaType: effectiveMedia.mediaType,
                    currentMediaId: effectiveMedia.currentMediaId,
                    isPrivate: room.isPrivate,
                    participantCount,
                    maxParticipants: room.maxParticipants,
                    createdAt: room.createdAt,
                    updatedAt: room.updatedAt,
                };

                return c.json({ room: safeRoom });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Get /rooms/:code error: ${message}`);
                return c.json({ error: "Failed to retrieve room" }, 500);
            }
        });

        this.app.get("/code/:code", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
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

                const effectiveMedia = await RoomReconciliationService.getEffectiveRoomMedia(room.id, {
                    mediaType: room.mediaType,
                    currentMediaId: room.currentMediaId,
                });

                const safeRoom: RoomSafeDTO & { host?: typeof host; participantCount: number } = {
                    id: room.id,
                    roomCode: room.roomCode,
                    title: room.title,
                    description: room.description,
                    hostId: room.hostId,
                    host,
                    mediaType: effectiveMedia.mediaType,
                    currentMediaId: effectiveMedia.currentMediaId,
                    isPrivate: room.isPrivate,
                    participantCount,
                    maxParticipants: room.maxParticipants,
                    createdAt: room.createdAt,
                    updatedAt: room.updatedAt,
                };

                return c.json({ room: safeRoom });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Get /rooms/code/:code error: ${message}`);
                return c.json({ error: "Failed to retrieve room by code" }, 500);
            }
        });

        this.app.post("/:code/verify-passcode", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                if (!room.isPrivate || !room.passcode) {
                    return c.json({ verified: true, roomId: room.id, roomCode: room.roomCode });
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

                return c.json({ verified: true, roomId: room.id, roomCode: room.roomCode });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Verify passcode error: ${message}`);
                return c.json({ error: "Failed to verify room passcode" }, 500);
            }
        });

        this.app.patch("/:code", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
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
                    const max = Number(body.maxParticipants);
                    if (isNaN(max) || max < 1 || max > 1000) {
                        return c.json({ error: "Max participants must be a number between 1 and 1000" }, 400);
                    }
                    fieldsToUpdate.maxParticipants = max;
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
                    await RoomModel.updateRoomFields(room.id, fieldsToUpdate);
                }

                const updatedRoom = await RoomModel.selectRoom(room.id);
                const safeRoom: RoomSafeDTO = {
                    id: updatedRoom.id,
                    roomCode: updatedRoom.roomCode,
                    title: updatedRoom.title,
                    description: updatedRoom.description,
                    hostId: updatedRoom.hostId,
                    mediaType: updatedRoom.mediaType,
                    currentMediaId: updatedRoom.currentMediaId,
                    isPrivate: updatedRoom.isPrivate,
                    maxParticipants: updatedRoom.maxParticipants,
                    createdAt: updatedRoom.createdAt,
                    updatedAt: updatedRoom.updatedAt,
                };

                return c.json({
                    message: "Room updated successfully",
                    room: safeRoom,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Update room error: ${message}`);
                return c.json({ error: "Failed to update room" }, 500);
            }
        });

        this.app.post("/:code/end", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                if (room.hostId !== user.id && user.role !== "admin") {
                    return c.json({ error: "Forbidden: Only the room host can end the room" }, 403);
                }

                RoomSocket.cancelHostDisconnect(room.id);

                await RoomModel.deleteRoom(room.id);

                try {
                    await RoomStateService.cleanupRoom(room.id);
                } catch (redisErr) {
                    const redisMsg = redisErr instanceof Error ? redisErr.message : String(redisErr);
                    this.server.warn("Room Route", `Redis cleanup error for room ${room.id}: ${redisMsg}`);
                }

                try {
                    RoomSocket.endRoom(room.id, "Room has been closed by the host");
                } catch (socketErr) {
                    const socketMsg = socketErr instanceof Error ? socketErr.message : String(socketErr);
                    this.server.warn("Room Route", `Socket endRoom emit error: ${socketMsg}`);
                }

                this.server.log("Room Route", `Room ${room.id} (${room.roomCode}) deleted by user ${user.id}`);

                return c.json({
                    message: "Room deleted successfully",
                    roomId: room.id,
                    roomCode: room.roomCode,
                    endedAt: new Date().toISOString(),
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `End room error: ${message}`);
                return c.json({ error: "Failed to end room" }, 500);
            }
        });

        this.app.get("/:code/playback", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                let playbackState = await RoomStateService.getPlaybackState(room.id);
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
                    roomId: room.id,
                    roomCode: room.roomCode,
                    playbackState,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Get playback error: ${message}`);
                return c.json({ error: "Failed to retrieve playback state" }, 500);
            }
        });

        this.app.get("/:code/participants", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                const participants = await RoomStateService.getParticipants(room.id);

                return c.json({
                    roomId: room.id,
                    roomCode: room.roomCode,
                    count: participants.length,
                    participants,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Get participants error: ${message}`);
                return c.json({ error: "Failed to retrieve room participants" }, 500);
            }
        });

        this.app.get("/:code/messages", async (c) => {
            try {
                const code = c.req.param("code");
                if (!Number(code)) {
                    return c.json({ error: "Room code must be a number" }, 400);
                }

                let room = await RoomModel.selectRoomByCode(code);
                if (!room && !isNaN(Number(code))) {
                    room = await RoomModel.selectRoom(Number(code));
                }
                if (!room) {
                    return c.json({ error: "Room not found" }, 404);
                }

                const messages = await RoomStateService.getMessages(room.id, 100);

                return c.json({
                    roomId: room.id,
                    roomCode: room.roomCode,
                    messages,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Room Route", `Get messages error: ${message}`);
                return c.json({ error: "Failed to retrieve room messages" }, 500);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
