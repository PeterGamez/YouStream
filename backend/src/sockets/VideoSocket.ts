import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { VideoChangePayload, VideoControlPayload } from "../interfaces/Socket";

export default class VideoSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        socket.on("video:change", (data: VideoChangePayload) => {
            const roomKey = `room:${data.roomId}`;
            this.server.log("Socket:Video", `Video changed in ${roomKey}: ${data.sourceType}`);

            this.io.to(roomKey).emit("video:update", {
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
