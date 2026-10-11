/**
 * Set of active room IDs stored in Redis Set `active_rooms`
 * SADD active_rooms {roomId}
 * SREM active_rooms {roomId}
 * SMEMBERS active_rooms
 */
export type RedisActiveRoomsSet = Set<string>;

export type RedisActiveRoomId = string;
