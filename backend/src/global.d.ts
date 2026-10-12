import type { JWTPayload } from "./interfaces/Auth";
import type { UserSafeDTO } from "./interfaces/Database";

declare module "hono" {
    interface ContextVariableMap {
        jwtPayload: JWTPayload;
        authUser: UserSafeDTO;
    }
}
