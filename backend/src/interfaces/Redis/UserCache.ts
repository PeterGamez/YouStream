import type { UserInterface, UserSafeDTO } from "../Database/UserInterface";

/**
 * User profile cached in Redis String `user:{userId}`
 * Value: JSON serialized string of UserSafeDTO or UserInterface
 */
export interface RedisUserCache {
    userId: number;
    data: UserSafeDTO | UserInterface;
    ttlSeconds: number;
}
