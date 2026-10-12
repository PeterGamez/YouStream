import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { SocketErrorPayload, VideoChangePayload, VideoControlPayload } from "../interfaces/Socket";
import RoomModel from "../models/RoomModel";
import RoomStateService from "../services/RoomStateService";

export default class VideoSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        socket.on("video:change", async (data: VideoChangePayload) => {
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

            const authCheck = await this.validateHost(socket, roomId);
            if (!authCheck.success) {
                socket.emit("error", authCheck.error);
                return;
            }

            const room = await RoomModel.selectRoom(roomId);
            if (!room) {
                socket.emit("error", {
                    code: "ROOM_NOT_FOUND",
                    message: "Room not found",
                });
                return;
            }

            const previousMediaType = room.mediaType;
            const previousMediaId = room.currentMediaId;

           try {
                await RoomModel.updateRoomFields(roomId, {
                    mediaType: data.sourceType,
                    currentMediaId: data.mediaId ?? null,
                });
            } catch (dbErr) {
                const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
                this.server.error("Socket:Video", `Failed to update room ${roomId} media in DB: ${dbMsg}`);
                socket.emit("error", {
                    code: "INTERNAL_ERROR",
                    message: "Failed to update room media in database",
                });
                return;
            }

            try {
                await RoomStateService.setPlaybackState(roomId, {
                    mediaId: data.mediaId ?? null,
                    mediaType: data.sourceType,
                    sourceUrl: (data.sourceType === "youtube" ? data.youtubeId : data.fileUrl) || "",
                    currentTime: 0,
                    isPlaying: false,
                    playbackSpeed: 1,
                    volume: 1,
                    updatedBy: authCheck.userId,
                    updatedAt: new Date().toISOString(),
                });
            } catch (redisErr) {
                const redisMsg = redisErr instanceof Error ? redisErr.message : String(redisErr);
                this.server.error("Socket:Video", `Failed to update playback state in Redis for room ${roomId}: ${redisMsg}`);

                try {
                    await RoomModel.updateRoomFields(roomId, {
                        mediaType: previousMediaType,
                        currentMediaId: previousMediaId,
                    });
                } catch (rollbackErr) {
                    const rollbackMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
                    this.server.error("Socket:Video", `Failed to rollback room ${roomId} media in DB: ${rollbackMsg}`);
                }

                socket.emit("error", {
                    code: "INTERNAL_ERROR",
                    message: "Failed to update playback state in cache",
                });
                return;
            }

            const roomKey = `room:${roomId}`;
            this.server.log("Socket:Video", `Video changed in ${roomKey} by host ${authCheck.userId}: ${data.sourceType}`);

            this.io.to(roomKey).emit("video:update", {
                mediaId: data.mediaId ?? null,
                sourceType: data.sourceType,
                youtubeId: data.youtubeId,
                fileUrl: data.fileUrl,
                title: data.title || "",
            });
        });

        socket.on("video:control", async (data: VideoControlPayload) => {
            if (!data?.roomId) {
                const errorPayload: SocketErrorPayload = {
                    code: "INVALID_ROOM_ID",
                    message: "Room ID is required",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const authCheck = await this.validateHost(socket, data.roomId);
            if (!authCheck.success) {
                socket.emit("error", authCheck.error);
                return;
            }

            const roomKey = `room:${data.roomId}`;
            this.server.log("Socket:Video", `Video control in ${roomKey} by host ${authCheck.userId}: ${data.action} at ${data.currentTime}s`);

            const isPlaying = data.action === "play" ? true : data.action === "pause" ? false : undefined;
            await RoomStateService.setPlaybackState(data.roomId, {
                currentTime: data.currentTime,
                ...(isPlaying !== undefined ? { isPlaying } : {}),
                ...(data.speed !== undefined ? { playbackSpeed: data.speed } : {}),
                ...(data.volume !== undefined ? { volume: data.volume } : {}),
                updatedBy: authCheck.userId,
                updatedAt: new Date().toISOString(),
            });

            socket.to(roomKey).emit("video:sync", {
                action: data.action,
                currentTime: data.currentTime,
                speed: data.speed ?? 1.0,
                timestamp: new Date().toISOString(),
            });
        });
    }

    private static async validateHost(socket: Socket, roomId: number | string): Promise<{ success: boolean; userId?: number; error?: SocketErrorPayload }> {
        let userId: number = socket.data?.userId || socket.data?.user?.id;
        const session = await RoomStateService.getSocketSession(socket.id);
        if (!userId && session?.userId) {
            userId = session.userId;
        }

        if (!userId) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Authentication required to perform this action",
                },
            };
        }

        const roomKey = `room:${roomId}`;

        const isInRoom = socket.rooms.has(roomKey) || (session && String(session.roomId) === String(roomId));
        if (!isInRoom) {
            return {
                success: false,
                error: {
                    code: "NOT_IN_ROOM",
                    message: "You must be a member of this room to control video",
                },
            };
        }

        if (socket.data?.user?.role === "admin") {
            return { success: true, userId };
        }

        const participant = await RoomStateService.getParticipant(roomId, userId);
        if (participant?.role === "host") {
            return { success: true, userId };
        }

        const room = await RoomModel.selectRoom(Number(roomId));
        if (room && room.hostId === userId) {
            return { success: true, userId };
        }

        return {
            success: false,
            error: {
                code: "FORBIDDEN",
                message: "Only the room host can control or change video playback",
            },
        };
    }
}
