import type Server from "../Server";
import MediaModel from "../models/MediaModel";
import RoomModel from "../models/RoomModel";
import UserModel from "../models/UserModel";

export function initModels(server: Server) {
    UserModel.init(server.config.mysql.table.user, server.DB);
    RoomModel.init(server.config.mysql.table.room, server.DB);
    MediaModel.init(server.config.mysql.table.media, server.DB);
}
