import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";

export default class IndexRoute implements RouteInterface {
    private readonly basePath = "/";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.get("/", (c) => {
            return c.json({ message: "Hono + TypeScript Server" });
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);

        app.notFound((c) => {
            return c.json({ error: "Not Found" }, 404);
        });

        app.onError((err, c) => {
            this.server.error("Hono", "Unhandled error occurred");
            console.error(err);
            return c.json({ message: "Internal Server Error" }, 500);
        });

        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
