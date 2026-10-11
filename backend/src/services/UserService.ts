import type { UserInterface, UserRawInterface } from "../interfaces/Database";
import UserModel from "../models/UserModel";
import RedisService from "./RedisService";

export default class UserService {
    private static readonly USER_CACHE_PREFIX = "user:";
    private static readonly USER_CACHE_TTL = 60;

    public static async getUser(userId: number): Promise<UserInterface> {
        const cached = await RedisService.get<string>(`${this.USER_CACHE_PREFIX}${userId}`);
        if (cached) {
            try {
                const raw = JSON.parse(cached);
                return {
                    id: raw.id,
                    username: raw.username,
                    email: raw.email,
                    password: raw.password,
                    displayName: raw.display_name ?? raw.displayName ?? "",
                    avatarUrl: raw.avatar_url ?? raw.avatarUrl ?? "",
                    role: raw.role,
                    createdAt: raw.created_at ?? raw.createdAt,
                    updatedAt: raw.updated_at ?? raw.updatedAt,
                };
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
        const rawUser: UserRawInterface = {
            id: user.id,
            username: user.username,
            email: user.email,
            password: user.password,
            display_name: user.displayName,
            avatar_url: user.avatarUrl,
            role: user.role,
            created_at: user.createdAt,
            updated_at: user.updatedAt,
        };
        await RedisService.set(`${this.USER_CACHE_PREFIX}${userId}`, JSON.stringify(rawUser));
        await RedisService.expire(`${this.USER_CACHE_PREFIX}${userId}`, this.USER_CACHE_TTL);
    }

    public static async delUser(userId: number): Promise<void> {
        await RedisService.del(`${this.USER_CACHE_PREFIX}${userId}`);
    }
}
