import { password } from "bun";

export class Password {
    private readonly ALGORITHM = "bcrypt";
    private readonly SALT_ROUNDS = 12;

    public async hash(pass: string): Promise<string> {
        return await password.hash(pass, {
            algorithm: this.ALGORITHM,
            cost: this.SALT_ROUNDS,
        });
    }

    public async verify(pass: string, hash: string): Promise<boolean> {
        return await password.verify(pass, hash, this.ALGORITHM);
    }
}
