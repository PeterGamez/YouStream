import type { InterfaceBase } from "../Database/InterfaceBase";

export type OmitDatabase<T> = Omit<T, keyof InterfaceBase>;
