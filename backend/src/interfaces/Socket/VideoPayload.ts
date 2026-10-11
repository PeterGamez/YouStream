export interface VideoChangePayload {
    roomId: number | string;
    sourceType: "youtube" | "local_file";
    youtubeId?: string;
    fileUrl?: string;
    title?: string;
    mediaId?: number;
}

export interface VideoUpdatePayload {
    mediaId?: number;
    sourceType: "youtube" | "local_file";
    youtubeId?: string;
    fileUrl?: string;
    title?: string;
}

export interface VideoControlPayload {
    roomId: number | string;
    action: "play" | "pause" | "seek" | "ratechange";
    currentTime: number;
    speed?: number;
    volume?: number;
}
