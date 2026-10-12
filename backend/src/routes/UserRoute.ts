import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { UserSafeDTO } from "../interfaces/Database";
import type { RouteInterface } from "../interfaces/Route";
import UserModel from "../models/UserModel";
import UserService from "../services/UserService";

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
            try {
                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "User not found" }, 404);
                }

                const userDTO: UserSafeDTO = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                    role: user.role,
                };

                return c.json(userDTO);
            } catch (error: any) {
                this.server.error("User Route", `Get /me error: ${error?.message || error}`);
                return c.json({ error: "Failed to retrieve user profile" }, 500);
            }
        });

        this.app.patch("/me", async (c) => {
            try {
                const user = await this.server.Middleware.getUser(c);
                if (!user) {
                    return c.json({ error: "User not found" }, 404);
                }

                let body: { displayName?: string; avatarUrl?: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const { displayName, avatarUrl } = body;

                if (displayName === undefined && avatarUrl === undefined) {
                    return c.json({ error: "At least one field (displayName, avatarUrl) is required to update" }, 400);
                }

                if (displayName !== undefined) {
                    if (displayName.trim().length === 0) {
                        return c.json({ error: "Display name cannot be empty" }, 400);
                    }
                    if (displayName.trim().length > 100) {
                        return c.json({ error: "Display name cannot exceed 100 characters" }, 400);
                    }
                }

                await UserModel.updateUserFields(user.id, { displayName, avatarUrl });
                UserService.delUser(user.id);

                this.server.log("User Route", `User updated profile: ${user.id} (${user.username})`);

                return c.json({
                    message: "Profile updated successfully",
                });
            } catch (error: any) {
                if (error?.message === "Email already in use") {
                    return c.json({ error: "Email already in use" }, 409);
                }
                this.server.error("User Route", `Update profile error: ${error?.message || error}`);
                return c.json({ error: "Failed to update profile" }, 500);
            }
        });

        this.app.patch("/me/password", async (c) => {
            try {
                const me = await this.server.Middleware.getUser(c);
                if (!me) {
                    return c.json({ error: "User not found" }, 404);
                }

                let body: { currentPassword?: string; oldPassword?: string; newPassword?: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const currentPassword = (body.currentPassword || body.oldPassword)?.trim();
                const newPassword = body.newPassword?.trim();

                if (!currentPassword || !newPassword) {
                    return c.json({ error: "Current password and new password are required" }, 400);
                }

                const user = await UserModel.selectUser(me.id);
                if (!user) {
                    return c.json({ error: "User not found" }, 404);
                }

                const isValidPassword = await this.server.Password.verify(currentPassword, user.password);
                if (!isValidPassword) {
                    return c.json({ error: "Current password is incorrect" }, 401);
                }

                const hashedPassword = await this.server.Password.hash(newPassword);

                await UserModel.updateUser(user.id, "password", hashedPassword);

                this.server.log("User Route", `User changed password: ${user.id} (${user.username})`);

                return c.json({
                    message: "Password updated successfully",
                });
            } catch (error: any) {
                if (error?.message === "Current password is incorrect") {
                    return c.json({ error: "Current password is incorrect" }, 400);
                }
                this.server.error("User Route", `Password change error: ${error?.message || error}`);
                return c.json({ error: "Failed to update password" }, 500);
            }
        });

        this.app.post("/logout", async (c) => {
            try {
                const payload = c.get("jwtPayload");
                if (payload?.userId) {
                    await UserService.delUser(payload.userId);
                    this.server.log("User Route", `User logged out: ${payload.userId}`);
                }

                return c.json({
                    message: "Logged out successfully",
                });
            } catch (error: any) {
                this.server.error("User Route", `Logout error: ${error?.message || error}`);
                return c.json({ error: "Failed to log out" }, 500);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
