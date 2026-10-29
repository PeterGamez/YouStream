import { existsSync } from "node:fs";

import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { MediaInterface } from "../interfaces/Database";
import type { SocketErrorPayload, VideoChangePayload, VideoControlPayload } from "../interfaces/Socket";
import MediaModel from "../models/MediaModel";
import RoomModel from "../models/RoomModel";
import RoomReconciliationService from "../services/RoomReconciliationService";
import RoomStateService from "../services/RoomStateService";
import UserService from "../services/UserService";

export default class VideoSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
        RoomReconciliationService.init(server, server.Redis);
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

            const reconciled = await RoomReconciliationService.reconcileRoom(roomId);
            if (!reconciled) {
                const errorPayload: SocketErrorPayload = {
                    code: "RECONCILIATION_PENDING",
                    message: "Room media reconciliation is pending. Please retry shortly.",
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
            } else if (data.sourceType === "youtube") {
                let cleanYoutubeId = data.youtubeId?.trim();
                if (cleanYoutubeId) {
                    const match = cleanYoutubeId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
                    if (match && match[1]) {
                        cleanYoutubeId = match[1];
                    }
                }

                if (!cleanYoutubeId) {
                    socket.emit("error", {
                        code: "INVALID_YOUTUBE_ID",
                        message: "A valid YouTube video ID is required",
                    });
                    return;
                }

                media = await MediaModel.selectMediaByYoutubeVideoId(cleanYoutubeId);
                if (!media) {
                    try {
                        const sourceUrl = `https://www.youtube.com/watch?v=${cleanYoutubeId}`;
                        const title = data.title?.trim() || "YouTube Video";
                        const mediaId = await MediaModel.createMedia(authCheck.userId, "youtube", title, sourceUrl, cleanYoutubeId, null, null, null, null);
                        media = await MediaModel.selectMedia(mediaId);
                    } catch (createErr) {
                        const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
                        this.server.warn("Socket:Video", `Auto-registration of YouTube video ${cleanYoutubeId} failed: ${createMsg}. Retrying lookup.`);
                        media = await MediaModel.selectMediaByYoutubeVideoId(cleanYoutubeId);
                    }
                }
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

                let rollbackSuccess = false;
                const maxRollbackAttempts = 3;
                let lastRollbackError: Error | null = null;

                for (let attempt = 1; attempt <= maxRollbackAttempts; attempt++) {
                    try {
                        await RoomModel.updateRoomFields(roomId, {
                            mediaType: previousMediaType,
                            currentMediaId: previousMediaId,
                        });
                        rollbackSuccess = true;
                        break;
                    } catch (err) {
                        lastRollbackError = err instanceof Error ? err : new Error(String(err));
                        this.server.warn("Socket:Video", `Rollback attempt ${attempt}/${maxRollbackAttempts} failed for room ${roomId}: ${lastRollbackError.message}`);
                        if (attempt < maxRollbackAttempts) {
                            await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
                        }
                    }
                }

                if (!rollbackSuccess) {
                    this.server.error("Socket:Video", `Immediate rollback failed for room ${roomId}. Enqueuing durable reconciliation job.`);
                    await RoomReconciliationService.queueRollback({
                        roomId,
                        targetMediaType: previousMediaType,
                        targetMediaId: previousMediaId,
                        failedAt: new Date().toISOString(),
                        attempts: maxRollbackAttempts,
                        lastError: lastRollbackError?.message || "Immediate rollback failed",
                    });
                } else {
                    await RoomReconciliationService.cancelRollback(roomId);
                }

                socket.emit("error", {
                    code: "INTERNAL_ERROR",
                    message: "Failed to update playback state in cache",
                });
                return;
            }

            await RoomReconciliationService.cancelRollback(roomId);

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
            const reconciled = await RoomReconciliationService.reconcileRoom(roomId);
            if (!reconciled) {
                const errorPayload: SocketErrorPayload = {
                    code: "RECONCILIATION_PENDING",
                    message: "Room media reconciliation is pending. Please retry shortly.",
                };
                socket.emit("error", errorPayload);
                return;
            }
            const rawCurrentTime = Number(data.currentTime);
            const currentTime = Number.isFinite(rawCurrentTime) ? Math.max(0, rawCurrentTime) : 0;
            const speed = data.speed !== undefined && Number.isFinite(Number(data.speed)) && Number(data.speed) > 0 ? Number(data.speed) : 1.0;

            this.server.log("Socket:Video", `Video control in ${roomKey} by host ${userId}: ${data.action} at ${currentTime}s`);

            const isPlaying = data.action === "play" ? true : data.action === "pause" ? false : undefined;
            await RoomStateService.setPlaybackState(roomId, {
                currentTime,
                ...(isPlaying !== undefined ? { isPlaying } : {}),
                ...(data.speed !== undefined ? { playbackSpeed: speed } : {}),
                ...(data.volume !== undefined ? { volume: data.volume } : {}),
                updatedBy: userId,
                updatedAt: new Date().toISOString(),
            });

            socket.to(roomKey).emit("video:sync", {
                action: data.action,
                currentTime,
                speed,
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
            socket.data.userId = userId;
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

        const freshUser = await UserService.revalidateSocketUser(socket);
        if (!freshUser) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Authentication required or user session has expired",
                },
            };
        }

        userId = freshUser.id;

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

        const room = await RoomModel.selectRoom(numericRoomId);
        const isActualHost = room && room.hostId === userId;
        const isAdmin = freshUser.role === "admin";

        if (isAdmin || isActualHost) {
            return { success: true, userId, roomKey, roomId: numericRoomId };
        }

        const participant = await RoomStateService.getParticipant(numericRoomId, userId);
        if (participant?.role === "host") {
            participant.role = "viewer";
            await RoomStateService.addParticipant(numericRoomId, participant);
            if (this.io) {
                this.io.to(roomKey).emit("room:participant-updated", {
                    userId,
                    role: "viewer",
                });
            }
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
