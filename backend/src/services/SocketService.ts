import type { ServerType } from "@hono/node-server";
import type { Socket } from "socket.io";
import { Server as IOServer } from "socket.io";

import type Server from "../Server";

export default class SocketService {
    public static io: IOServer;
    private static server: Server;

    public static init(server: Server, httpServer: ServerType) {
        this.server = server;

        this.io = new IOServer(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
            },
        });

        this.registerEvents();

        server.log("Socket.IO", `Socket server running at ws://localhost:${server.config.port}`);
    }

    private static registerEvents(): void {
        this.io.on("connection", (socket: Socket) => {
            this.server.log("Socket.IO", `Client connected: ${socket.id}`);
        });
    }

    public static emit(event: string, ...args: unknown[]): void {
        this.io.emit(event, ...args);
    }

    public static close(): void {
        this.io?.close();
    }
}
