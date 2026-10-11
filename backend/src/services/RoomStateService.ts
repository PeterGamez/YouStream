import type Redis from "ioredis";

import type { RedisChatMessage, RedisParticipant, RedisPlaybackMediaType, RedisPlaybackState, RedisSocketSession } from "../interfaces/Redis";

export default class RoomStateService {
    public static Redis: Redis;

    public static init(Redis: Redis) {
        this.Redis = Redis;
    }

    public static readonly KEYS = {
        roomPlayback: (roomId: number | string) => `room:${roomId}:playback`,
        roomParticipants: (roomId: number | string) => `room:${roomId}:participants`,
        roomParticipantField: (userId: number | string) => `user:${userId}`,
        roomMessages: (roomId: number | string) => `room:${roomId}:messages`,
        socketSession: (socketId: string) => `socket:${socketId}:session`,
        activeRooms: () => "active_rooms",
        chatRateLimit: (userId: number | string) => `ratelimit:chat:${userId}`,
        userCache: (userId: number | string) => `user:${userId}`,
    };

    /* -------------------------------------------------------------------------- */
    /*                       1. Video Playback State (Hash)                       */
    /* -------------------------------------------------------------------------- */

    public static async setPlaybackState(roomId: number | string, state: Partial<RedisPlaybackState>): Promise<void> {
        const key = this.KEYS.roomPlayback(roomId);
        const data: Record<string, string> = {};

        if (state.mediaId !== undefined) data.mediaId = state.mediaId !== null ? String(state.mediaId) : "";
        if (state.mediaType !== undefined) data.mediaType = state.mediaType;
        if (state.sourceUrl !== undefined) data.sourceUrl = state.sourceUrl;
        if (state.currentTime !== undefined) data.currentTime = String(state.currentTime);
        if (state.isPlaying !== undefined) data.isPlaying = String(state.isPlaying);
        if (state.playbackSpeed !== undefined) data.playbackSpeed = String(state.playbackSpeed);
        if (state.volume !== undefined) data.volume = String(state.volume);
        if (state.updatedBy !== undefined) data.updatedBy = String(state.updatedBy);
        if (state.updatedAt !== undefined) data.updatedAt = state.updatedAt;

        if (Object.keys(data).length > 0) {
            await this.Redis.hset(key, data);
        }
    }

    public static async getPlaybackState(roomId: number | string): Promise<RedisPlaybackState> {
        const key = this.KEYS.roomPlayback(roomId);
        const data = await this.Redis.hgetall(key);
        if (!data || Object.keys(data).length === 0) return null;

        return {
            mediaId: data.mediaId ? (isNaN(Number(data.mediaId)) ? data.mediaId : Number(data.mediaId)) : null,
            mediaType: (data.mediaType as RedisPlaybackMediaType) || "none",
            sourceUrl: data.sourceUrl || "",
            currentTime: parseFloat(data.currentTime || "0"),
            isPlaying: data.isPlaying === "true",
            playbackSpeed: parseFloat(data.playbackSpeed || "1"),
            volume: parseFloat(data.volume || "1"),
            updatedBy: parseInt(data.updatedBy || "0", 10),
            updatedAt: data.updatedAt || new Date().toISOString(),
        };
    }

    public static async delPlaybackState(roomId: number | string): Promise<number> {
        return await this.Redis.del(this.KEYS.roomPlayback(roomId));
    }

    /* -------------------------------------------------------------------------- */
    /*                     2. Room Active Participants (Hash)                     */
    /* -------------------------------------------------------------------------- */

    public static async addParticipant(roomId: number | string, participant: RedisParticipant): Promise<void> {
        const key = this.KEYS.roomParticipants(roomId);
        const field = this.KEYS.roomParticipantField(participant.userId);
        await this.Redis.hset(key, field, JSON.stringify(participant));
    }

    public static async removeParticipant(roomId: number | string, userId: number | string): Promise<number> {
        const key = this.KEYS.roomParticipants(roomId);
        const field = this.KEYS.roomParticipantField(userId);
        return await this.Redis.hdel(key, field);
    }

    public static async getParticipant(roomId: number | string, userId: number | string): Promise<RedisParticipant> {
        const key = this.KEYS.roomParticipants(roomId);
        const field = this.KEYS.roomParticipantField(userId);
        const data = await this.Redis.hget(key, field);
        if (!data) return null;
        try {
            return JSON.parse(data) as RedisParticipant;
        } catch {
            return null;
        }
    }

    public static async getParticipants(roomId: number | string): Promise<RedisParticipant[]> {
        const key = this.KEYS.roomParticipants(roomId);
        const values = await this.Redis.hvals(key);
        return values
            .map((val) => {
                try {
                    return JSON.parse(val) as RedisParticipant;
                } catch {
                    return null;
                }
            })
            .filter((p): p is RedisParticipant => p !== null);
    }

    public static async getParticipantCount(roomId: number | string): Promise<number> {
        return await this.Redis.hlen(this.KEYS.roomParticipants(roomId));
    }

    /* -------------------------------------------------------------------------- */
    /*                  3. Room Live Chat Messages (Capped List)                  */
    /* -------------------------------------------------------------------------- */

    public static async addMessage(roomId: number | string, message: RedisChatMessage, maxMessages = 100): Promise<void> {
        const key = this.KEYS.roomMessages(roomId);
        await this.Redis.rpush(key, JSON.stringify(message));
        await this.Redis.ltrim(key, -maxMessages, -1);
    }

    public static async getMessages(roomId: number | string, count = 100): Promise<RedisChatMessage[]> {
        const key = this.KEYS.roomMessages(roomId);
        const messages = await this.Redis.lrange(key, -count, -1);
        return messages
            .map((msg) => {
                try {
                    return JSON.parse(msg) as RedisChatMessage;
                } catch {
                    return null;
                }
            })
            .filter((m): m is RedisChatMessage => m !== null);
    }

    public static async clearMessages(roomId: number | string): Promise<number> {
        return await this.Redis.del(this.KEYS.roomMessages(roomId));
    }

    /* -------------------------------------------------------------------------- */
    /*                        4. Socket Session Mapping (Hash)                    */
    /* -------------------------------------------------------------------------- */

    public static async setSocketSession(socketId: string, userId: number | string, roomId: number | string): Promise<void> {
        const key = this.KEYS.socketSession(socketId);
        await this.Redis.hset(key, {
            userId: String(userId),
            roomId: String(roomId),
        });
    }

    public static async getSocketSession(socketId: string): Promise<RedisSocketSession> {
        const key = this.KEYS.socketSession(socketId);
        const session = await this.Redis.hgetall(key);
        if (!session || !session.userId || !session.roomId) return null;
        return {
            userId: Number(session.userId),
            roomId: Number(session.roomId),
        };
    }

    public static async delSocketSession(socketId: string): Promise<number> {
        return await this.Redis.del(this.KEYS.socketSession(socketId));
    }

    /* -------------------------------------------------------------------------- */
    /*                            5. Active Rooms (Set)                           */
    /* -------------------------------------------------------------------------- */

    public static async addActiveRoom(roomId: number | string): Promise<number> {
        return await this.Redis.sadd(this.KEYS.activeRooms(), String(roomId));
    }

    public static async removeActiveRoom(roomId: number | string): Promise<number> {
        return await this.Redis.srem(this.KEYS.activeRooms(), String(roomId));
    }

    public static async getActiveRooms(): Promise<string[]> {
        return await this.Redis.smembers(this.KEYS.activeRooms());
    }

    public static async isActiveRoom(roomId: number | string): Promise<boolean> {
        const result = await this.Redis.sismember(this.KEYS.activeRooms(), String(roomId));
        return result === 1;
    }

    public static async getActiveRoomCount(): Promise<number> {
        return await this.Redis.scard(this.KEYS.activeRooms());
    }

    /* -------------------------------------------------------------------------- */
    /*                         6. Chat Rate Limit (String)                        */
    /* -------------------------------------------------------------------------- */

    public static async checkChatRateLimit(userId: number | string, ttlSeconds = 1): Promise<boolean> {
        const key = this.KEYS.chatRateLimit(userId);
        const result = await this.Redis.set(key, "1", "EX", ttlSeconds, "NX");
        return result === "OK";
    }

    /* -------------------------------------------------------------------------- */
    /*                       7. Full Room Lifecycle Cleanup                       */
    /* -------------------------------------------------------------------------- */

    public static async cleanupRoom(roomId: number | string): Promise<void> {
        await Promise.all([
            this.Redis.del(this.KEYS.roomPlayback(roomId)),
            this.Redis.del(this.KEYS.roomParticipants(roomId)),
            this.Redis.del(this.KEYS.roomMessages(roomId)),
            this.removeActiveRoom(roomId),
        ]);
    }
}
