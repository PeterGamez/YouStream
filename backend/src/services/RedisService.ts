import type Redis from "ioredis";

import RoomReconciliationService from "./RoomReconciliationService";
import RoomStateService from "./RoomStateService";

export default class RedisService {
    public static Redis: Redis;

    public static init(Redis: Redis) {
        this.Redis = Redis;

        RoomStateService.init(Redis);
        RoomReconciliationService.setRedis(Redis);
    }

    public static async get(key: string): Promise<string> {
        const data = await this.Redis.get(key);
        if (!data) return null;
        return data;
    }

    public static async set(key: string, value: string) {
        return await this.Redis.set(key, value);
    }

    public static async del(key: string) {
        return await this.Redis.del(key);
    }

    public static async expire(key: string, seconds: number) {
        return await this.Redis.expire(key, seconds);
    }
}
