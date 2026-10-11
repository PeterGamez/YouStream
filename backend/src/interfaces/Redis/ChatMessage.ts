export type RedisMessageType = "chat" | "system";

/**
 * Raw chat message stored in Redis Capped List (max 100) `room:{roomId}:messages`
 * List Value: JSON serialized string of RedisChatMessageRaw (snake_case)
 */
export interface RedisChatMessageRaw {
    id: string;
    sender_id: number;
    sender_name: string;
    avatar_url: string;
    message: string;
    message_type: RedisMessageType;
    created_at: string;
}

/**
 * Deserialized chat message for application logic and Socket.io broadcasts (camelCase)
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
