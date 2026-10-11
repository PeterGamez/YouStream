import type { UserInterface } from "../Database";
import type { OmitDatabase } from "../Omit";

export type UserType = OmitDatabase<UserInterface>;
