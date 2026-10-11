export type RedisPlaybackMediaType = "none" | "youtube" | "local_file";

/**
 * Raw Redis Hash representation where all keys stored in Redis are snake_case strings
 * Key pattern: `room:{roomId}:playback`
 */
export interface RedisPlaybackStateHash {
    media_id: string;
    media_type: RedisPlaybackMediaType | string;
    source_url: string;
    current_time: string;
    is_playing: "true" | "false" | string;
    playback_speed: string;
    volume: string;
    updated_by: string;
    updated_at: string;
}

/**
 * Deserialized / typed playback state representation for application logic and Socket.io broadcasts (camelCase)
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
