import type { ServerType } from "@hono/node-server";
import type { Socket } from "socket.io";
import { Server as IOServer } from "socket.io";

import type Server from "../Server";
import type { SocketErrorPayload } from "../interfaces/Socket";
import RoomModel from "../models/RoomModel";
import ChatSocket from "../sockets/ChatSocket";
import RoomSocket from "../sockets/RoomSocket";
import VideoSocket from "../sockets/VideoSocket";
import RoomStateService from "./RoomStateService";
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

    public static async revokeUserSockets(userId: number, reason = "Authentication revoked"): Promise<void> {
        if (!this.io) {
            return;
        }

        try {
            const errorPayload: SocketErrorPayload = {
                code: "AUTH_REVOKED",
                message: reason,
            };

            const sockets = await this.io.fetchSockets();
            for (const socket of sockets) {
                const socketUserId = socket.data?.userId ?? socket.data?.user?.id;
                if (socketUserId === userId) {
                    const localSocket = this.io.sockets?.sockets?.get(socket.id);
                    if (localSocket) {
                        if (localSocket.data?.user) {
                            localSocket.data.user.role = "user";
                        }
                        delete localSocket.data.user;
                        delete localSocket.data.userId;
                        localSocket.emit("error", errorPayload);
                        localSocket.disconnect(true);
                    } else {
                        delete socket.data.user;
                        delete socket.data.userId;
                        socket.emit("error", errorPayload);
                        socket.disconnect(true);
                    }
                }
            }
        } catch (error) {
            this.server?.error("SocketService", `Failed to revoke sockets for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public static async refreshUserSockets(userId: number): Promise<void> {
        if (!this.io) {
            return;
        }

        try {
            const freshUser = await UserService.getUser(userId);
            if (!freshUser) {
                await this.revokeUserSockets(userId, "User account no longer exists");
                return;
            }

            const sockets = await this.io.fetchSockets();
            for (const socket of sockets) {
                const socketUserId = socket.data?.userId ?? socket.data?.user?.id;
                if (socketUserId === userId) {
                    socket.data.user = freshUser;
                    socket.data.userId = freshUser.id;

                    const localSocket = this.io.sockets?.sockets?.get(socket.id);
                    if (localSocket) {
                        localSocket.data.user = freshUser;
                        localSocket.data.userId = freshUser.id;
                    }

                    const session = await RoomStateService.getSocketSession(socket.id);
                    if (session) {
                        const participant = await RoomStateService.getParticipant(session.roomId, session.userId);
                        if (participant) {
                            const room = await RoomModel.selectRoom(Number(session.roomId));
                            const isHost = (room && room.hostId === session.userId) || freshUser.role === "admin";
                            const expectedRole = isHost ? "host" : "viewer";
                            if (participant.role !== expectedRole) {
                                participant.role = expectedRole;
                                await RoomStateService.addParticipant(session.roomId, participant);
                                const roomKey = RoomStateService.getRoomKey(session.roomId);
                                this.io.to(roomKey).emit("room:participant-updated", {
                                    userId: session.userId,
                                    role: expectedRole,
                                });
                            }
                        }
                    }

                    socket.emit("auth:refresh", {
                        user: freshUser,
                    });
                }
            }
        } catch (error) {
            this.server?.error("SocketService", `Failed to refresh sockets for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public static close(): void {
        this.io?.close();
    }
}
