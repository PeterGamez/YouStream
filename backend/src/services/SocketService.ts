import type { ServerType } from "@hono/node-server";
import type { Socket } from "socket.io";
import { Server as IOServer } from "socket.io";

import type Server from "../Server";
import ChatSocket from "../sockets/ChatSocket";
import RoomSocket from "../sockets/RoomSocket";
import VideoSocket from "../sockets/VideoSocket";
import UserService from "./UserService";

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

        this.io.use(async (socket, next) => {
            try {
                let token: string;
                const authorization = socket.handshake.headers?.authorization;
                if (authorization && authorization.includes("Bearer ")) {
                    token = authorization.split("Bearer ")[1];
                } else if (socket.handshake.auth?.token) {
                    const authToken = socket.handshake.auth.token;
                    token = typeof authToken === "string" && authToken.includes("Bearer ") ? authToken.split("Bearer ")[1] : authToken;
                }

                if (token) {
                    const payload = await server.JWT.verifyAccessToken(token);
                    if (payload?.userId) {
                        const user = await UserService.getUser(payload.userId);
                        if (user) {
                            socket.data.user = user;
                            socket.data.userId = user.id;
                        }
                    }
                }
            } catch {
                // allow guest / unauthenticated
            }
            next();
        });

        RoomSocket.init(this.io, server);
        VideoSocket.init(this.io, server);
        ChatSocket.init(this.io, server);

        this.registerEvents();

        server.log("Socket.IO", `Socket server running at ws://localhost:${server.config.port}`);
    }

    private static registerEvents(): void {
        this.io.on("connection", (socket: Socket) => {
            this.server.log("Socket.IO", `Client connected: ${socket.id}`);
            RoomSocket.register(socket);
            VideoSocket.register(socket);
            ChatSocket.register(socket);
        });
    }

    public static emit(event: string, ...args: unknown[]): void {
        this.io.emit(event, ...args);
    }

    public static close(): void {
        this.io?.close();
    }
}
