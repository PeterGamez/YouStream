import type { Pool, ResultSetHeader } from "mysql2/promise";

import Gravatar from "../integrations/Gravatar";
import type { UserInterface, UserRawInterface } from "../interfaces/Database";
import type { UserType } from "../interfaces/Type";

export default class UserModel {
    private static table: string;
    private static DB: Pool;

    private static readonly COLUMN_MAP: Record<string, string> = {
        displayName: "display_name",
        avatarUrl: "avatar_url",
        display_name: "display_name",
        avatar_url: "avatar_url",
        password: "password",
        email: "email",
        username: "username",
        role: "role",
    };

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    public static get getTable(): string {
        return this.table;
    }

    private static mapRowToUser(row: UserRawInterface): UserInterface {
        if (!row) return null;
        return {
            id: row.id,
            username: row.username,
            email: row.email,
            password: row.password,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
            role: row.role,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    public static async createUser(username: string, email: string, password: string, displayName: string): Promise<number> {
        const avatarUrl = await Gravatar.getAvatarURL(email);

        const connection = await this.DB.getConnection();
        try {
            const sql = `INSERT INTO ${this.table} (username, email, password, display_name, avatar_url) VALUES (?, ?, ?, ?, ?)`;
            const [result] = await connection.execute<ResultSetHeader>(sql, [username, email, password, displayName, avatarUrl]);
            return result.insertId;
        } finally {
            connection.release();
        }
    }

    public static async selectUser(id: number): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [id]);
            return this.mapRowToUser((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectUsersByIds(ids: number[]): Promise<UserInterface[]> {
        if (!ids || ids.length === 0) return [];
        const placeholders = ids.map(() => "?").join(", ");
        const sql = `SELECT * FROM ${this.table} WHERE id IN (${placeholders})`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, ids);
            return (rows as any[]).map((row) => this.mapRowToUser(row)).filter((u): u is UserInterface => u !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectAllUser(): Promise<UserInterface[]> {
        const sql = `SELECT * FROM ${this.table} ORDER BY id ASC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return (rows as any[]).map((row) => this.mapRowToUser(row)).filter((u): u is UserInterface => u !== null);
        } finally {
            connection.release();
        }
    }

    public static async selectUserByUsernameOrEmail(user: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE (username = ? OR email = ?)`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [user, user]);
            return this.mapRowToUser((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectUserByUsername(username: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE username = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [username]);
            return this.mapRowToUser((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectUserByEmail(email: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE email = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [email]);
            return this.mapRowToUser((rows as any[])[0]);
        } finally {
            connection.release();
        }
    }

    public static async selectUserExistsByUsernameOrEmail(username: string, email: string): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE (username = ? OR email = ?)`;

        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [username, email]);
            return Number((rows as any[])[0].count) > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateUser<T extends keyof UserType>(id: number, type: T, value: UserType[T]): Promise<void> {
        const column = this.COLUMN_MAP[type as string] || (type as string);
        const sql = `UPDATE ${this.table} SET ${column} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [value, id]);
        } finally {
            connection.release();
        }
    }

    public static async updateUserFields(id: number, fields: { displayName?: string; avatarUrl?: string }): Promise<void> {
        const updates: string[] = [];
        const values: (string | number)[] = [];

        if (fields.displayName !== undefined) {
            updates.push("display_name = ?");
            values.push(fields.displayName);
        }
        if (fields.avatarUrl !== undefined) {
            updates.push("avatar_url = ?");
            values.push(fields.avatarUrl);
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

    public static async deleteUser(id: number): Promise<void> {
        const sql = `DELETE FROM ${this.table} WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [id]);
        } finally {
            connection.release();
        }
    }
}
