import type { Hono } from "hono";

export interface RouteInterface {
    getApp(app: Hono): void;
}
