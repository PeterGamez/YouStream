import type { Pool, ResultSetHeader } from "mysql2/promise";

import type { RoomInterface, RoomMediaType, RoomRawInterface } from "../interfaces/Database";
import type { RoomType } from "../interfaces/Type";

export default class RoomModel {
    private static table: string;
    private static DB: Pool;

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    private static mapRowToRoom(row: RoomRawInterface | any): RoomInterface | null {
        if (!row) return null;
        return {
            id: row.id,
            roomCode: row.room_code ?? row.roomCode,
            title: row.title,
            description: row.description ?? "",
            hostId: row.host_id ?? row.hostId,
            status: row.status,
            mediaType: row.media_type ?? row.mediaType ?? "none",
            currentMediaId: row.current_media_id ?? row.currentMediaId ?? null,
            isPrivate: Boolean(row.is_private ?? row.isPrivate),
            passcode: row.passcode ?? row.passcode_hash,
            maxParticipants: row.max_participants ?? row.maxParticipants ?? 50,
            createdAt: row.created_at ?? row.createdAt,
            updatedAt: row.updated_at ?? row.updatedAt,
            endedAt: row.ended_at ?? row.endedAt,
        };
    }

    public static async createRoom(
        roomCode: string,
        title: string,
        hostId: number,
        description: string,
        isPrivate: boolean,
        passcode: string,
        maxParticipants: number,
        mediaType: RoomMediaType,
        currentMediaId?: number
    ): Promise<number> {
        const connection = await this.DB.getConnection();
        try {
            const sql = `INSERT INTO ${this.table} (room_code, title, host_id, description, is_private, passcode, max_participants, media_type, current_media_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
            return this.mapRowToRoom((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectAllRoom(): Promise<RoomInterface[]> {
        const sql = `SELECT * FROM ${this.table} ORDER BY id ASC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return (rows as any[]).map((row) => this.mapRowToRoom(row)).filter((r): r is RoomInterface => r !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectRoomByCode(roomCode: string): Promise<RoomInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE room_code = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [roomCode]);
            return this.mapRowToRoom((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectActiveRooms(): Promise<RoomInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE status = 'active' ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return (rows as any[]).map((row) => this.mapRowToRoom(row)).filter((r): r is RoomInterface => r !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectRoomsByHostId(hostId: number): Promise<RoomInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE host_id = ? ORDER BY id DESC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [hostId]);
            return (rows as any[]).map((row) => this.mapRowToRoom(row)).filter((r): r is RoomInterface => r !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectRoomExistsByCode(roomCode: string): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE room_code = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [roomCode]);
            return Number((rows as any[])[0].count) > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateRoom<T extends keyof RoomType>(id: number, type: T, value: RoomType[T]): Promise<void> {
        const columnMap: Record<string, string> = {
            roomCode: "room_code",
            hostId: "host_id",
            mediaType: "media_type",
            currentMediaId: "current_media_id",
            isPrivate: "is_private",
            maxParticipants: "max_participants",
            endedAt: "ended_at",
            title: "title",
            description: "description",
            status: "status",
            passcode: "passcode",
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

    public static async updateRoomFields(id: number, fields: Partial<RoomType>): Promise<void> {
        const updates: string[] = [];
        const values: any[] = [];
        const columnMap: Record<string, string> = {
            roomCode: "room_code",
            hostId: "host_id",
            mediaType: "media_type",
            currentMediaId: "current_media_id",
            isPrivate: "is_private",
            maxParticipants: "max_participants",
            endedAt: "ended_at",
            title: "title",
            description: "description",
            status: "status",
            passcode: "passcode",
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

    public static async endRoom(id: number): Promise<void> {
        const sql = `UPDATE ${this.table} SET status = 'ended', ended_at = NOW() WHERE id = ?`;
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
