const path = require("path");
const fs = require("fs");

function resolveBun() {
  if (process.env.BUN_PATH && fs.existsSync(process.env.BUN_PATH)) {
    return process.env.BUN_PATH;
  }
  const homeBun = path.join(process.env.HOME || "", ".bun", "bin", "bun");
  if (fs.existsSync(homeBun)) {
    return homeBun;
  }
  return "bun";
}

const bunInterpreter = resolveBun();

module.exports = {
  apps: [
    {
      name: "youstream-backend",
      cwd: path.resolve(__dirname, "backend"),
      script: "dist/index.mjs",
      interpreter: bunInterpreter,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
    {
      name: "youstream-frontend",
      cwd: path.resolve(__dirname, "frontend"),
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      interpreter: bunInterpreter,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
