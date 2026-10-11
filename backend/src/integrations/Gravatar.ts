import crypto from "crypto";

export default class Gravatar {
    public static getAvatarURL(email: string) {
        const clean = email.trim().toLowerCase();
        const hash = crypto.createHash("sha256").update(clean).digest("hex");
        return `https://www.gravatar.com/avatar/${hash}?d=mp`;
    }
}