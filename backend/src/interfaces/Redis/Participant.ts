export type RedisParticipantRole = "host" | "viewer";

/**
 * Raw representation stored in Redis Hash `room:{roomId}:participants`
 * Hash Field: `user:{userId}`
 * Hash Value: JSON serialized string of RedisParticipantRaw (snake_case)
 */
export interface RedisParticipantRaw {
    user_id: number;
    display_name: string;
    avatar_url: string;
    role: RedisParticipantRole;
    socket_id: string;
    joined_at: string;
}

/**
 * Active participant representation for application logic and Socket.io broadcasts (camelCase)
 */
export interface RedisParticipant {
    userId: number;
    displayName: string;
    avatarUrl: string;
    role: RedisParticipantRole;
    socketId: string;
    joinedAt: string;
}
