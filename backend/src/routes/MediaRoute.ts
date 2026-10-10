import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";

export default class MediaRoute implements RouteInterface {
    private readonly basePath = "/media";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth());

        this.app.post("/upload", async (c) => {
            return c.json(
                {
                    message: "File uploaded successfully",
                    mediaId: 1,
                    title: "video_sample.mp4",
                    fileUrl: "/media/stream/video_sample.mp4",
                    sourceType: "local_file",
                    fileSizeBytes: 1048576,
                    mimeType: "video/mp4",
                    durationSeconds: 120,
                },
                201
            );
        });

        this.app.post("/youtube", async (c) => {
            return c.json(
                {
                    message: "YouTube media added successfully",
                    mediaId: 2,
                    title: "Sample YouTube Video",
                    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    youtubeVideoId: "dQw4w9WgXcQ",
                    sourceType: "youtube",
                },
                201
            );
        });

        this.app.get("/", async (c) => {
            return c.json({
                media: [
                    {
                        id: 1,
                        uploaderId: 1,
                        sourceType: "local_file",
                        title: "video_sample.mp4",
                        sourceUrl: "/media/stream/video_sample.mp4",
                        fileSizeBytes: 1048576,
                        mimeType: "video/mp4",
                        createdAt: new Date().toISOString(),
                    },
                ],
            });
        });

        this.app.get("/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                media: {
                    id: Number(id),
                    uploaderId: 1,
                    sourceType: "local_file",
                    title: "video_sample.mp4",
                    sourceUrl: "/media/stream/video_sample.mp4",
                    fileSizeBytes: 1048576,
                    mimeType: "video/mp4",
                    createdAt: new Date().toISOString(),
                },
            });
        });

        this.app.delete("/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                message: "Media deleted successfully",
                mediaId: Number(id),
            });
        });

        this.app.get("/stream/:filename", async (c) => {
            const filename = c.req.param("filename");
            return c.json({
                message: `Streaming endpoint for ${filename}`,
                filename,
            });
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
