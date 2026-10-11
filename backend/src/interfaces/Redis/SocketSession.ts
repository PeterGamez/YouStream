/**
 * Socket session mapping stored in Redis Hash `socket:{socketId}:session`
 * Hash fields are stored as snake_case strings in Redis.
 * Used for O(1) room and user lookup on socket disconnect.
 */
export interface RedisSocketSessionHash {
    user_id: string;
    room_id: string;
}

/**
 * Parsed numeric session data for application logic (camelCase)
 */
export interface RedisSocketSession {
    userId: number;
    roomId: number;
}
