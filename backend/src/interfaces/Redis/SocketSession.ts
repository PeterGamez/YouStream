/**
 * Socket session mapping stored in Redis Hash `socket:{socketId}:session`
 * Hash fields are stored as strings in Redis.
 * Used for O(1) room and user lookup on socket disconnect.
 */
export interface RedisSocketSessionHash {
    userId: string;
    roomId: string;
}

/**
 * Parsed numeric session data for application logic
 */
export interface RedisSocketSession {
    userId: number;
    roomId: number;
}
