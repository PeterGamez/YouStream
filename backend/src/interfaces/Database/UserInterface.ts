import type { InterfaceBase } from "./InterfaceBase";

export interface UserInterface extends InterfaceBase {
    username: string;
    email: string;
    password: string;
    displayName: string;
    avatarUrl: string;
    role: "user" | "admin";
}

export type UserSafeDTO = {
    id: UserInterface["id"];
    username: UserInterface["username"];
    email: UserInterface["email"];
    displayName: UserInterface["displayName"];
    avatarUrl: UserInterface["avatarUrl"];
    role: UserInterface["role"];
};
