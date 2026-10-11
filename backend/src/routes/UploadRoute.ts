import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";
import MediaModel from "../models/MediaModel";

export default class UploadRoute implements RouteInterface {
    private readonly basePath = "/upload";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;
    private readonly uploadDir: string;

    private static readonly MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    private static readonly ALLOWED_MIME_TYPES = ["video/mp4", "video/webm"];

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;
        this.uploadDir = this.server.config.uploadDir;

        this.registerRoutes();
    }

    private async ensureUploadDir() {
        try {
            await mkdir(this.uploadDir, { recursive: true });
        } catch {
            // ignore
        }
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth());

        this.app.post("/", async (c) => {
            try {
                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                await this.ensureUploadDir();

                const body = await c.req.parseBody();
                const file = body["file"];

                if (!file || !(file instanceof File)) {
                    return c.json({ error: "No video file provided" }, 400);
                }

                if (!UploadRoute.ALLOWED_MIME_TYPES.includes(file.type)) {
                    return c.json({ error: "Invalid video format. Only video/mp4 and video/webm are supported" }, 400);
                }

                if (file.size > UploadRoute.MAX_FILE_SIZE) {
                    return c.json({ error: "File exceeds maximum size limit of 500MB" }, 400);
                }

                const ext = path.extname(file.name) || (file.type === "video/webm" ? ".webm" : ".mp4");
                const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
                const uniqueFilename = `${Date.now()}_${cleanBase}${ext}`;
                const targetPath = path.join(this.uploadDir, uniqueFilename);

                const arrayBuffer = await file.arrayBuffer();
                await writeFile(targetPath, Buffer.from(arrayBuffer));

                const fileUrl = `/media/stream/${uniqueFilename}`;

                const mediaId = await MediaModel.createMedia(user.id, "local_file", file.name, fileUrl, null, targetPath, file.size, file.type, null);

                this.server.log("Upload Route", `User ${user.id} uploaded file: ${file.name} (${file.size} bytes) -> mediaId ${mediaId}`);

                return c.json(
                    {
                        message: "File uploaded successfully",
                        fileUrl,
                        mediaId,
                        title: file.name,
                        fileSizeBytes: file.size,
                        mimeType: file.type,
                    },
                    201
                );
            } catch (error: any) {
                this.server.error("Upload Route", `Upload error: ${error?.message || error}`);
                return c.json({ error: "Failed to upload file" }, 500);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
