import type { Hono } from "hono";

import type Server from "../Server";
import AdminRoute from "../routes/AdminRoute";
import AuthRoute from "../routes/AuthRoute";
import IndexRoute from "../routes/IndexRoute";
import MediaRoute from "../routes/MediaRoute";
import RoomRoute from "../routes/RoomRoute";
import UserRoute from "../routes/UserRoute";

export function initRoutes(server: Server, app: Hono) {
    new IndexRoute(server).getApp(app);

    new AuthRoute(server).getApp(app);
    new UserRoute(server).getApp(app);
    new RoomRoute(server).getApp(app);
    new MediaRoute(server).getApp(app);
    new AdminRoute(server).getApp(app);
}
