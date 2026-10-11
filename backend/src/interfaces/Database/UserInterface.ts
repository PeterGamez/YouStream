import type { InterfaceBase } from "./InterfaceBase";

export type UserRole = "user" | "admin";

export interface UserInterface extends InterfaceBase {
    username: string;
    email: string;
    password: string;
    displayName: string;
    avatarUrl: string;
    role: UserRole;
}

export type UserSafeDTO = {
    id: UserInterface["id"];
    username: UserInterface["username"];
    email: UserInterface["email"];
    displayName: UserInterface["displayName"];
    avatarUrl: UserInterface["avatarUrl"];
    role: UserInterface["role"];
};
