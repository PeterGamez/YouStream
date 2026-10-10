import type { InterfaceBase } from "./InterfaceBase";

export interface UserInterface extends InterfaceBase {
    username: string;
    email: string;
    password: string;
    role: "user" | "admin";
}
