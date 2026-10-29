import type { InterfaceBase, InterfaceBaseRaw } from "./InterfaceBase";

export type RoomMediaType = "none" | "youtube" | "local_file";

export interface RoomInterface extends InterfaceBase {
    roomCode: string;
    title: string;
    description: string;
    hostId: number;
    mediaType: RoomMediaType;
    currentMediaId: number;
    isPrivate: boolean;
    passcode: string;
    maxParticipants: number;
}

export type RoomSafeDTO = Omit<RoomInterface, "passcode">;

export interface RoomHostDTO {
    id: number;
    displayName: string;
    avatarUrl: string;
}

export interface RoomRawInterface extends InterfaceBaseRaw {
    room_code: string;
    title: string;
    description: string;
    host_id: number;
    media_type: RoomMediaType;
    current_media_id: number;
    is_private: boolean;
    passcode: string;
    max_participants: number;
}

export interface RoomWithHostRow extends RoomRawInterface {
    host_display_name: string;
    host_avatar_url: string;
}
