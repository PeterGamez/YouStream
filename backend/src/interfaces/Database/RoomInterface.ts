import type { InterfaceBase, InterfaceBaseRaw } from "./InterfaceBase";

export type RoomStatus = "active" | "ended";
export type RoomMediaType = "none" | "youtube" | "local_file";

export interface RoomInterface extends InterfaceBase {
    roomCode: string;
    title: string;
    description: string;
    hostId: number;
    status: RoomStatus;
    mediaType: RoomMediaType;
    currentMediaId: number;
    isPrivate: boolean;
    passcode: string;
    maxParticipants: number;
    endedAt: Date;
}

export type RoomSafeDTO = Omit<RoomInterface, "passcode">;

export interface RoomHostDTO {
    id: number;
    displayName: string;
    avatarUrl: string;
}

export interface RoomListDTO extends RoomSafeDTO {
    host: RoomHostDTO;
    participantCount: number;
}

export interface RoomDetailDTO extends RoomSafeDTO {
    host?: RoomHostDTO;
    participantCount?: number;
}

export interface RoomRawInterface extends InterfaceBaseRaw {
    room_code: string;
    title: string;
    description: string;
    host_id: number;
    status: RoomStatus;
    media_type: RoomMediaType;
    current_media_id: number;
    is_private: boolean | number;
    passcode: string;
    passcode_hash?: string;
    max_participants: number;
    ended_at: Date;
}
