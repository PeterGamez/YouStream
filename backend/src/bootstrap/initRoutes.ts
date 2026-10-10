import type { Hono } from "hono";

import type Server from "../Server";
import IndexRoute from "../routes/IndexRoute";

export function initRoutes(server: Server, app: Hono) {
    new IndexRoute(server).getApp(app);
}
