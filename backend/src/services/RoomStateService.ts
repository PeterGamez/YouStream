import type Redis from "ioredis";

import type {
    RedisChatMessage,
    RedisChatMessageRaw,
    RedisParticipant,
    RedisParticipantRaw,
    RedisPlaybackMediaType,
    RedisPlaybackState,
    RedisPlaybackStateHash,
    RedisSocketSession,
    RedisSocketSessionHash,
} from "../interfaces/Redis";

export default class RoomStateService {
    public static Redis: Redis;

    public static init(Redis: Redis) {
        this.Redis = Redis;
    }

    public static readonly KEYS = {
        roomChannel: (roomId: number | string) => `room:${roomId}`,
        roomPlayback: (roomId: number | string) => `room:${roomId}:playback`,
        roomParticipants: (roomId: number | string) => `room:${roomId}:participants`,
        roomParticipantField: (userId: number | string) => `user:${userId}`,
        roomMessages: (roomId: number | string) => `room:${roomId}:messages`,
        socketSession: (socketId: string) => `socket:${socketId}:session`,
        activeRooms: () => "active_rooms",
        chatRateLimit: (userId: number | string) => `rate_limit:chat:${userId}`,
        userCache: (userId: number | string) => `user:${userId}`,
    };

    public static getRoomKey(roomId: number | string): string {
        return this.KEYS.roomChannel(roomId);
    }

    /* -------------------------------------------------------------------------- */
    /*                       1. Video Playback State (Hash)                       */
    /* -------------------------------------------------------------------------- */

    public static async setPlaybackState(roomId: number | string, state: Partial<RedisPlaybackState>): Promise<void> {
        const key = this.KEYS.roomPlayback(roomId);
        const data: Partial<RedisPlaybackStateHash> = {};

        if (state.mediaId !== undefined) data.media_id = state.mediaId !== null ? String(state.mediaId) : "";
        if (state.mediaType !== undefined) data.media_type = state.mediaType;
        if (state.sourceUrl !== undefined) data.source_url = state.sourceUrl;
        if (state.currentTime !== undefined) data.current_time = String(state.currentTime);
        if (state.isPlaying !== undefined) data.is_playing = String(state.isPlaying);
        if (state.playbackSpeed !== undefined) data.playback_speed = String(state.playbackSpeed);
        if (state.volume !== undefined) data.volume = String(state.volume);
        if (state.updatedBy !== undefined) data.updated_by = String(state.updatedBy);
        if (state.updatedAt !== undefined) data.updated_at = state.updatedAt;

        if (Object.keys(data).length > 0) {
            await this.Redis.hset(key, data);
        }
    }

    public static async getPlaybackState(roomId: number | string): Promise<RedisPlaybackState> {
        const key = this.KEYS.roomPlayback(roomId);
        const data = (await this.Redis.hgetall(key)) as unknown as Partial<RedisPlaybackStateHash> & Record<string, string>;
        if (!data || Object.keys(data).length === 0) return null;

        const mediaIdVal = data.media_id ?? data.mediaId;
        return {
            mediaId: mediaIdVal ? (isNaN(Number(mediaIdVal)) ? mediaIdVal : Number(mediaIdVal)) : null,
            mediaType: ((data.media_type ?? data.mediaType) as RedisPlaybackMediaType) || "none",
            sourceUrl: data.source_url ?? data.sourceUrl ?? "",
            currentTime: parseFloat(data.current_time ?? data.currentTime ?? "0"),
            isPlaying: (data.is_playing ?? data.isPlaying) === "true",
            playbackSpeed: parseFloat(data.playback_speed ?? data.playbackSpeed ?? "1"),
            volume: parseFloat(data.volume ?? "1"),
            updatedBy: parseInt(data.updated_by ?? data.updatedBy ?? "0", 10),
            updatedAt: data.updated_at ?? data.updatedAt ?? new Date().toISOString(),
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
        const rawParticipant: RedisParticipantRaw = {
            user_id: participant.userId,
            display_name: participant.displayName,
            avatar_url: participant.avatarUrl,
            role: participant.role,
            socket_id: participant.socketId,
            joined_at: participant.joinedAt,
        };
        await this.Redis.hset(key, field, JSON.stringify(rawParticipant));
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
            const raw = JSON.parse(data);
            return {
                userId: raw.user_id ?? raw.userId,
                displayName: raw.display_name ?? raw.displayName ?? "",
                avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? "",
                role: raw.role,
                socketId: raw.socket_id ?? raw.socketId,
                joinedAt: raw.joined_at ?? raw.joinedAt,
            };
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
                    const raw = JSON.parse(val);
                    return {
                        userId: raw.user_id ?? raw.userId,
                        displayName: raw.display_name ?? raw.displayName ?? "",
                        avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? "",
                        role: raw.role,
                        socketId: raw.socket_id ?? raw.socketId,
                        joinedAt: raw.joined_at ?? raw.joinedAt,
                    };
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
        const rawMessage: RedisChatMessageRaw = {
            id: message.id,
            sender_id: message.senderId,
            sender_name: message.senderName,
            avatar_url: message.avatarUrl,
            message: message.message,
            message_type: message.messageType,
            created_at: message.createdAt,
        };
        await this.Redis.rpush(key, JSON.stringify(rawMessage));
        await this.Redis.ltrim(key, -maxMessages, -1);
    }

    public static async getMessages(roomId: number | string, count = 100): Promise<RedisChatMessage[]> {
        const key = this.KEYS.roomMessages(roomId);
        const messages = await this.Redis.lrange(key, -count, -1);
        return messages
            .map((msg) => {
                try {
                    const raw = JSON.parse(msg);
                    return {
                        id: raw.id,
                        senderId: raw.sender_id ?? raw.senderId,
                        senderName: raw.sender_name ?? raw.senderName ?? "",
                        avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? "",
                        message: raw.message,
                        messageType: raw.message_type ?? raw.messageType,
                        createdAt: raw.created_at ?? raw.createdAt,
                    };
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
        const sessionData: RedisSocketSessionHash = {
            user_id: String(userId),
            room_id: String(roomId),
        };
        await this.Redis.hset(key, sessionData);
    }

    public static async getSocketSession(socketId: string): Promise<RedisSocketSession> {
        const key = this.KEYS.socketSession(socketId);
        const session = (await this.Redis.hgetall(key)) as unknown as Partial<RedisSocketSessionHash>;
        const userId = session?.user_id;
        const roomId = session?.room_id;
        if (!session || !userId || !roomId) return null;
        return {
            userId: Number(userId),
            roomId: Number(roomId),
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
