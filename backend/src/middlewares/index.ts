import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type Server from "../Server";
import type { UserSafeDTO } from "../interfaces/Database";
import UserService from "../services/UserService";

export default class Middleware {
    private server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    public auth() {
        return createMiddleware(async (c, next): Promise<Response> => {
            const authHeader = c.req.header("Authorization");

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const token = authHeader.split(" ")[1];

            const payload = await this.server.JWT.verifyAccessToken(token);
            if (!payload) {
                return c.json({ error: "Invalid or expired token" }, 401);
            }

            c.set("jwtPayload", payload);

            await next();
        });
    }

    public adminOnly() {
        return createMiddleware(async (c, next): Promise<Response> => {
            const user = await this.getUser(c);
            if (!user) {
                return c.json({ error: "User not found" }, 404);
            }

            if (user.role !== "admin") {
                return c.json({ error: "Forbidden" }, 403);
            }

            await next();
        });
    }

    public async getUser(c: Context): Promise<UserSafeDTO> {
        const cachedUser = c.get("authUser");
        if (cachedUser) {
            return cachedUser;
        }

        const payload = c.get("jwtPayload");
        if (!payload?.userId) {
            return null;
        }

        const userSafe = await UserService.getUser(payload.userId);
        c.set("authUser", userSafe);
        return userSafe;
    }
}
