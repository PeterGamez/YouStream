import type Redis from "ioredis";
import type { Pool } from "mysql2/promise";

import config from "./config";
import Middleware from "./middlewares";
import { JWT, Password } from "./security";

export default class Server {
    public config = config;
    public DB: Pool;
    public Redis: Redis;
    public Middleware = new Middleware(this);
    public JWT = new JWT(this);
    public Password = new Password();

    public customLogger(message: string, ...rest: string[]) {
        this.log("REST", `${message} ${rest.join(" ")}`);
    }

    public log(key: string, message: string) {
        key = `${key}`;
        if (key.length < 20) key = key.padEnd(20, " ");
        console.log(`[${this.formatDate(new Date())}] ${key} : ${message}`);
    }

    public warn(key: string, message: string) {
        key = `${key}`;
        if (key.length < 20) key = key.padEnd(20, " ");
        console.warn(`[${this.formatDate(new Date())}] ${key} : ${message}`);
    }

    public error(key: string, message: string) {
        key = `${key}`;
        if (key.length < 20) key = key.padEnd(20, " ");
        console.error(`[${this.formatDate(new Date())}] ${key} : ${message}`);
    }

    private formatDate(date: Date) {
        const pad = (n: number) => n.toString().padStart(2, "0");

        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());

        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }
}
