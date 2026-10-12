import type { UserInterface, UserSafeDTO } from "../interfaces/Database";
import UserModel from "../models/UserModel";
import RedisService from "./RedisService";

export default class UserService {
    private static readonly USER_CACHE_PREFIX = "user:";
    private static readonly USER_CACHE_TTL = 60;

    public static async getUser(userId: number): Promise<UserSafeDTO> {
        const cached = await RedisService.get<string>(`${this.USER_CACHE_PREFIX}${userId}`);
        if (cached) {
            try {
                const userSafe = JSON.parse(cached);
                return userSafe;
            } catch {
                // ignore parse failure and query db
            }
        }

        const user = await UserModel.selectUser(userId);
        if (!user) {
            return null;
        }

        await this.setUser(userId, user);
        return user;
    }

    public static async setUser(userId: number, user: UserInterface): Promise<void> {
        const userSafe: UserSafeDTO = {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            role: user.role,
        };
        await RedisService.set(`${this.USER_CACHE_PREFIX}${userId}`, JSON.stringify(userSafe));
        await RedisService.expire(`${this.USER_CACHE_PREFIX}${userId}`, this.USER_CACHE_TTL);
    }

    public static async delUser(userId: number): Promise<void> {
        await RedisService.del(`${this.USER_CACHE_PREFIX}${userId}`);
    }
}
