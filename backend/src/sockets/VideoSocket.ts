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

            const authCheck = await this.validateHost(socket, data.roomId);
            if (!authCheck.success) {
                socket.emit("error", authCheck.error);
                return;
            }

            const roomKey = `room:${data.roomId}`;
            this.server.log("Socket:Video", `Video changed in ${roomKey} by host ${authCheck.userId}: ${data.sourceType}`);

            await RoomStateService.setPlaybackState(data.roomId, {
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

            try {
                await RoomModel.updateRoomFields(Number(data.roomId), {
                    mediaType: data.sourceType,
                    currentMediaId: data.mediaId ?? null,
                });
            } catch (dbErr) {
                const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
                this.server.warn("Socket:Video", `Failed to update room ${data.roomId} media in DB: ${dbMsg}`);
            }

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
        // 1. Enforce socket identity (Authentication)
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

        // 2. Enforce room-membership context
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

        // 3. Enforce host authorization
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
