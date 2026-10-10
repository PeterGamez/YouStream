import type { JWTPayload } from "./interfaces/Auth";
import type { UserInterface } from "./interfaces/Database";

declare module "hono" {
    interface ContextVariableMap {
        jwtPayload: JWTPayload;
        authUser: UserInterface;
    }
}
