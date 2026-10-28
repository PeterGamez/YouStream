# Nginx Configuration Guide for YouStream

คู่มือการติดตั้ง Nginx แบบรวมไฟล์เดียวสำหรับทั้ง Frontend และ Backend บน VPS (Ubuntu / Debian)

## 1. คัดลอกไฟล์ Config ไปยัง Nginx
```bash
sudo cp nginx/youstream.conf /etc/nginx/sites-available/youstream.conf
```

## 2. ทำ Symlink เพื่อ Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/youstream.conf /etc/nginx/sites-enabled/
```

## 3. ตรวจสอบ Syntax และ Reload Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. ติดตั้ง SSL (HTTPS) อัตโนมัติด้วย Certbot
```bash
sudo apt update && sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d youstream.alltime.in.th -d back-youstream.alltime.in.th
```
Certbot จะตรวจจับ domain ทั้งสองจากไฟล์ `youstream.conf` และสร้าง SSL certificate พร้อม redirect HTTP -> HTTPS ให้ในไฟล์เดียวอัตโนมัติ
