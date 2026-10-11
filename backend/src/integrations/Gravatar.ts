import crypto from "crypto";

export default class Gravatar {
    public static getAvatarURL(email: string) {
        const clean = email.trim().toLowerCase();
        const hash = crypto.createHash("sha256").update(clean).digest("hex");
        return `https://www.gravatar.com/avatar/${hash}?d=mp`;
    }

    public static getDefaultAvatarURL() {
        return "https://www.gravatar.com/avatar/0?d=mp";
    }

    public static async isAvatarExist(email: string) {
        const clean = email.trim().toLowerCase();
        const hash = crypto.createHash("sha256").update(clean).digest("hex");

        const url = `https://www.gravatar.com/avatar/${hash}?d=404`;

        const response = await Bun.fetch(url);

        return { isExist: response.status !== 404, url: `https://www.gravatar.com/avatar/${hash}?d=mp` };
    }
}
