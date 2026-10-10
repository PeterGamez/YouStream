import type { UserInterface } from "../interfaces/Database";
import UserModel from "../models/UserModel";
import RedisService from "./RedisService";

export default class UserService {
    private static readonly USER_CACHE_PREFIX = "user:";
    private static readonly USER_CACHE_TTL = 60;

    public static async getUser(userId: number): Promise<UserInterface> {
        const cached = await RedisService.get<string>(`${this.USER_CACHE_PREFIX}${userId}`);
        if (cached) {
            return JSON.parse(cached) as UserInterface;
        }

        const user = await UserModel.selectUser(userId);
        await this.setUser(userId, user);
        return user;
    }

    public static async setUser(userId: number, user: UserInterface): Promise<void> {
        await RedisService.set(`${this.USER_CACHE_PREFIX}${userId}`, JSON.stringify(user));
        await RedisService.expire(`${this.USER_CACHE_PREFIX}${userId}`, this.USER_CACHE_TTL);
    }

    public static async delUser(userId: number): Promise<void> {
        await RedisService.del(`${this.USER_CACHE_PREFIX}${userId}`);
    }
}
