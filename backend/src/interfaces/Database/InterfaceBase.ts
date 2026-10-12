import type { RowDataPacket } from "mysql2/promise";

export interface InterfaceBase {
    readonly id: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface InterfaceBaseRaw extends RowDataPacket {
    readonly id: number;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface CountRow extends RowDataPacket {
    count: number | bigint;
}
