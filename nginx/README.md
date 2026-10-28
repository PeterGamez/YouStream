# Nginx Configuration Guide for YouStream

คู่มือการติดตั้ง Nginx บน VPS (Ubuntu / Debian)

## 1. คัดลอกไฟล์ Config ไปยัง Nginx
```bash
sudo cp nginx/frontend.conf /etc/nginx/sites-available/youstream-frontend.conf
sudo cp nginx/backend.conf /etc/nginx/sites-available/youstream-backend.conf
```

## 2. ทำ Symlink เพื่อ Enable Sites
```bash
sudo ln -s /etc/nginx/sites-available/youstream-frontend.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/youstream-backend.conf /etc/nginx/sites-enabled/
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
Certbot จะทำการตั้งค่า SSL และ Redirect HTTP -> HTTPS ให้โดยอัตโนมัติ
