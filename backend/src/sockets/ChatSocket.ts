import type { Server as IOServer, Socket } from "socket.io";

import type Server from "../Server";
import type { RedisChatMessage } from "../interfaces/Redis";
import type { ChatMessagePayload, ChatSendPayload, SocketErrorPayload } from "../interfaces/Socket";
import RoomStateService from "../services/RoomStateService";

export default class ChatSocket {
    private static io: IOServer;
    private static server: Server;

    public static init(io: IOServer, server: Server): void {
        this.io = io;
        this.server = server;
    }

    public static register(socket: Socket): void {
        socket.on("chat:send", async (data: ChatSendPayload) => {
            // 1. Authenticate socket & derive user and room from session
            const session = await RoomStateService.getSocketSession(socket.id);
            const userId: number = socket.data?.userId || socket.data?.user?.id || session?.userId;

            if (!userId) {
                const errorPayload: SocketErrorPayload = {
                    code: "UNAUTHORIZED",
                    message: "Authentication required to send chat messages",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // Derive room ID from session
            const roomId = session?.roomId || (data?.roomId ? Number(data.roomId) : null);
            if (!roomId) {
                const errorPayload: SocketErrorPayload = {
                    code: "NOT_IN_ROOM",
                    message: "You must join a room before sending messages",
                };
                socket.emit("error", errorPayload);
                return;
            }

            if (data?.roomId && session?.roomId && Number(data.roomId) !== Number(session.roomId)) {
                const errorPayload: SocketErrorPayload = {
                    code: "ROOM_MISMATCH",
                    message: "Cannot send messages to a room you are not in",
                };
                socket.emit("error", errorPayload);
                return;
            }

            const roomKey = `room:${roomId}`;

            // 2. Enforce room membership context
            if (!socket.rooms.has(roomKey)) {
                const errorPayload: SocketErrorPayload = {
                    code: "NOT_IN_ROOM",
                    message: "You must be a member of this room to send messages",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 3. Resolve sender from active participant session in Redis
            const participant = await RoomStateService.getParticipant(roomId, userId);
            if (!participant) {
                const errorPayload: SocketErrorPayload = {
                    code: "NOT_IN_ROOM",
                    message: "Active participant session not found for this room",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 4. Validate message
            if (!data?.message || data.message.trim() === "") {
                const errorPayload: SocketErrorPayload = {
                    code: "CHAT_EMPTY",
                    message: "Message cannot be empty",
                };
                socket.emit("error", errorPayload);
                return;
            }

            // 5. Enforce Chat Rate Limit (1 message per second per user)
            const isAllowed = await RoomStateService.checkChatRateLimit(userId, 1);
            if (!isAllowed) {
                const errorPayload: SocketErrorPayload = {
                    code: "CHAT_RATE_LIMIT",
                    message: "Rate limit exceeded. You can only send 1 message per second.",
                };
                socket.emit("error", errorPayload);
                socket.emit("chat:error", { message: "ส่งข้อความเร็วเกินไป กรุณารอสักครู่" });
                return;
            }

            const senderId = userId;
            const senderName = participant.displayName || socket.data?.user?.displayName || "";
            const avatarUrl = participant.avatarUrl || socket.data?.user?.avatarUrl;

            this.server.log("Socket:Chat", `Chat message in ${roomKey} from ${senderName} (${senderId}): ${data.message}`);

            const messagePayload: ChatMessagePayload = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                senderId,
                senderName,
                avatarUrl,
                message: data.message.trim(),
                messageType: "chat",
                createdAt: new Date().toISOString(),
            };

            // 6. Persist message in Redis capped list (max 100)
            await RoomStateService.addMessage(roomId, messagePayload as RedisChatMessage, 100);

            // 7. Broadcast to all clients in the room
            this.io.to(roomKey).emit("chat:new-message", messagePayload);
        });
    }
}
