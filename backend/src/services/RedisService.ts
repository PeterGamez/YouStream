import type Redis from "ioredis";

export default class RedisService {
    public static Redis: Redis;

    public static init(Redis: Redis) {
        this.Redis = Redis;
    }

    public static async get<T extends string>(key: string): Promise<T> {
        const data = await this.Redis.get(key);
        if (!data) return null;
        return data as T;
    }

    public static async set<T extends string>(key: string, value: T) {
        return await this.Redis.set(key, value);
    }

    public static async del(key: string) {
        return await this.Redis.del(key);
    }

    public static async expire(key: string, seconds: number) {
        return await this.Redis.expire(key, seconds);
    }
}
