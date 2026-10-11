import type { Pool, ResultSetHeader } from "mysql2/promise";

import Gravatar from "../integrations/Gravatar";
import type { UserInterface } from "../interfaces/Database";
import type { UserType } from "../interfaces/Type";

export default class UserModel {
    private static table: string;
    private static DB: Pool;

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    public static async createUser(username: string, email: string, password: string, displayName: string): Promise<number> {
        const gravatar = await Gravatar.isAvatarExist(email);
        const avatarUrl = gravatar.isExist ? gravatar.url : null;

        const connection = await this.DB.getConnection();
        try {
            const sql = `INSERT INTO ${this.table} (username, email, password, displayName, avatarUrl) VALUES (?, ?, ?, ?, ?)`;
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
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectAllUser(): Promise<UserInterface[]> {
        const sql = `SELECT * FROM ${this.table} ORDER BY id ASC`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return rows as UserInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectUserByUsernameOrEmail(user: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE (username = ? OR email = ?)`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [user, user]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectUserByUsername(username: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE username = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [username]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectUserByEmail(email: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE email = ?`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [email]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectUserExistsByUsernameOrEmail(username: string, email: string): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE (username = ? OR email = ?)`;
        const params: (string | number)[] = [username, email];

        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, params);
            return Number(rows[0].count) > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateUser<T extends keyof UserType>(id: number, type: T, value: UserType[T]): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${type} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [value, id]);
        } finally {
            connection.release();
        }
    }

    public static async updateUserFields(id: number, fields: { displayName?: string; avatarUrl?: string }): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${Object.keys(fields).join(", ")} = ? WHERE id = ?`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [Object.values(fields), id]);
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
