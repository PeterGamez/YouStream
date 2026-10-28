# YouStream: Real-time Co-watching Platform

## Overview
**YouStream** เป็นแพลตฟอร์มเว็บแอปพลิเคชันสำหรับการรับชมวิดีโอร่วมกันแบบเรียลไทม์ (Real-time Co-watching) ที่ออกแบบมาเพื่อให้ผู้ใช้งานสามารถสร้างห้องสตรีมมิ่งและรับชมวิดีโอไปพร้อมกับผู้ใช้คนอื่นๆ โดยระบบจะทำการซิงโครไนซ์สถานะการเล่นจากผู้สร้างห้องไปยังผู้ชมทุกคน

## Core Features
* **Host Control (ระบบผู้ควบคุมห้อง):** ผู้สร้างห้อง (Host) มีสิทธิ์ขาดในการควบคุมวิดีโอเพียงผู้เดียว โดยสามารถสั่ง เล่น (Play), หยุด (Pause), ปรับระดับเสียง (Volume) และปรับความเร็ววิดีโอ (Playback Speed) ซึ่งการเปลี่ยนแปลงทั้งหมดจะแสดงผลที่ฝั่งผู้ชมแบบเรียลไทม์
* **Multi-Source Media (รองรับวิดีโอหลากหลายแหล่ง):** Host สามารถเลือกแชร์วิดีโอได้ 2 รูปแบบ คือการใช้ลิงก์จาก YouTube หรือการนำเข้าไฟล์วิดีโอ (Local File) มาเปิดเอง
* **Room Directory (หน้ารายการห้องรวม):** มีระบบหน้าล็อบบี้แสดงรายการห้องทั้งหมดที่กำลังเปิดสตรีมอยู่ เพื่อให้ผู้ใช้งานทั่วไปสามารถเลือกคลิกเข้าร่วมห้องและรับชมวิดีโอที่สนใจได้ทันที
* **In-Room Live Chat (ระบบแชทสดในห้องสตรีม):** ผู้ชมและ Host สามารถส่งข้อความสนทนาและโต้ตอบกันได้แบบเรียลไทม์ระหว่างรับชมวิดีโอ พร้อมระบบป้องกันการสแปม (Rate Limiting) และการแคชข้อความล่าสุดสำหรับผู้ชมที่เพิ่งเข้าร่วมห้องใหม่ (Late-joiner)
* **Multi-Tab Presence Support (รองรับการใช้งานหลายแท็บ):** ตรวจสอบ Socket ID ของผู้ใช้อย่างละเอียด ป้องกันการหลุดออกจากห้องโดยไม่ตั้งใจเมื่อปิดแท็บใดแท็บหนึ่ง

## Tech Stack
* **Frontend:** Next.js
* **Backend:** Hono / Bun Runtime
* **Database & In-Memory Store:** 
  * MariaDB / MySQL (Persistent Storage: ตาราง `user`, `room`, `media` ผ่านไดรเวอร์ `mysql2/promise`)
  * Redis (In-Memory State & Cache: Real-time Playback State, Active Participants, Active Rooms, 100 Recent Messages Capped List, User Profile Cache, และ Chat Rate Limiting ผ่าน `ioredis`)
* **Real-time Communication:** Socket.io (จัดการ Group Rooms, Video Synchronization, User Presence, และ Real-time Live Chat)
* **Authentication & Security:** JSON Web Tokens (`hono/jwt`, HS256), Password Hashing (`bcrypt` ผ่าน Bun `password` API, Cost 12)

## ⚙️ How it Works

โปรเจค YouStream มีกลไกการทำงานเบื้องหลังแบ่งตาม 3 รูปแบบหลัก ดังนี้:

### 1. การเปิดวิดีโอจาก YouTube (YouTube Syncing)
ระบบจะไม่ได้ทำการดาวน์โหลดวิดีโอ แต่จะใช้วิธีการซิงค์ **Video ID** และ **สถานะการเล่น** ผ่าน WebSockets

*   **Step 1 - Input:** ผู้ควบคุมห้อง (Host) นำลิงก์ YouTube มาวางบนหน้าเว็บ (Next.js)
*   **Step 2 - Extract:** Frontend จะทำการสกัดรหัสวิดีโอ (Video ID) ออกมาจากลิงก์
*   **Step 3 - Emit:** เครื่องของ Host ส่ง Event `video:change` พร้อมข้อมูล `{ roomId, sourceType: 'youtube', youtubeId, title }` ไปยัง Backend (Hono) ผ่าน `Socket.io`
*   **Step 4 - Broadcast:** Backend บันทึกข้อมูลมีเดียลงฐานข้อมูล MariaDB (ตาราง `room`) ควบคู่กับแคชสถานะลง Redis (`room:{roomId}:playback`) แบบ Transactional แล้วจึงกระจาย Event `video:update` ไปยังทุกคนในห้อง
*   **Step 5 - Sync:** ตัวเล่นวิดีโอ (YouTube IFrame API) ฝั่งผู้ชมจะโหลด Video ID เดียวกัน เมื่อ Host สั่ง Play/Pause/Seek จะส่ง Event `video:control` และ Backend จะกระจาย `video:sync` เพื่อปรับเวลาให้ตรงกับ Host ทันที

---

### 2. การนำไฟล์วิดีโอมาเอง (Local File via Server Upload & Stream)
สำหรับการนำไฟล์จากเครื่องคอมพิวเตอร์มาเปิด ระบบจะใช้วิธีอัปโหลดเข้าสู่ระบบเพื่อสร้าง Streaming URL สำหรับการสตรีมร่วมกัน

*   **Step 1 - Select & Upload:** Host เลือกไฟล์วิดีโอจากเครื่อง (รองรับ `.mp4`, `.webm` **ขนาดไฟล์จำกัดไม่เกิน 500MB**) และทำการอัปโหลดผ่าน `POST /media/upload` (Multipart Form Data)
*   **Step 2 - Store & Response:** Backend ทำการตรวจสอบ MIME Type, จำกัดขนาดด้วย Stream Pipeline, บันทึกข้อมูลลงฐานข้อมูล MariaDB (ตาราง `media`) และส่ง URL ตอบกลับ เช่น `/media/stream/{uniqueFilename}`
*   **Step 3 - Emit URL:** เครื่องของ Host ส่ง Event `video:change` พร้อม `{ roomId, sourceType: 'local_file', fileUrl, title, mediaId }` ผ่าน `Socket.io`
*   **Step 4 - Broadcast:** Backend บันทึกลง MariaDB (ตาราง `room`) และ Redis แบบ Transactional (พร้อมกลไก Rollback หากเกิดข้อผิดพลาด) แล้วจึงกระจาย Event `video:update` ให้ทุกคนในห้อง
*   **Step 5 - Stream & Sync:** เบราว์เซอร์ฝั่งผู้ชมจะนำ `fileUrl` ไปใส่ในแท็ก `<video>` เพื่อสตรีมไฟล์จาก Endpoint `/media/stream/:filename` (รองรับ HTTP Range RFC 9110 แบบ 206 Partial Content พร้อม Range Clamping สำหรับการ Buffering ที่ราบรื่น) พร้อมทั้งรับ Event `video:sync` เพื่อซิงค์คำสั่งจาก Host แบบเรียลไทม์

---

### 3. ระบบแชทสดในห้องสตรีม (In-Room Live Chat)
ระบบแชทเปิดโอกาสให้ Host และผู้ชมสื่อสารกันได้แบบเรียลไทม์ควบคู่กับการรับชมวิดีโอ โดยใช้ Socket.io ร่วมกับ In-Memory Cache (Redis) เพื่อความเร็วสูงสุดและลดภาระฐานข้อมูล

*   **Step 1 - Send Message:** ผู้ใช้งาน (Host หรือ Viewer) พิมพ์ข้อความในกล่องแชทบนหน้าเว็บ (Next.js) และกดส่ง
*   **Step 2 - Emit:** เครื่องของผู้ส่งจะส่ง Event `chat:send` พร้อมข้อมูล `{ roomId, message }` ไปยัง Backend ผ่าน `Socket.io`
*   **Step 3 - Rate Limit & Validate:** Backend ตรวจสอบสิทธิ์ผู้ส่ง และเช็ค Rate Limiting ผ่าน Redis (`rate_limit:chat:{userId}`) เพื่อป้องกันสแปม (จำกัด 1 ข้อความ / 1 วินาที หากส่งถี่เกินไปจะส่ง Event `chat:error` แจ้งเตือน)
*   **Step 4 - Cache Message:** Backend จัดรูปแบบข้อมูลข้อความ (`id`, `senderId`, `senderName`, `avatarUrl`, `message`, `messageType`, `createdAt`) และบันทึกลง Redis (`room:{roomId}:messages`) แบบ Capped List (เก็บ 100 ข้อความล่าสุด)
*   **Step 5 - Broadcast:** Backend กระจาย Event `chat:new-message` พร้อมข้อมูลข้อความไปยังทุกคนที่อยู่ในห้องเดียวกันแบบเรียลไทม์
*   **Step 6 - Render & Late-joiner:** เบราว์เซอร์ฝั่งผู้ชมแสดงผลข้อความในช่องแชททันที และหากมีผู้ชมใหม่เข้าห้องมาภายหลัง (Late-joiner) ระบบจะดึงประวัติแชท 100 ข้อความล่าสุดจาก Redis มาแสดงให้อัตโนมัติผ่าน Event `room:joined`

---

## 🚀 Deployment with PM2

สามารถจัดการ Process และรันทั้ง Backend และ Frontend ใน Production ผ่าน PM2 ด้วย `start.sh` และ `ecosystem.config.cjs`:

```bash
# ให้สิทธิ์ execute (ครั้งแรกบน Linux VPS)
chmod +x start.sh

# เริ่มต้นระบบ (Build อัตโนมัติหากยังไม่ได้ Build และเปิดผ่าน PM2)
./start.sh

# คำสั่งอื่นๆ ที่รองรับ
./start.sh build            # ติดตั้ง dependencies และ build ทั้ง backend/frontend
./start.sh start --build    # Rebuild ใหม่ทั้งหมดแล้ว start ด้วย PM2
./start.sh restart          # สั่ง Restart ทุก Service ใน PM2
./start.sh reload           # สั่ง Reload ทุก Service ใน PM2
./start.sh stop             # หยุดการทำงาน
./start.sh status           # ดูสถานะ Process ใน PM2
./start.sh logs             # ดู Real-time logs ของระบบ
```

---

## 📖 Complete Documentation
สำหรับเอกสารข้อกำหนดความต้องการของซอฟต์แวร์ฉบับสมบูรณ์ (Software Requirements Specification) ซึ่งประกอบด้วย Data Dictionary, ER Diagram, สเปกของ In-Memory State บน Redis, รายการ Socket Events ทั้งหมด และสเปกของ RESTful API อย่างละเอียด สามารถศึกษาเพิ่มเติมได้ที่:
* 📄 [SRS.md (Software Requirements Specification)](SRS.md)