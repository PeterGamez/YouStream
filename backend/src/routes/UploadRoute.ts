import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";

export default class UploadRoute implements RouteInterface {
    private readonly basePath = "/upload";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth());

        this.app.post("/", async (c) => {
            return c.json(
                {
                    message: "File uploaded successfully",
                    fileUrl: "/media/stream/video_sample.mp4",
                    mediaId: 1,
                    title: "video_sample.mp4",
                    fileSizeBytes: 1048576,
                    mimeType: "video/mp4",
                },
                201
            );
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
