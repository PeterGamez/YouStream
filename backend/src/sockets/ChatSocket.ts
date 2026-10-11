import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { ChatMessagePayload, ChatSendPayload, SocketErrorPayload } from "../interfaces/Socket";

export default class ChatSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
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
