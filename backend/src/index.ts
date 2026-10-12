import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import Server from "./Server";
import { initModels, initRoutes } from "./bootstrap";
import DatabaseHandler from "./handlers/DatabaseHandler";
import RedisService from "./services/RedisService";
import SocketService from "./services/SocketService";

const server = new Server();
const app = new Hono().basePath(server.config.path);

async function run() {
    server.log("App", "Starting server...");

    await DatabaseHandler(server);

    app.use(logger(server.customLogger.bind(server)));
    app.use(
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
        })
    );
    app.use("*", async (c, next) => {
        if (!c.req.path.includes("/media/stream")) {
            c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            c.header("Pragma", "no-cache");
            c.header("Expires", "0");
        }

        await next();
    });

    initModels(server);
    initRoutes(server, app);

    RedisService.init(server.Redis);

    const httpServer = serve(
        {
            fetch: app.fetch,
            port: server.config.port,
        },
        () => {
            server.log("Hono", `Server running at http://localhost:${server.config.port}${server.config.path == "/" ? "" : server.config.path}`);
        }
    );

    SocketService.init(server, httpServer);
}

run();
