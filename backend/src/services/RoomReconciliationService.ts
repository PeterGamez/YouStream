import type Redis from "ioredis";

import type Server from "../Server";
import type { RoomMediaType } from "../interfaces/Database";
import RoomModel from "../models/RoomModel";

export interface PendingMediaRollback {
    roomId: number;
    targetMediaType: RoomMediaType;
    targetMediaId: number | null;
    failedAt: string;
    attempts: number;
    lastError?: string;
}

export default class RoomReconciliationService {
    private static server: Server;
    private static Redis: Redis;
    private static pendingJobs = new Map<number, PendingMediaRollback>();
    private static workerTimer: NodeJS.Timeout | null = null;
    private static isProcessing = false;

    private static readonly REDIS_PREFIX = "reconciliation:rollback:";
    private static readonly REDIS_SET = "reconciliation:pending_rooms";

    public static init(server: Server, redis?: Redis): void {
        this.server = server;
        if (redis) {
            this.Redis = redis;
        }

        void this.recoverFromRedis();
    }

    public static setRedis(redis: Redis): void {
        this.Redis = redis;
        void this.recoverFromRedis();
    }

    private static async recoverFromRedis(): Promise<void> {
        if (!this.Redis) return;
        try {
            const roomIds = await this.Redis.smembers(this.REDIS_SET);
            for (const idStr of roomIds) {
                const roomId = Number(idStr);
                if (isNaN(roomId)) continue;
                const raw = await this.Redis.get(`${this.REDIS_PREFIX}${roomId}`);
                if (raw) {
                    try {
                        const job = JSON.parse(raw) as PendingMediaRollback;
                        this.pendingJobs.set(roomId, job);
                    } catch {
                        // ignore parse error
                    }
                }
            }

            if (this.pendingJobs.size > 0) {
                this.server?.log("Reconciliation", `Recovered ${this.pendingJobs.size} pending media rollback reconciliation job(s) from Redis`);
                this.startWorker();
            }
        } catch (error) {
            this.server?.warn("Reconciliation", `Failed to recover reconciliation jobs from Redis: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public static async queueRollback(job: PendingMediaRollback): Promise<void> {
        this.pendingJobs.set(job.roomId, job);

        if (this.Redis) {
            try {
                await this.Redis.set(`${this.REDIS_PREFIX}${job.roomId}`, JSON.stringify(job));
                await this.Redis.sadd(this.REDIS_SET, String(job.roomId));
            } catch (err) {
                this.server?.warn("Reconciliation", `Failed to persist rollback job for room ${job.roomId} to Redis: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        this.startWorker();
    }

    public static async getPendingRollback(roomId: number): Promise<PendingMediaRollback | null> {
        const inMemory = this.pendingJobs.get(roomId);
        if (inMemory) return inMemory;

        if (this.Redis) {
            try {
                const raw = await this.Redis.get(`${this.REDIS_PREFIX}${roomId}`);
                if (raw) {
                    const job = JSON.parse(raw) as PendingMediaRollback;
                    this.pendingJobs.set(roomId, job);
                    return job;
                }
            } catch {
                // ignore
            }
        }

        return null;
    }

    private static inFlightReconciliations = new Map<number, Promise<boolean>>();

    public static async cancelRollback(roomId: number): Promise<void> {
        this.pendingJobs.delete(roomId);

        if (this.Redis) {
            try {
                await this.Redis.del(`${this.REDIS_PREFIX}${roomId}`);
                await this.Redis.srem(this.REDIS_SET, String(roomId));
            } catch (err) {
                this.server?.warn("Reconciliation", `Failed to remove rollback job for room ${roomId} from Redis: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        if (this.pendingJobs.size === 0) {
            this.stopWorker();
        }
    }

    public static async reconcileRoom(roomId: number): Promise<boolean> {
        const existing = this.inFlightReconciliations.get(roomId);
        if (existing) {
            return await existing;
        }

        const task = (async (): Promise<boolean> => {
            const job = await this.getPendingRollback(roomId);
            if (!job) return true;

            try {
                await RoomModel.updateRoomFields(roomId, {
                    mediaType: job.targetMediaType,
                    currentMediaId: job.targetMediaId,
                });

                await this.cancelRollback(roomId);

                this.server?.log("Reconciliation", `Successfully reconciled room ${roomId} media to mediaType=${job.targetMediaType}, currentMediaId=${job.targetMediaId}`);

                return true;
            } catch (error) {
                job.attempts++;
                job.lastError = error instanceof Error ? error.message : String(error);
                this.server?.warn("Reconciliation", `Failed attempt ${job.attempts} to reconcile room ${roomId}: ${job.lastError}`);
                return false;
            }
        })();

        this.inFlightReconciliations.set(roomId, task);
        try {
            return await task;
        } finally {
            this.inFlightReconciliations.delete(roomId);
        }
    }

    public static async getEffectiveRoomMedia(
        roomId: number,
        currentDbMedia: { mediaType: RoomMediaType; currentMediaId: number | null }
    ): Promise<{ mediaType: RoomMediaType; currentMediaId: number | null }> {
        const job = await this.getPendingRollback(roomId);
        if (!job) {
            return currentDbMedia;
        }

        const reconciled = await this.reconcileRoom(roomId);
        if (reconciled) {
            return {
                mediaType: job.targetMediaType,
                currentMediaId: job.targetMediaId,
            };
        }

        return {
            mediaType: job.targetMediaType,
            currentMediaId: job.targetMediaId,
        };
    }

    private static startWorker(): void {
        if (this.workerTimer) return;
        this.workerTimer = setInterval(() => {
            void this.processQueue();
        }, 3000);
    }

    private static stopWorker(): void {
        if (this.workerTimer) {
            clearInterval(this.workerTimer);
            this.workerTimer = null;
        }
    }

    private static async processQueue(): Promise<void> {
        if (this.isProcessing || this.pendingJobs.size === 0) return;
        this.isProcessing = true;

        try {
            for (const [roomId] of this.pendingJobs) {
                await this.reconcileRoom(roomId);
            }
        } finally {
            this.isProcessing = false;
        }
    }
}
