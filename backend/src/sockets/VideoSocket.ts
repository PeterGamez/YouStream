import { existsSync } from "node:fs";

import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { MediaInterface } from "../interfaces/Database";
import type { SocketErrorPayload, VideoChangePayload, VideoControlPayload } from "../interfaces/Socket";
import MediaModel from "../models/MediaModel";
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

            if (data?.sourceType !== "youtube" && data?.sourceType !== "local_file") {
                const errorPayload: SocketErrorPayload = {
                    code: "INVALID_SOURCE_TYPE",
                    message: "Source type must be 'youtube' or 'local_file'",
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

            let media: MediaInterface | null = null;
            if (data.mediaId !== undefined && data.mediaId !== null) {
                const mediaId = Number(data.mediaId);
                if (isNaN(mediaId)) {
                    socket.emit("error", {
                        code: "INVALID_MEDIA_ID",
                        message: "Media ID must be a valid number",
                    });
                    return;
                }
                media = await MediaModel.selectMedia(mediaId);
                if (!media) {
                    socket.emit("error", {
                        code: "MEDIA_NOT_FOUND",
                        message: "Referenced media not found",
                    });
                    return;
                }
            } else if (data.sourceType === "youtube" && data.youtubeId) {
                media = await MediaModel.selectMediaByYoutubeVideoId(data.youtubeId);
            }

            if (!media) {
                socket.emit("error", {
                    code: "MEDIA_REQUIRED",
                    message: "A valid registered media item is required",
                });
                return;
            }

            if (media.sourceType !== data.sourceType) {
                socket.emit("error", {
                    code: "MEDIA_TYPE_MISMATCH",
                    message: `Media source type mismatch: media is '${media.sourceType}' but requested '${data.sourceType}'`,
                });
                return;
            }

            let derivedFileUrl: string | undefined;
            let derivedYoutubeId: string | undefined;
            let derivedSourceUrl: string;

            if (media.sourceType === "local_file") {
                if (media.filePath && !existsSync(media.filePath)) {
                    socket.emit("error", {
                        code: "MEDIA_FILE_NOT_FOUND",
                        message: "Media file not found on server storage",
                    });
                    return;
                }
                derivedFileUrl = media.sourceUrl;
                derivedSourceUrl = media.sourceUrl;
            } else {
                derivedYoutubeId = media.youtubeVideoId || data.youtubeId;
                derivedSourceUrl = media.sourceUrl || (derivedYoutubeId ? `https://www.youtube.com/watch?v=${derivedYoutubeId}` : "");
            }

            const derivedTitle = media.title || data.title || "";

            const previousMediaType = room.mediaType;
            const previousMediaId = room.currentMediaId;

            try {
                await RoomModel.updateRoomFields(roomId, {
                    mediaType: media.sourceType,
                    currentMediaId: media.id,
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
                    mediaId: media.id,
                    mediaType: media.sourceType,
                    sourceUrl: derivedSourceUrl,
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

            const { roomKey, userId } = authCheck;
            this.server.log("Socket:Video", `Video changed in ${roomKey} by host ${userId}: ${media.sourceType} (mediaId: ${media.id})`);

            this.io.to(roomKey).emit("video:update", {
                mediaId: media.id,
                sourceType: media.sourceType,
                youtubeId: derivedYoutubeId,
                fileUrl: derivedFileUrl,
                title: derivedTitle,
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

            const { roomKey, userId, roomId } = authCheck;
            this.server.log("Socket:Video", `Video control in ${roomKey} by host ${userId}: ${data.action} at ${data.currentTime}s`);

            const isPlaying = data.action === "play" ? true : data.action === "pause" ? false : undefined;
            await RoomStateService.setPlaybackState(roomId, {
                currentTime: data.currentTime,
                ...(isPlaying !== undefined ? { isPlaying } : {}),
                ...(data.speed !== undefined ? { playbackSpeed: data.speed } : {}),
                ...(data.volume !== undefined ? { volume: data.volume } : {}),
                updatedBy: userId,
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

    private static async validateHost(
        socket: Socket,
        roomId: number | string
    ): Promise<{
        success: boolean;
        userId?: number;
        roomKey?: string;
        roomId?: number;
        error?: SocketErrorPayload;
    }> {
        const numericRoomId = Number(roomId);
        if (isNaN(numericRoomId)) {
            return {
                success: false,
                error: {
                    code: "INVALID_ROOM_ID",
                    message: "Room ID must be a valid number",
                },
            };
        }

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

        const roomKey = RoomStateService.getRoomKey(numericRoomId);

        const isInRoom = socket.rooms.has(roomKey) || (session && Number(session.roomId) === numericRoomId);
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
            return { success: true, userId, roomKey, roomId: numericRoomId };
        }

        const participant = await RoomStateService.getParticipant(numericRoomId, userId);
        if (participant?.role === "host") {
            return { success: true, userId, roomKey, roomId: numericRoomId };
        }

        const room = await RoomModel.selectRoom(numericRoomId);
        if (room && room.hostId === userId) {
            return { success: true, userId, roomKey, roomId: numericRoomId };
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
