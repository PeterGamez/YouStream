import Redis from "ioredis";
import { createPool } from "mysql2/promise";

import type Server from "../Server";

export default async function DatabaseHandler(server: Server) {
    const pool = createPool({
        host: server.config.mysql.host,
        port: server.config.mysql.port,
        user: server.config.mysql.user,
        password: server.config.mysql.password,
        database: server.config.mysql.database,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 10,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        connectTimeout: 20000,

        typeCast: function (field, next) {
            // แปลง TINYINT(1) เป็น Boolean
            if (field.type === "TINY" && field.length === 1) {
                return field.string() === "1";
            } else {
                return next();
            }
        },
    });

    pool.on("enqueue", () => {
        server.warn("Database", "Waiting for available connection slot!");
    });

    const connection = await pool.getConnection();
    connection.release();

    server.DB = pool;

    server.log("Database", "MySQL Connected!");

    server.Redis = new Redis(server.config.redis);

    server.Redis.on("ready", () => {
        server.log("Redis", `Connected to Redis DB ${server.config.redis.db}`);
    });

    server.Redis.on("error", (err) => {
        server.error("Redis", "Redis Error");
        console.error(err);
    });

    return true;
}
