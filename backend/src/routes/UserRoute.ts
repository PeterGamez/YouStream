import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";

export default class UserRoute implements RouteInterface {
    private readonly basePath = "/users";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.use("*", this.server.Middleware.auth());

        this.app.get("/me", async (c) => {
            return c.json({
                user: {
                    id: 1,
                    username: "user",
                    email: "user@example.com",
                    displayName: "User Display Name",
                    avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                    role: "user",
                    createdAt: new Date().toISOString(),
                },
            });
        });

        this.app.patch("/me", async (c) => {
            return c.json({
                message: "Profile updated successfully",
                user: {
                    id: 1,
                    username: "user",
                    email: "user@example.com",
                    displayName: "Updated Name",
                    avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                    role: "user",
                },
            });
        });

        this.app.patch("/me/password", async (c) => {
            return c.json({
                message: "Password updated successfully",
            });
        });

        this.app.post("/logout", async (c) => {
            return c.json({
                message: "Logged out successfully",
            });
        });

        this.app.get("/:id", async (c) => {
            const id = c.req.param("id");
            return c.json({
                user: {
                    id: Number(id),
                    username: "user",
                    displayName: "User Display Name",
                    avatarUrl: "https://www.gravatar.com/avatar/?d=mp",
                    role: "user",
                },
            });
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
