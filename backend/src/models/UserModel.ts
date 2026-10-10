import type { Pool, ResultSetHeader } from "mysql2/promise";

import type { UserInterface } from "../interfaces/Database";
import type { UserType } from "../interfaces/Type";

export default class UserModel {
    private static table: string;
    private static DB: Pool;

    public static init(table: string, DB: Pool) {
        this.table = table;
        this.DB = DB;
    }

    public static async createUser(username: string, email: string, password: string): Promise<number> {
        const sql = `INSERT INTO ${this.table} (username, email, password) VALUES (?, ?, ?)`;
        const connection = await this.DB.getConnection();
        try {
            const [result] = await connection.execute<ResultSetHeader>(sql, [username, email, password]);
            return result.insertId;
        } finally {
            connection.release();
        }
    }

    public static async selectUser(id: number): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE id = ? AND deletedAt IS NULL`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [id]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectAllUser(): Promise<UserInterface[]> {
        const sql = `SELECT * FROM ${this.table} WHERE id > 10 AND deletedAt IS NULL`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql);
            return rows as UserInterface[];
        } finally {
            connection.release();
        }
    }

    public static async selectUserByUsernameOrEmail(user: string): Promise<UserInterface> {
        const sql = `SELECT * FROM ${this.table} WHERE (username = ? OR email = ?) AND deletedAt IS NULL`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [user, user]);
            return rows[0];
        } finally {
            connection.release();
        }
    }

    public static async selectUserExistsByUsernameOrEmail(username: string, email: string): Promise<boolean> {
        const sql = `SELECT COUNT(*) as count FROM ${this.table} WHERE (username = ? OR email = ?) AND deletedAt IS NULL`;
        const connection = await this.DB.getConnection();
        try {
            const [rows] = await connection.execute(sql, [username, email]);
            return rows[0].count > 0;
        } finally {
            connection.release();
        }
    }

    public static async updateUser<T extends keyof UserType>(id: number, type: T, value: UserType[T]): Promise<void> {
        const sql = `UPDATE ${this.table} SET ${type} = ? WHERE id = ? AND deletedAt IS NULL`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [value, id]);
        } finally {
            connection.release();
        }
    }

    public static async deleteUser(id: number): Promise<void> {
        const sql = `UPDATE ${this.table} SET deletedAt = NOW() WHERE id = ? AND deletedAt IS NULL`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [id]);
        } finally {
            connection.release();
        }
    }

    public static async restoreUser(id: number): Promise<void> {
        const sql = `UPDATE ${this.table} SET deletedAt = NULL WHERE id = ? AND deletedAt IS NOT NULL`;
        const connection = await this.DB.getConnection();
        try {
            await connection.execute(sql, [id]);
        } finally {
            connection.release();
        }
    }
}
