import { apiRequest } from "../../lib/api";

export type RoomMediaType = "none" | "youtube" | "local_file";

export type Room = {
  id: number;
  roomCode: string;
  title: string;
  description: string;
  host?: { displayName: string };
  mediaType: RoomMediaType;
  participantCount?: number;
  isPrivate: boolean;
  maxParticipants?: number;
};

type RoomListResponse = { rooms: Room[] };
type RoomCreateResponse = { room: Room };

export async function listActiveRooms() {
  const response = await apiRequest<RoomListResponse>("/rooms");
  return response.rooms;
}

export async function createRoom(title: string) {
  const response = await apiRequest<RoomCreateResponse>("/rooms", {
    method: "POST",
    body: JSON.stringify({ title, mediaType: "none" }),
  });
  return response.room;
}
