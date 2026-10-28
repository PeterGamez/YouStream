#!/usr/bin/env bash
set -e

# ==============================================================================
# YouStream - PM2 Management & Startup Script
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Ensure Bun bin path is loaded if installed in user home
export PATH="$HOME/.bun/bin:$PATH"

# Resolve PM2 command (global pm2, bunx pm2, or npx pm2)
if command -v pm2 &> /dev/null; then
    PM2_CMD="pm2"
elif command -v bunx &> /dev/null; then
    PM2_CMD="bunx pm2"
elif command -v npx &> /dev/null; then
    PM2_CMD="npx pm2"
else
    echo "❌ Error: pm2 is not installed and neither bunx nor npx was found."
    echo "Install PM2 globally using: npm install -g pm2"
    exit 1
fi

ACTION="${1:-start}"

function build_backend() {
    echo "📦 Building Backend..."
    cd "$PROJECT_DIR/backend"
    bun install
    bun run build
    cd "$PROJECT_DIR"
}

function build_frontend() {
    echo "📦 Building Frontend..."
    cd "$PROJECT_DIR/frontend"
    bun install
    bun run build
    cd "$PROJECT_DIR"
}

function ensure_env() {
    if [ ! -f "$PROJECT_DIR/backend/.env" ] && [ -f "$PROJECT_DIR/backend/.env.prod" ]; then
        echo "ℹ️  Notice: backend/.env not found. Copying backend/.env.prod..."
        cp "$PROJECT_DIR/backend/.env.prod" "$PROJECT_DIR/backend/.env"
    fi

    if [ ! -f "$PROJECT_DIR/frontend/.env" ] && [ -f "$PROJECT_DIR/frontend/.env.prod" ]; then
        echo "ℹ️  Notice: frontend/.env not found. Copying frontend/.env.prod..."
        cp "$PROJECT_DIR/frontend/.env.prod" "$PROJECT_DIR/frontend/.env"
    fi
}

case "$ACTION" in
    start)
        echo "🚀 Starting YouStream via PM2 (Production)..."
        ensure_env

        # Build if dist or .next build doesn't exist yet, or if --build is passed
        if [ "$2" == "--build" ] || [ ! -d "$PROJECT_DIR/backend/dist" ] || [ ! -f "$PROJECT_DIR/backend/dist/index.mjs" ]; then
            build_backend
        fi

        if [ "$2" == "--build" ] || [ ! -d "$PROJECT_DIR/frontend/.next" ]; then
            build_frontend
        fi

        $PM2_CMD startOrRestart ecosystem.config.cjs --env production
        $PM2_CMD save
        echo ""
        echo "✅ YouStream is running under PM2!"
        $PM2_CMD status
        ;;

    build)
        echo "🔨 Building all services..."
        ensure_env
        build_backend
        build_frontend
        echo "✅ Build completed successfully."
        ;;

    restart)
        echo "🔄 Restarting YouStream..."
        $PM2_CMD restart ecosystem.config.cjs --env production --update-env
        $PM2_CMD status
        ;;

    reload)
        echo "♻️  Reloading YouStream..."
        $PM2_CMD reload ecosystem.config.cjs --env production --update-env
        $PM2_CMD status
        ;;

    stop)
        echo "🛑 Stopping YouStream..."
        $PM2_CMD stop ecosystem.config.cjs
        $PM2_CMD status
        ;;

    delete)
        echo "🗑️  Deleting YouStream PM2 processes..."
        $PM2_CMD delete ecosystem.config.cjs
        $PM2_CMD status
        ;;

    status)
        $PM2_CMD status
        ;;

    logs)
        $PM2_CMD logs "${2:-youstream-backend}"
        ;;

    *)
        echo "Usage: ./start.sh [start|build|restart|reload|stop|delete|status|logs]"
        echo ""
        echo "Commands:"
        echo "  start [--build]  Start or restart with PM2 (optionally build first)"
        echo "  build            Build backend and frontend"
        echo "  restart          Restart all running processes in PM2"
        echo "  reload           Reload all running processes in PM2"
        echo "  stop             Stop processes in PM2"
        echo "  delete           Delete processes from PM2 list"
        echo "  status           Show PM2 status"
        echo "  logs [app_name]  Tail PM2 logs (default: youstream-backend)"
        exit 1
        ;;
esac
