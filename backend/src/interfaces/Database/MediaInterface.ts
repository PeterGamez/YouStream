import type { InterfaceBase, InterfaceBaseRaw } from "./InterfaceBase";

export type MediaSourceType = "youtube" | "local_file";

export interface MediaInterface extends InterfaceBase {
    uploaderId: number;
    sourceType: MediaSourceType;
    title: string;
    sourceUrl: string;
    youtubeVideoId: string;
    filePath: string;
    fileSizeBytes: number;
    mimeType: string;
    durationSeconds: number;
}

export interface MediaRawInterface extends InterfaceBaseRaw {
    uploader_id: number;
    source_type: MediaSourceType;
    title: string;
    source_url: string;
    youtube_video_id: string;
    file_path: string;
    file_size_bytes: number;
    mime_type: string;
    duration_seconds: number;
}
