/**
 * Chat rate limit entry stored in Redis String `ratelimit:chat:{userId}`
 * Command: SET ratelimit:chat:{userId} "1" EX 1 NX
 */
export interface RedisChatRateLimit {
    userId: number | string;
    ttlSeconds: number;
}
