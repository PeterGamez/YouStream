import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";

export interface ChatSendPayload {
    roomId: number | string;
    message: string;
}

export interface ChatMessagePayload {
    id: string;
    senderId: number | null;
    senderName: string;
    avatarUrl?: string;
    message: string;
    messageType: "chat" | "system";
    createdAt: string;
}

export interface SocketErrorPayload {
    code: string;
    message: string;
}

export default class ChatSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        this.registerChatEvents(socket);
    }

    private static registerChatEvents(socket: Socket): void {
        socket.on("chat:send", (data: ChatSendPayload) => {
            const roomKey = `room:${data.roomId}`;

            if (!data.message || data.message.trim() === "") {
                const errorPayload: SocketErrorPayload = {
                    code: "CHAT_EMPTY",
                    message: "Message cannot be empty",
                };
                socket.emit("error", errorPayload);
                return;
            }

            this.server.log("Socket:Chat", `Chat message in ${roomKey}: ${data.message}`);

            const messagePayload: ChatMessagePayload = {
                id: `msg_${Date.now()}`,
                senderId: 1,
                senderName: "User",
                avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                message: data.message,
                messageType: "chat",
                createdAt: new Date().toISOString(),
            };

            this.io.to(roomKey).emit("chat:new-message", messagePayload);
        });
    }
}
