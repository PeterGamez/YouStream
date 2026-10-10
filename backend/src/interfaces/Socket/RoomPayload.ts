export interface RoomJoinPayload {
    roomId: number | string;
    passcode?: string;
}

export interface RoomLeavePayload {
    roomId: number | string;
}

export interface RoomEndPayload {
    roomId: number | string;
    reason?: string;
}
