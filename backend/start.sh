#!/usr/bin/env bash

# ไปที่ path ของ backend เสมอ (ใช้ $0 เพื่อให้รองรับทั้ง sh และ bash)
cd "$(dirname "$0")" || exit 1
PROJECT_DIR="$(pwd)"

session="YouStream-Backend"

# สร้าง tmux session ถ้ายังไม่มี
if ! tmux has-session -t "$session" 2>/dev/null; then
    tmux new-session -s "$session" -c "$PROJECT_DIR" -d
    sleep 1
    tmux send-keys -t "$session" 'bash' Enter
    sleep 1
fi

# ส่ง Ctrl+C เพื่อหยุด process เดิมที่อาจรันอยู่
tmux send-keys -t "$session" C-c
sleep 1

# เข้าไปที่โฟลเดอร์ backend และเริ่มรันคำสั่ง
tmux send-keys -t "$session" "cd \"$PROJECT_DIR\"" Enter
sleep 1
tmux send-keys -t "$session" 'bun i' Enter
sleep 1
tmux send-keys -t "$session" 'bun run build' Enter
sleep 1
tmux send-keys -t "$session" 'bun run start' Enter
