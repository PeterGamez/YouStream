import type { Pool, ResultSetHeader } from "mysql2/promise";

import type { RoomInterface, RoomMediaType } from "../interfaces/Database";
import type { RoomType } from "../interfaces/Type";

export default class RoomModel {
    private static table: string;
    private static DB: Pool;

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    public static async createRoom(
        roomCode: string,
        title: string,
        hostId: number,
        description?: string,
        isPrivate?: boolean,
        passcode?: string | null,
        maxParticipants?: number,
        mediaType?: RoomMediaType,
        currentMediaId?: number | null
    ): Promise<number> {
        const connection = await this.DB.getConnection();
        try {
            const sql = `INSERT INTO ${this.table} (roomCode, title, hostId, description, isPrivate, passcode, maxParticipants, mediaType, currentMediaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await connection.execute<ResultSetHeader>(sql, [roomCode, title, hostId, description, isPrivate, passcode, maxParticipants, mediaType, currentMediaId]);
            return result.insertId;
        } finally {
            connection.release();
        }
    }

    public static async selectRoom(id: number): Promise<RoomInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [id]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectAllRoom(): Promise<RoomInterface[]> {
        const sql = `SELECT * FROM ${this.table} ORDER BY id ASC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return rows as RoomInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectRoomByCode(roomCode: string): Promise<RoomInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE roomCode = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [roomCode]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectActiveRooms(): Promise<RoomInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE status = 'active' ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return rows as RoomInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectRoomsByHostId(hostId: number): Promise<RoomInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE hostId = ? ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [hostId]);
            return rows as RoomInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectRoomExistsByCode(roomCode: string): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE roomCode = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [roomCode]);
            return Number(rows[0].count) > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateRoom<T extends keyof RoomType>(id: number, type: T, value: RoomType[T]): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${type} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [value, id]);
        } finally {
            connection.release();
        }
    }

    public static async updateRoomFields(id: number, fields: Partial<RoomType>): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${Object.keys(fields).join(", ")} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [Object.values(fields), id]);
        } finally {
            connection.release();
        }
    }

    public static async endRoom(id: number): Promise<void> {
        const sql = `UPDATE ${this.table} SET status = 'ended', endedAt = NOW() WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [id]);
        } finally {
            connection.release();
        }
    }

    public static async deleteRoom(id: number): Promise<void> {
        const sql = `DELETE FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [id]);
        } finally {
            connection.release();
        }
    }
}
