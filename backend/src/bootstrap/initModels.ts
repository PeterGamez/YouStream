import type Server from "../Server";
import UserModel from "../models/UserModel";

export function initModels(server: Server) {
    UserModel.init(server.config.mysql.table.user, server.DB);
}
