export type RedisParticipantRole = "host" | "viewer";

/**
 * Active participant stored in Redis Hash `room:{roomId}:participants`
 * Hash Field: `user:{userId}`
 * Hash Value: JSON serialized string of RedisParticipant
 */
export interface RedisParticipant {
    userId: number;
    displayName: string;
    avatarUrl: string;
    role: RedisParticipantRole;
    socketId: string;
    joinedAt: string;
}
