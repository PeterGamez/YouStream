import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { RedisParticipantRole } from "../interfaces/Redis";
import type { RoomEndPayload, RoomJoinPayload, RoomLeavePayload, SocketErrorPayload } from "../interfaces/Socket";
import RoomModel from "../models/RoomModel";
import RoomReconciliationService from "../services/RoomReconciliationService";
import RoomStateService from "../services/RoomStateService";
import UserService from "../services/UserService";

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

            const room = await RoomModel.selectRoom(roomId);
            if (!room) {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_NOT_FOUND",
                    message: "Room not found",
                };
                socket.emit("error", errorPayload);
                return;
            }

            if (room.status !== "active") {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_ENDED",
                    message: "This room has ended and is no longer active",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const session = await RoomStateService.getSocketSession(socket.id);
            let userId = socket.data?.userId || socket.data?.user?.id || session?.userId;

            if (!userId) {
                const errorPayload: SocketErrorPayload = {
                    code: "UNAUTHORIZED",
                    message: "Authentication required to join the room",
                };
                socket.emit("error", errorPayload);
                return;
            }

            if (!socket.data?.userId) {
                socket.data.userId = userId;
            }

            const freshUser = await UserService.revalidateSocketUser(socket);
            if (!freshUser) {
                const errorPayload: SocketErrorPayload = {
                    code: "UNAUTHORIZED",
                    message: "Authentication required or user session has expired",
                };
                socket.emit("error", errorPayload);
                return;
            }

            userId = freshUser.id;
            const isAdmin = freshUser.role === "admin";
            const isHost = room.hostId === userId || isAdmin;

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

            if (room.maxParticipants && room.maxParticipants > 0 && !isHost) {
                const existingParticipant = await RoomStateService.getParticipant(roomId, userId);
                if (!existingParticipant) {
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
            }

            const roomKey = RoomStateService.getRoomKey(roomId);
            socket.join(roomKey);

            await RoomStateService.setSocketSession(socket.id, userId, roomId);
            await RoomStateService.addActiveRoom(roomId);

            const role: RedisParticipantRole = isHost ? "host" : "viewer";
            const displayName = socket.data?.user?.displayName || "";
            const avatarUrl = socket.data?.user?.avatarUrl;

            const existingParticipant = await RoomStateService.getParticipant(roomId, userId);

            await RoomStateService.addParticipant(roomId, {
                userId,
                displayName: displayName || existingParticipant?.displayName || "",
                avatarUrl: avatarUrl ?? existingParticipant?.avatarUrl,
                role,
                socketId: socket.id,
                joinedAt: existingParticipant?.joinedAt || new Date().toISOString(),
            });

            this.server.log("Socket:Room", `Client ${socket.id} (user ${userId}, role: ${role}) joined ${roomKey}`);

            const recentMessages = await RoomStateService.getMessages(roomId, 100);
            const participants = await RoomStateService.getParticipants(roomId);
            const playbackState = await RoomStateService.getPlaybackState(roomId);

            const effectiveMedia = await RoomReconciliationService.getEffectiveRoomMedia(roomId, {
                mediaType: room.mediaType,
                currentMediaId: room.currentMediaId,
            });
            room.mediaType = effectiveMedia.mediaType;
            room.currentMediaId = effectiveMedia.currentMediaId;

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
                    mediaId: room.currentMediaId ?? null,
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

            if (!existingParticipant) {
                socket.to(roomKey).emit("room:user-joined", {
                    userId,
                    displayName,
                    role,
                });
            }
        });

        socket.on("room:leave", async (data: RoomLeavePayload) => {
            const session = await RoomStateService.getSocketSession(socket.id);
            const roomId = data?.roomId ? Number(data.roomId) : session?.roomId;
            if (!roomId || isNaN(roomId)) {
                await RoomStateService.delSocketSession(socket.id);
                return;
            }

            const roomKey = RoomStateService.getRoomKey(roomId);
            socket.leave(roomKey);

            const userId = session?.userId || socket.data?.userId || socket.data?.user?.id;
            await RoomStateService.delSocketSession(socket.id);

            if (userId) {
                const participant = await RoomStateService.getParticipant(roomId, userId);
                if (participant && participant.socketId === socket.id) {
                    const remainingSockets = await this.io.in(roomKey).fetchSockets();
                    const otherSocket = remainingSockets.find((s) => (s.data?.userId || s.data?.user?.id) === userId);

                    if (otherSocket) {
                        participant.socketId = otherSocket.id;
                        await RoomStateService.addParticipant(roomId, participant);
                    } else {
                        await RoomStateService.removeParticipant(roomId, userId);
                        this.io.to(roomKey).emit("room:user-left", {
                            userId: userId,
                            displayName: participant.displayName || socket.data?.user?.displayName || "",
                        });
                    }
                }
            }

            this.server.log("Socket:Room", `Client ${socket.id} left ${roomKey}`);
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

            let userId: number = socket.data?.userId || socket.data?.user?.id;
            const session = await RoomStateService.getSocketSession(socket.id);
            if (!userId && session?.userId) {
                userId = session.userId;
                socket.data.userId = userId;
            }

            if (!userId) {
                const errorPayload: SocketErrorPayload = {
                    code: "UNAUTHORIZED",
                    message: "Authentication required to end the room",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const freshUser = await UserService.revalidateSocketUser(socket);
            if (!freshUser) {
                const errorPayload: SocketErrorPayload = {
                    code: "UNAUTHORIZED",
                    message: "Authentication required or user session has expired",
                };
                socket.emit("error", errorPayload);
                return;
            }

            userId = freshUser.id;

            const roomKey = RoomStateService.getRoomKey(roomId);

            const isInRoom = socket.rooms.has(roomKey) || (session && Number(session.roomId) === roomId);
            if (!isInRoom) {
                const errorPayload: SocketErrorPayload = {
                    code: "NOT_IN_ROOM",
                    message: "You must be a member of this room to end it",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const room = await RoomModel.selectRoom(roomId);
            if (!room) {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_NOT_FOUND",
                    message: "Room not found",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const isAdmin = freshUser.role === "admin";
            const isHost = room.hostId === userId || isAdmin;

            if (!isHost) {
                const errorPayload: SocketErrorPayload = {
                    code: "FORBIDDEN",
                    message: "Forbidden: Only the room host or an administrator can end the room",
                };
                socket.emit("error", errorPayload);
                return;
            }

            try {
                await RoomModel.endRoom(roomId);
            } catch (dbErr) {
                const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
                this.server.error("Socket:Room", `Failed to end room ${roomId} in database: ${dbMsg}`);
                socket.emit("error", {
                    code: "INTERNAL_ERROR",
                    message: "Failed to terminate room in database",
                });
                return;
            }

            try {
                await RoomStateService.cleanupRoom(roomId);
            } catch (redisErr) {
                const redisMsg = redisErr instanceof Error ? redisErr.message : String(redisErr);
                this.server.warn("Socket:Room", `Redis cleanup error for room ${roomId}: ${redisMsg}`);
            }

            this.server.log("Socket:Room", `Room ${roomId} ended by user ${userId}`);

            const reason = data.reason || (isAdmin && room.hostId !== userId ? "Room terminated by administrator" : "Room has been ended by the host");

            this.endRoom(roomId, reason);
        });

        socket.on("disconnect", async () => {
            this.server.log("Socket:Room", `Client disconnected: ${socket.id}`);
            const session = await RoomStateService.getSocketSession(socket.id);
            if (session) {
                const roomKey = RoomStateService.getRoomKey(session.roomId);
                const participant = await RoomStateService.getParticipant(session.roomId, session.userId);

                if (participant && participant.socketId === socket.id) {
                    const remainingSockets = await this.io.in(roomKey).fetchSockets();
                    const otherSocket = remainingSockets.find((s) => (s.data?.userId || s.data?.user?.id) === session.userId);

                    if (otherSocket) {
                        participant.socketId = otherSocket.id;
                        await RoomStateService.addParticipant(session.roomId, participant);
                    } else {
                        await RoomStateService.removeParticipant(session.roomId, session.userId);
                        this.io.to(roomKey).emit("room:user-left", {
                            userId: session.userId,
                            displayName: participant.displayName || socket.data?.user?.displayName || "",
                        });
                    }
                }
            }
            await RoomStateService.delSocketSession(socket.id);
        });
    }

    public static endRoom(roomId: number | string, reason?: string): void {
        const roomKey = RoomStateService.getRoomKey(roomId);
        this.server.log("Socket:Room", `Room ended: ${roomKey}`);
        this.io.to(roomKey).emit("room:ended", {
            roomId: Number(roomId),
            reason: reason || "Room has been ended by the host",
        });
        this.io.in(roomKey).socketsLeave(roomKey);
    }
}
