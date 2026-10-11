import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import Gravatar from "../integrations/Gravatar";
import type { RoomEndPayload, RoomJoinPayload, RoomLeavePayload } from "../interfaces/Socket";

export default class RoomSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        socket.on("room:join", (data: RoomJoinPayload) => {
            const roomKey = `room:${data.roomId}`;
            socket.join(roomKey);

            this.server.log("Socket:Room", `Client ${socket.id} joined ${roomKey}`);

            socket.emit("room:joined", {
                roomInfo: {
                    id: Number(data.roomId),
                    roomCode: "18492043",
                    title: "Watch Party Movie Night",
                    description: "มาดูวิดีโอสนุกๆ ด้วยกันครับ",
                    hostId: 1,
                    status: "active",
                    mediaType: "youtube",
                    currentMediaId: 1,
                    isPrivate: !!data.passcode,
                    maxParticipants: 50,
                },
                playbackState: {
                    mediaId: "1",
                    mediaType: "youtube",
                    sourceUrl: "dQw4w9WgXcQ",
                    currentTime: 0,
                    isPlaying: false,
                    playbackSpeed: 1,
                    volume: 1,
                    updatedBy: 1,
                    updatedAt: new Date().toISOString(),
                },
                participants: [
                    {
                        userId: 1,
                        displayName: "HostName",
                        avatarUrl: Gravatar.getDefaultAvatarURL(),
                        role: "host",
                        socketId: socket.id,
                        joinedAt: new Date().toISOString(),
                    },
                ],
                recentMessages: [],
            });

            socket.to(roomKey).emit("room:user-joined", {
                userId: 2,
                displayName: "ViewerName",
                role: "viewer",
            });
        });

        socket.on("room:leave", (data: RoomLeavePayload) => {
            const roomKey = `room:${data.roomId}`;
            socket.leave(roomKey);

            this.server.log("Socket:Room", `Client ${socket.id} left ${roomKey}`);

            this.io.to(roomKey).emit("room:user-left", {
                userId: 2,
                displayName: "ViewerName",
            });
        });

        socket.on("room:end", (data: RoomEndPayload) => {
            this.endRoom(data.roomId, data.reason);
        });

        socket.on("disconnect", () => {
            this.server.log("Socket:Room", `Client disconnected: ${socket.id}`);
        });
    }

    public static endRoom(roomId: number | string, reason?: string): void {
        const roomKey = `room:${roomId}`;
        this.server.log("Socket:Room", `Room ended: ${roomKey}`);
        this.io.to(roomKey).emit("room:ended", {
            roomId: Number(roomId),
            reason: reason || "Room has been ended by the host",
        });
    }
}
