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
