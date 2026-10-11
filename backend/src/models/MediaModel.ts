import type { Pool, ResultSetHeader } from "mysql2/promise";

import type { MediaInterface, MediaRawInterface, MediaSourceType } from "../interfaces/Database";
import type { MediaType } from "../interfaces/Type";

export default class MediaModel {
    private static table: string;
    private static DB: Pool;

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    private static mapRowToMedia(row: MediaRawInterface | any): MediaInterface | null {
        if (!row) return null;
        return {
            id: row.id,
            uploaderId: row.uploader_id ?? row.uploaderId,
            sourceType: row.source_type ?? row.sourceType,
            title: row.title,
            sourceUrl: row.source_url ?? row.sourceUrl,
            youtubeVideoId: row.youtube_video_id ?? row.youtubeVideoId ?? null,
            filePath: row.file_path ?? row.filePath ?? null,
            fileSizeBytes: row.file_size_bytes !== null && row.file_size_bytes !== undefined ? Number(row.file_size_bytes) : (row.fileSizeBytes ?? null),
            mimeType: row.mime_type ?? row.mimeType ?? null,
            durationSeconds: row.duration_seconds !== null && row.duration_seconds !== undefined ? Number(row.duration_seconds) : (row.durationSeconds ?? null),
            createdAt: row.created_at ?? row.createdAt,
            updatedAt: row.updated_at ?? row.updatedAt,
        };
    }

    public static async createMedia(
        uploaderId: number,
        sourceType: MediaSourceType,
        title: string,
        sourceUrl: string,
        youtubeVideoId: string,
        filePath: string,
        fileSizeBytes: number,
        mimeType: string,
        durationSeconds: number
    ): Promise<number> {
        const connection = await this.DB.getConnection();
        try {
            const sql = `INSERT INTO ${this.table} (uploader_id, source_type, title, source_url, youtube_video_id, file_path, file_size_bytes, mime_type, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await connection.execute<ResultSetHeader>(sql, [uploaderId, sourceType, title, sourceUrl, youtubeVideoId, filePath, fileSizeBytes, mimeType, durationSeconds]);
            return result.insertId;
        } finally {
            connection.release();
        }
    }

    public static async selectMedia(id: number): Promise<MediaInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [id]);
            return this.mapRowToMedia((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectAllMedia(): Promise<MediaInterface[]> {
        const sql = `SELECT * FROM ${this.table} ORDER BY id ASC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return (rows as any[]).map((row) => this.mapRowToMedia(row)).filter((m): m is MediaInterface => m !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectMediaByUploaderId(uploaderId: number): Promise<MediaInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE uploader_id = ? ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [uploaderId]);
            return (rows as any[]).map((row) => this.mapRowToMedia(row)).filter((m): m is MediaInterface => m !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectMediaBySourceType(sourceType: MediaSourceType): Promise<MediaInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE source_type = ? ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [sourceType]);
            return (rows as any[]).map((row) => this.mapRowToMedia(row)).filter((m): m is MediaInterface => m !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectMediaByYoutubeVideoId(youtubeVideoId: string): Promise<MediaInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE youtube_video_id = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [youtubeVideoId]);
            return this.mapRowToMedia((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectMediaExistsById(id: number): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [id]);
            return Number((rows as any[])[0].count) > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateMedia<T extends keyof MediaType>(id: number, type: T, value: MediaType[T]): Promise<void> {
        const columnMap: Record<string, string> = {
            uploaderId: "uploader_id",
            sourceType: "source_type",
            sourceUrl: "source_url",
            youtubeVideoId: "youtube_video_id",
            filePath: "file_path",
            fileSizeBytes: "file_size_bytes",
            mimeType: "mime_type",
            durationSeconds: "duration_seconds",
            title: "title",
        };
        const column = columnMap[type as string] || (type as string);
        const sql = `UPDATE ${this.table} SET ${column} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [value, id]);
        } finally {
            connection.release();
        }
    }

    public static async updateMediaFields(id: number, fields: Partial<MediaType>): Promise<void> {
        const updates: string[] = [];
        const values: any[] = [];
        const columnMap: Record<string, string> = {
            uploaderId: "uploader_id",
            sourceType: "source_type",
            sourceUrl: "source_url",
            youtubeVideoId: "youtube_video_id",
            filePath: "file_path",
            fileSizeBytes: "file_size_bytes",
            mimeType: "mime_type",
            durationSeconds: "duration_seconds",
            title: "title",
        };

        for (const [key, val] of Object.entries(fields)) {
            if (val !== undefined) {
                const col = columnMap[key] || key;
                updates.push(`${col} = ?`);
                values.push(val);
            }
        }

        if (updates.length === 0) return;

        values.push(id);
        const sql = `UPDATE ${this.table} SET ${updates.join(", ")} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, values);
        } finally {
            connection.release();
        }
    }

    public static async deleteMedia(id: number): Promise<void> {
        const sql = `DELETE FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [id]);
        } finally {
            connection.release();
        }
    }
}
