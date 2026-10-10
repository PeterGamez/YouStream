import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";

export interface MediaChangePayload {
    roomId: number | string;
    sourceType: "youtube" | "local_file";
    youtubeId?: string;
    fileUrl?: string;
    title?: string;
}

export interface VideoControlPayload {
    roomId: number | string;
    action: "play" | "pause" | "seek" | "ratechange";
    currentTime: number;
    speed?: number;
    volume?: number;
}

export default class MediaSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        this.registerMediaEvents(socket);
    }

    private static registerMediaEvents(socket: Socket): void {
        socket.on("media:change", (data: MediaChangePayload) => {
            const roomKey = `room:${data.roomId}`;
            this.server.log("Socket:Media", `Media changed in ${roomKey}: ${data.sourceType}`);

            this.io.to(roomKey).emit("media:update", {
                mediaId: 1,
                sourceType: data.sourceType,
                youtubeId: data.youtubeId,
                fileUrl: data.fileUrl,
                title: data.title || "Selected Video",
            });
        });

        socket.on("video:control", (data: VideoControlPayload) => {
            const roomKey = `room:${data.roomId}`;
            this.server.log("Socket:Video", `Video control in ${roomKey}: ${data.action} at ${data.currentTime}s`);

            socket.to(roomKey).emit("video:sync", {
                action: data.action,
                currentTime: data.currentTime,
                speed: data.speed ?? 1.0,
                timestamp: new Date().toISOString(),
            });
        });
    }
}
