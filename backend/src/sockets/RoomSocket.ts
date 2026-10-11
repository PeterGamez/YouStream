import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import Gravatar from "../integrations/Gravatar";
import type { RedisParticipantRole } from "../interfaces/Redis";
import type { RoomEndPayload, RoomJoinPayload, RoomLeavePayload, SocketErrorPayload } from "../interfaces/Socket";
import RoomModel from "../models/RoomModel";
import RoomStateService from "../services/RoomStateService";

export default class RoomSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        socket.on("room:join", async (data: RoomJoinPayload) => {
            if (!data?.roomId) {
                const errorPayload: SocketErrorPayload = {
                    code: "INVALID_ROOM_ID",
                    message: "Room ID is required",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const roomId = Number(data.roomId);
            if (isNaN(roomId)) {
                const errorPayload: SocketErrorPayload = {
                    code: "INVALID_ROOM_ID",
                    message: "Room ID must be a valid number",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 1. Look up room in database
            const room = await RoomModel.selectRoom(roomId);
            if (!room) {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_NOT_FOUND",
                    message: "Room not found",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 2. Validate room is active
            if (room.status !== "active") {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_ENDED",
                    message: "This room has ended and is no longer active",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 3. Resolve user identity and role
            const userId = socket.data?.userId || socket.data?.user?.id || 1;
            const isAdmin = socket.data?.user?.role === "admin";
            const isHost = room.hostId === userId || isAdmin;

            // 4. Validate passcode hash for private rooms (host and admin bypass)
            if (room.isPrivate && room.passcode && !isHost) {
                const passcode = data.passcode?.trim();
                if (!passcode) {
                    const errorPayload: SocketErrorPayload = {
                        code: "PASSCODE_REQUIRED",
                        message: "Passcode is required for this private room",
                    };
                    socket.emit("error", errorPayload);
                    return;
                }

                const isPasscodeValid = await this.server.Password.verify(passcode, room.passcode);
                if (!isPasscodeValid) {
                    const errorPayload: SocketErrorPayload = {
                        code: "INVALID_PASSCODE",
                        message: "Invalid room passcode",
                    };
                    socket.emit("error", errorPayload);
                    return;
                }
            }

            // 5. Check capacity limit
            if (room.maxParticipants && room.maxParticipants > 0 && !isHost) {
                const participantCount = await RoomStateService.getParticipantCount(roomId);
                if (participantCount >= room.maxParticipants) {
                    const errorPayload: SocketErrorPayload = {
                        code: "ROOM_FULL",
                        message: "Room has reached its maximum participant capacity",
                    };
                    socket.emit("error", errorPayload);
                    return;
                }
            }

            // 6. Validated: Join Socket.IO room channel
            const roomKey = `room:${roomId}`;
            socket.join(roomKey);

            await RoomStateService.setSocketSession(socket.id, userId, roomId);
            await RoomStateService.addActiveRoom(roomId);

            const role: RedisParticipantRole = isHost ? "host" : "viewer";
            const displayName = socket.data?.user?.displayName || socket.data?.user?.username || (role === "host" ? "Host" : `Viewer ${userId}`);
            const avatarUrl = socket.data?.user?.avatarUrl || Gravatar.getDefaultAvatarURL();

            await RoomStateService.addParticipant(roomId, {
                userId,
                displayName,
                avatarUrl,
                role,
                socketId: socket.id,
                joinedAt: new Date().toISOString(),
            });

            this.server.log("Socket:Room", `Client ${socket.id} (user ${userId}, role: ${role}) joined ${roomKey}`);

            const recentMessages = await RoomStateService.getMessages(roomId, 100);
            const participants = await RoomStateService.getParticipants(roomId);
            const playbackState = await RoomStateService.getPlaybackState(roomId);

            socket.emit("room:joined", {
                roomInfo: {
                    id: room.id,
                    roomCode: room.roomCode,
                    title: room.title,
                    description: room.description,
                    hostId: room.hostId,
                    status: room.status,
                    mediaType: room.mediaType,
                    currentMediaId: room.currentMediaId,
                    isPrivate: !!room.isPrivate,
                    maxParticipants: room.maxParticipants,
                },
                playbackState: playbackState || {
                    mediaId: null,
                    mediaType: room.mediaType || "none",
                    sourceUrl: "",
                    currentTime: 0,
                    isPlaying: false,
                    playbackSpeed: 1,
                    volume: 1,
                    updatedBy: room.hostId,
                    updatedAt: new Date().toISOString(),
                },
                participants,
                recentMessages,
            });

            socket.to(roomKey).emit("room:user-joined", {
                userId,
                displayName,
                role,
            });
        });

        socket.on("room:leave", async (data: RoomLeavePayload) => {
            const roomKey = `room:${data.roomId}`;
            socket.leave(roomKey);

            const session = await RoomStateService.getSocketSession(socket.id);
            const userId = session?.userId || socket.data?.userId || socket.data?.user?.id;
            if (userId) {
                await RoomStateService.removeParticipant(data.roomId, userId);
            }
            await RoomStateService.delSocketSession(socket.id);

            this.server.log("Socket:Room", `Client ${socket.id} left ${roomKey}`);

            this.io.to(roomKey).emit("room:user-left", {
                userId: userId || 2,
                displayName: socket.data?.user?.displayName || "ViewerName",
            });
        });

        socket.on("room:end", async (data: RoomEndPayload) => {
            if (!data?.roomId) {
                const errorPayload: SocketErrorPayload = {
                    code: "INVALID_ROOM_ID",
                    message: "Room ID is required",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const roomId = Number(data.roomId);
            if (isNaN(roomId)) {
                const errorPayload: SocketErrorPayload = {
                    code: "INVALID_ROOM_ID",
                    message: "Room ID must be a valid number",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 1. Enforce socket identity (Authentication)
            let userId: number = socket.data?.userId || socket.data?.user?.id;
            const session = await RoomStateService.getSocketSession(socket.id);
            if (!userId && session?.userId) {
                userId = session.userId;
            }

            if (!userId) {
                const errorPayload: SocketErrorPayload = {
                    code: "UNAUTHORIZED",
                    message: "Authentication required to end the room",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const roomKey = `room:${roomId}`;

            // 2. Enforce room-membership context
            const isInRoom = socket.rooms.has(roomKey) || (session && Number(session.roomId) === roomId);
            if (!isInRoom) {
                const errorPayload: SocketErrorPayload = {
                    code: "NOT_IN_ROOM",
                    message: "You must be a member of this room to end it",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 3. Query the room from database
            const room = await RoomModel.selectRoom(roomId);
            if (!room) {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_NOT_FOUND",
                    message: "Room not found",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 4. Enforce host / admin authorization
            const isAdmin = socket.data?.user?.role === "admin";
            const isHost = room.hostId === userId || isAdmin;

            if (!isHost) {
                const errorPayload: SocketErrorPayload = {
                    code: "FORBIDDEN",
                    message: "Forbidden: Only the room host or an administrator can end the room",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 5. Execute room-ending operations (DB update + Redis cleanup + broadcast)
            try {
                await RoomModel.endRoom(roomId);
            } catch (dbErr: any) {
                this.server.error("Socket:Room", `Failed to end room ${roomId} in database: ${dbErr?.message || dbErr}`);
                socket.emit("error", {
                    code: "INTERNAL_ERROR",
                    message: "Failed to terminate room in database",
                });
                return;
            }

            try {
                await RoomStateService.cleanupRoom(roomId);
            } catch (redisErr: any) {
                this.server.warn("Socket:Room", `Redis cleanup error for room ${roomId}: ${redisErr?.message || redisErr}`);
            }

            this.server.log("Socket:Room", `Room ${roomId} ended by user ${userId}`);

            const reason = data.reason || (isAdmin && room.hostId !== userId ? "Room terminated by administrator" : "Room has been ended by the host");

            this.endRoom(roomId, reason);
        });

        socket.on("disconnect", async () => {
            this.server.log("Socket:Room", `Client disconnected: ${socket.id}`);
            const session = await RoomStateService.getSocketSession(socket.id);
            if (session) {
                await RoomStateService.removeParticipant(session.roomId, session.userId);
            }
            await RoomStateService.delSocketSession(socket.id);
        });
    }

    public static endRoom(roomId: number | string, reason?: string): void {
        const roomKey = `room:${roomId}`;
        this.server.log("Socket:Room", `Room ended: ${roomKey}`);
        this.io.to(roomKey).emit("room:ended", {
            roomId: Number(roomId),
            reason: reason || "Room has been ended by the host",
        });
        this.io.in(roomKey).socketsLeave(roomKey);
    }
}
