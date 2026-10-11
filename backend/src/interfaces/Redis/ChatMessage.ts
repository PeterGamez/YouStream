export type RedisMessageType = "chat" | "system";

/**
 * Chat message stored in Redis Capped List (max 100) `room:{roomId}:messages`
 * List Value: JSON serialized string of RedisChatMessage
 */
export interface RedisChatMessage {
    id: string;
    senderId: number;
    senderName: string;
    avatarUrl: string;
    message: string;
    messageType: RedisMessageType;
    createdAt: string;
}
