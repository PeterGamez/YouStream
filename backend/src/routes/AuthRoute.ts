import { Hono } from "hono";
import type { BlankEnv, BlankSchema } from "hono/types";

import type Server from "../Server";
import type { RouteInterface } from "../interfaces/Route";
import UserModel from "../models/UserModel";

export default class AuthRoute implements RouteInterface {
    private readonly basePath = "/auth";
    private app: Hono<BlankEnv, BlankSchema, typeof this.basePath>;
    private server: Server;

    private static readonly USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
    private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    constructor(server: Server) {
        this.app = new Hono();
        this.server = server;

        this.registerRoutes();
    }

    private registerRoutes() {
        this.app.post("/register", async (c) => {
            try {
                let body: { username: string; email: string; password: string; displayName: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                let { username, email, password, displayName } = body;

                username = username?.trim()?.toLowerCase();
                email = email?.trim()?.toLowerCase();
                password = password?.trim();
                displayName = displayName?.trim();

                if (!username || !email || !password || !displayName) {
                    return c.json({ error: "Missing required fields" }, 400);
                }

                if (!AuthRoute.USERNAME_REGEX.test(username)) {
                    return c.json({ error: "Username can only contain letters, numbers, and underscores" }, 400);
                }

                if (!AuthRoute.EMAIL_REGEX.test(email)) {
                    return c.json({ error: "Invalid email address" }, 400);
                }

                const existingUser = await UserModel.selectUserExistsByUsernameOrEmail(username, email);
                if (existingUser) {
                    return c.json({ error: "Username or email already exists" }, 409);
                }

                const hashedPassword = await this.server.Password.hash(password);

                await UserModel.createUser(username, email, hashedPassword, displayName);

                this.server.log("Auth Route", `User registered: ${email}`);

                return c.json({ message: "Registration successful." }, 201);
            } catch (error) {
                this.server.error("Auth Route", "Registration error: ");
                console.error(error);
                return c.json({ error: "Registration failed" }, 500);
            }
        });

        this.app.post("/login", async (c) => {
            try {
                let body: { username: string; password: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                let { username, password } = body;

                username = username?.trim()?.toLowerCase();
                password = password?.trim();

                if (!username || !password) {
                    return c.json({ error: "Missing username/email or password" }, 400);
                }

                const user = await UserModel.selectUserByUsernameOrEmail(username);
                if (!user) {
                    return c.json({ error: "Username/email or password is incorrect" }, 401);
                }

                const isValidPassword = await this.server.Password.verify(password, user.password);
                if (!isValidPassword) {
                    return c.json({ error: "Username/email or password is incorrect" }, 401);
                }

                const accessToken = await this.server.JWT.generateAccessToken(user);
                const refreshToken = await this.server.JWT.generateRefreshToken(user);

                this.server.log("Auth Route", `User logged in: ${user.id} | ${user.username} | ${user.email}`);

                return c.json({
                    message: "Login successful",
                    accessToken,
                    refreshToken,
                });
            } catch (error) {
                this.server.error("Auth Route", "Login error: ");
                console.error(error);
                return c.json({ error: "Login failed" }, 500);
            }
        });

        this.app.post("/refresh", async (c) => {
            try {
                let body: { refreshToken: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                const { refreshToken } = body;

                if (!refreshToken) {
                    return c.json({ error: "Missing refresh token" }, 400);
                }

                const payload = await this.server.JWT.verifyRefreshToken(refreshToken);
                if (!payload) {
                    return c.json({ error: "Invalid or expired token" }, 400);
                }

                const user = await UserModel.selectUser(payload.userId);
                if (!user) {
                    return c.json({ error: "User not found" }, 401);
                }

                const newAccessToken = await this.server.JWT.generateAccessToken(user);
                const newRefreshToken = await this.server.JWT.generateRefreshToken(user);

                this.server.log("Auth Route", `Tokens refreshed for: ${user.id}`);

                return c.json({
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                });
            } catch (error) {
                this.server.error("Auth Route", "Token refresh error: ");
                console.error(error);
                return c.json({ error: "Invalid or expired refresh token" }, 401);
            }
        });
    }

    public getApp(app: Hono) {
        app.route(this.basePath, this.app);
        this.server.log("Route", `Registered route: ${this.basePath} [${this.app.routes.length} endpoints]`);
    }
}
