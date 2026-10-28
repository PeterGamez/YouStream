#!/usr/bin/env bash

# ไปที่ path ของ frontend เสมอ ไม่ว่าจะรันสคริปต์จากที่ไหน
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

session="YouStream-Frontend"

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

# เข้าไปที่โฟลเดอร์ frontend และรันด้วย && เพื่อรอให้แต่ละคำสั่งทำงานเสร็จก่อน
tmux send-keys -t "$session" "cd \"$PROJECT_DIR\"" Enter
sleep 0.5
tmux send-keys -t "$session" 'bun i && bun run build && bun run start' Enter
