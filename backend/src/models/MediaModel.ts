import type { Pool, ResultSetHeader } from "mysql2/promise";

import type { MediaInterface, MediaSourceType } from "../interfaces/Database";
import type { MediaType } from "../interfaces/Type";

export default class MediaModel {
    private static table: string;
    private static DB: Pool;

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    public static async createMedia(
        uploaderId: number,
        sourceType: MediaSourceType,
        title: string,
        sourceUrl: string,
        youtubeVideoId?: string | null,
        filePath?: string | null,
        fileSizeBytes?: number | null,
        mimeType?: string | null,
        durationSeconds?: number | null
    ): Promise<number> {
        const connection = await this.DB.getConnection();
        try {
            const sql = `INSERT INTO ${this.table} (uploaderId, sourceType, title, sourceUrl, youtubeVideoId, filePath, fileSizeBytes, mimeType, durationSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectAllMedia(): Promise<MediaInterface[]> {
        const sql = `SELECT * FROM ${this.table} ORDER BY id ASC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return rows as MediaInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectMediaByUploaderId(uploaderId: number): Promise<MediaInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE uploaderId = ? ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [uploaderId]);
            return rows as MediaInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectMediaBySourceType(sourceType: MediaSourceType): Promise<MediaInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE sourceType = ? ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [sourceType]);
            return rows as MediaInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectMediaByYoutubeVideoId(youtubeVideoId: string): Promise<MediaInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE youtubeVideoId = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [youtubeVideoId]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectMediaExistsById(id: number): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [id]);
            return Number(rows[0].count) > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateMedia<T extends keyof MediaType>(id: number, type: T, value: MediaType[T]): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${type} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [value, id]);
        } finally {
            connection.release();
        }
    }

    public static async updateMediaFields(id: number, fields: Partial<MediaType>): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${Object.keys(fields).join(", ")} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [Object.values(fields), id]);
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
