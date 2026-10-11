export type RedisPlaybackMediaType = "none" | "youtube" | "local_file";

/**
 * Raw Redis Hash representation where all values stored in Redis are strings
 * Key pattern: `room:{roomId}:playback`
 */
export interface RedisPlaybackStateHash {
    mediaId: string;
    mediaType: RedisPlaybackMediaType | string;
    sourceUrl: string;
    currentTime: string;
    isPlaying: "true" | "false" | string;
    playbackSpeed: string;
    volume: string;
    updatedBy: string;
    updatedAt: string;
}

/**
 * Deserialized / typed playback state representation for application logic and Socket.io broadcasts
 */
export interface RedisPlaybackState {
    mediaId: number | string;
    mediaType: RedisPlaybackMediaType;
    sourceUrl: string;
    currentTime: number;
    isPlaying: boolean;
    playbackSpeed: number;
    volume: number;
    updatedBy: number;
    updatedAt: string;
}
