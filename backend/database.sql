-- YouStream Database Schema
-- Table creation DDL script for MariaDB / MySQL

CREATE TABLE IF NOT EXISTS `user` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `avatar_url` VARCHAR(500) NOT NULL,
    `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `uploader_id` INT NOT NULL,
    `source_type` ENUM('youtube', 'local_file') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `source_url` VARCHAR(1000) NOT NULL,
    `youtube_video_id` VARCHAR(50) NULL DEFAULT NULL,
    `file_path` VARCHAR(500) NULL DEFAULT NULL,
    `file_size_bytes` BIGINT NULL DEFAULT NULL,
    `mime_type` VARCHAR(50) NULL DEFAULT NULL,
    `duration_seconds` INT NULL DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `room` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `room_code` CHAR(8) NOT NULL UNIQUE,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL DEFAULT NULL,
    `host_id` INT NOT NULL,
    `media_type` ENUM('none', 'youtube', 'local_file') NOT NULL DEFAULT 'none',
    `current_media_id` INT NULL DEFAULT NULL,
    `is_private` TINYINT(1) NOT NULL DEFAULT 0,
    `passcode` VARCHAR(255) NULL DEFAULT NULL,
    `max_participants` INT NOT NULL DEFAULT 50,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
