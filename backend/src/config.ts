export default {
    path: process.env.API_PATH || "/",
    port: parseInt(process.env.PORT || "3001"),

    site: {
        name: process.env.SITE_NAME || "YouStream",
        url: process.env.SITE_URL || "http://localhost:3000",
    },

    auth: {
        accessTokenSecret: process.env.JWT_ACCESS_TOKEN_SECRET || "default_access_token_secret",
        refreshTokenSecret: process.env.JWT_REFRESH_TOKEN_SECRET || "default_refresh_token_secret",
        accessTokenTtl: "1h",
        refreshTokenTtl: "24h",
    },

    mysql: {
        host: process.env.MYSQL_HOST || "localhost",
        port: parseInt(process.env.MYSQL_PORT || "3306"),
        user: process.env.MYSQL_USER || "root",
        password: process.env.MYSQL_PASSWORD || "",
        database: process.env.MYSQL_DATABASE || "",

        table: {
            user: "user",
            room: "room",
            media: "media",
        },
    },

    redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD || "",
        db: parseInt(process.env.REDIS_DB || "0"),
    },
};
