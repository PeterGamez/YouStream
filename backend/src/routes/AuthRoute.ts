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
                let body: { username: string; email: string; password: string };
                try {
                    body = await c.req.json();
                } catch {
                    return c.json({ error: "Invalid or missing JSON body" }, 400);
                }

                let { username, email, password } = body;

                username = username?.trim()?.toLowerCase();
                email = email?.trim()?.toLowerCase();
                password = password?.trim();

                if (!username || !email || !password) {
                    return c.json({ error: "Missing required fields" }, 400);
                }

                if (!AuthRoute.USERNAME_REGEX.test(username)) {
                    return c.json({ error: "Username can only contain letters, numbers, and underscores" }, 400);
                }

                if (!AuthRoute.EMAIL_REGEX.test(email)) {
                    return c.json({ error: "Invalid email address" }, 400);
                }

                const [existingUser, hashedPassword] = await Promise.all([UserModel.selectUserExistsByUsernameOrEmail(username, email), this.server.Password.hash(password)]);
                if (existingUser) {
                    return c.json({ error: "Username or email already exists" }, 409);
                }

                await UserModel.createUser(username, email, hashedPassword);

                this.server.log("AUTH", `User registered: ${email}`);

                return c.json({ message: "Registration successful." }, 201);
            } catch (error) {
                this.server.error("AUTH", "Registration error: ");
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

                this.server.log("AUTH", `User logged in: ${user.id} | ${user.username} | ${user.email}`);

                return c.json({
                    message: "Login successful",
                    accessToken,
                    refreshToken,
                });
            } catch (error) {
                this.server.error("AUTH", "Login error: ");
                console.error(error);
                return c.json({ error: "Login failed" }, 500);
            }
        });

        this.app.post("/google", async (c) => {
            return c.json({
                message: "Google authentication successful",
                accessToken: "access_token_placeholder",
                refreshToken: "refresh_token_placeholder",
                user: {
                    id: 1,
                    username: "google_user",
                    email: "user@gmail.com",
                    displayName: "Google User",
                    avatarUrl: "https://lh3.googleusercontent.com/a/default",
                    role: "user",
                },
            });
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

                this.server.log("AUTH", `Tokens refreshed for: ${user.id}`);

                return c.json({
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                });
            } catch (error) {
                this.server.error("AUTH", "Token refresh error: ");
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
