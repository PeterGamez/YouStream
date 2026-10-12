import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { MediaInterface, MediaSourceType } from "../interfaces/Database";
import type { RouteInterface } from "../interfaces/Route";
import MediaModel from "../models/MediaModel";

export default class MediaRoute implements RouteInterface {
    private readonly basePath = "/media";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;
    private readonly uploadDir: string;

    private static readonly YOUTUBE_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
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
            // ignore if exists
        }
    }

    private registerRoutes() {
        // Public streaming endpoint for HTML5 video players (No JWT Auth)
        this.app.get("/stream/:filename", async (c) => {
            try {
                const filename = c.req.param("filename");
                const sanitized = path.basename(filename);

                if (sanitized !== filename || filename.includes("..")) {
                    return c.json({ error: "Invalid filename" }, 400);
                }

                const filePath = path.join(this.uploadDir, sanitized);
                if (!existsSync(filePath)) {
                    return c.json({ error: "File not found" }, 404);
                }

                const stat = statSync(filePath);
                const fileSize = stat.size;

                const ext = path.extname(filePath).toLowerCase();
                const mimeType = ext === ".webm" ? "video/webm" : "video/mp4";

                const range = c.req.header("range");
                if (range && range.startsWith("bytes=")) {
                    const parts = range
                        .replace(/bytes=/, "")
                        .trim()
                        .split("-");
                    let start: number;
                    let end: number;

                    if (parts[0] === "") {
                        const suffix = parseInt(parts[1], 10);
                        if (isNaN(suffix) || suffix <= 0) {
                            return c.text("Requested range not satisfiable", 416, {
                                "Content-Range": `bytes */${fileSize}`,
                            });
                        }
                        start = Math.max(0, fileSize - suffix);
                        end = fileSize - 1;
                    } else {
                        start = parseInt(parts[0], 10);
                        end = parts[1] && parts[1].trim() !== "" ? parseInt(parts[1], 10) : fileSize - 1;
                    }

                    if (isNaN(start) || isNaN(end) || start < 0 || start > end || start >= fileSize || end >= fileSize) {
                        return c.text("Requested range not satisfiable", 416, {
                            "Content-Range": `bytes */${fileSize}`,
                        });
                    }

                    const chunkSize = end - start + 1;
                    const nodeStream = createReadStream(filePath, { start, end });
                    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

                    return c.body(webStream, {
                        status: 206,
                        headers: {
                            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                            "Accept-Ranges": "bytes",
                            "Content-Length": chunkSize.toString(),
                            "Content-Type": mimeType,
                            "Cache-Control": "public, max-age=3600",
                        },
                    });
                } else {
                    const nodeStream = createReadStream(filePath);
                    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

                    return c.body(webStream, {
                        status: 200,
                        headers: {
                            "Accept-Ranges": "bytes",
                            "Content-Length": fileSize.toString(),
                            "Content-Type": mimeType,
                            "Cache-Control": "public, max-age=3600",
                        },
                    });
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Media Route", `Stream error: ${message}`);
                return c.json({ error: "Failed to stream media" }, 500);
            }
        });

        // Apply JWT Authentication to all subsequent media management endpoints
        this.app.use("*", this.server.Middleware.auth());

        this.app.post(
            "/upload",
            bodyLimit({
                maxSize: MediaRoute.MAX_FILE_SIZE,
                onError: (c) => {
                    return c.json({ error: "File exceeds maximum size limit of 500MB" }, 413);
                },
            }),
            async (c) => {
                try {
                    const user = await this.server.Middleware.getUser(c);
                    if (!user) {
                        return c.json({ error: "Unauthorized" }, 401);
                    }

                    await this.ensureUploadDir();

                    const body: Record<string, string | File | (string | File)[]> = await c.req.parseBody();
                    const file = body["file"];

                    if (!file || !(file instanceof File)) {
                        return c.json({ error: "No video file provided" }, 400);
                    }

                    if (!MediaRoute.ALLOWED_MIME_TYPES.includes(file.type)) {
                        return c.json({ error: "Invalid video format. Only video/mp4 and video/webm are supported" }, 400);
                    }

                    if (file.size > MediaRoute.MAX_FILE_SIZE) {
                        return c.json({ error: "File exceeds maximum size limit of 500MB" }, 413);
                    }

                    const ext = path.extname(file.name) || (file.type === "video/webm" ? ".webm" : ".mp4");
                    const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
                    const uniqueFilename = `${Date.now()}_${cleanBase}${ext}`;
                    const targetPath = path.join(this.uploadDir, uniqueFilename);

                    let bytesWritten = 0;
                    const sizeLimiter = new Transform({
                        transform(chunk: Buffer, _encoding, callback) {
                            bytesWritten += chunk.length;
                            if (bytesWritten > MediaRoute.MAX_FILE_SIZE) {
                                callback(new Error("File exceeds maximum size limit of 500MB"));
                            } else {
                                callback(null, chunk);
                            }
                        },
                    });

                    const writeStream = createWriteStream(targetPath);
                    try {
                        await pipeline(Readable.fromWeb(file.stream()), sizeLimiter, writeStream);
                    } catch (streamError) {
                        const streamMsg = streamError instanceof Error ? streamError.message : String(streamError);
                        await unlink(targetPath).catch(() => {});
                        if (bytesWritten > MediaRoute.MAX_FILE_SIZE || streamMsg.includes("exceeds")) {
                            return c.json({ error: "File exceeds maximum size limit of 500MB" }, 413);
                        }
                        throw streamError;
                    }

                    const fileUrl = `/media/stream/${uniqueFilename}`;

                    const mediaId = await MediaModel.createMedia(user.id, "local_file", file.name, fileUrl, null, targetPath, bytesWritten || file.size, file.type, null);

                    this.server.log("Media Route", `User ${user.id} uploaded ${file.name} (${bytesWritten || file.size} bytes) -> mediaId ${mediaId}`);

                    return c.json(
                        {
                            message: "File uploaded successfully",
                            mediaId,
                            title: file.name,
                            fileUrl,
                            sourceType: "local_file",
                            fileSizeBytes: bytesWritten || file.size,
                            mimeType: file.type,
                        },
                        201
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.server.error("Media Route", `Upload error: ${message}`);
                    return c.json({ error: "Failed to upload file" }, 500);
                }
            }
        );

        this.app.post("/youtube", async (c) => {
            try {
                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                let body: { url?: string; sourceUrl?: string; title?: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const url = body.url?.trim() || body.sourceUrl?.trim();
                const title = body.title?.trim() || "YouTube Video";

                if (!url) {
                    return c.json({ error: "YouTube URL is required" }, 400);
                }

                const match = url.match(MediaRoute.YOUTUBE_REGEX);
                if (!match || !match[1]) {
                    return c.json({ error: "Invalid YouTube URL. Could not extract video ID" }, 400);
                }

                const youtubeVideoId = match[1];

                const mediaId = await MediaModel.createMedia(user.id, "youtube", title, url, youtubeVideoId, null, null, null, null);

                this.server.log("Media Route", `User ${user.id} added YouTube media: ${youtubeVideoId} -> mediaId ${mediaId}`);

                return c.json(
                    {
                        message: "YouTube media added successfully",
                        mediaId,
                        title,
                        sourceUrl: url,
                        youtubeVideoId,
                        sourceType: "youtube",
                    },
                    201
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Media Route", `Add YouTube error: ${message}`);
                return c.json({ error: "Failed to add YouTube video" }, 500);
            }
        });

        this.app.get("/", async (c) => {
            try {
                const sourceType = c.req.query("sourceType") as MediaSourceType;

                let mediaList: MediaInterface[] = [];
                if (sourceType && (sourceType === "youtube" || sourceType === "local_file")) {
                    mediaList = await MediaModel.selectMediaBySourceType(sourceType);
                } else {
                    mediaList = await MediaModel.selectAllMedia();
                }

                return c.json(mediaList);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Media Route", `Get /media error: ${message}`);
                return c.json({ error: "Failed to retrieve media list" }, 500);
            }
        });

        this.app.get("/:id", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid media ID" }, 400);
                }

                const media = await MediaModel.selectMedia(id);
                if (!media) {
                    return c.json({ error: "Media not found" }, 404);
                }

                return c.json(media);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Media Route", `Get /media/:id error: ${message}`);
                return c.json({ error: "Failed to retrieve media details" }, 500);
            }
        });

        this.app.delete("/:id", async (c) => {
            try {
                const id = parseInt(c.req.param("id"), 10);
                if (isNaN(id)) {
                    return c.json({ error: "Invalid media ID" }, 400);
                }

                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }

                const media = await MediaModel.selectMedia(id);
                if (!media) {
                    return c.json({ error: "Media not found" }, 404);
                }

                if (media.uploaderId !== user.id && user.role !== "admin") {
                    return c.json({ error: "Forbidden: Only the uploader or administrator can delete this media" }, 403);
                }

                if (media.filePath && existsSync(media.filePath)) {
                    try {
                        unlinkSync(media.filePath);
                    } catch (fsErr) {
                        const fsMsg = fsErr instanceof Error ? fsErr.message : String(fsErr);
                        this.server.warn("Media Route", `Failed to unlink file ${media.filePath}: ${fsMsg}`);
                    }
                }

                await MediaModel.deleteMedia(id);

                this.server.log("Media Route", `Media ${id} deleted by user ${user.id}`);

                return c.json({
                    message: "Media deleted successfully",
                    mediaId: id,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.server.error("Media Route", `Delete /media/:id error: ${message}`);
                return c.json({ error: "Failed to delete media" }, 500);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
