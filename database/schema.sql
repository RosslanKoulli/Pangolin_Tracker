-- ============================================
-- ZAP - Pangolin Tracker
-- Database Schema
-- ============================================
-- Run this script to create the required database tables.
-- Compatible with MySQL 5.7+
-- ============================================

-- Create database (if needed)
-- CREATE DATABASE IF NOT EXISTS zap_pangolin 
--     CHARACTER SET utf8mb4 
--     COLLATE utf8mb4_unicode_ci;
-- USE zap_pangolin;

-- ============================================
-- Mortality Types (Reference Data)s
-- ============================================
-- Lookup table for pangolin mortality causes.
-- These match the options in the application brief.

CREATE TABLE IF NOT EXISTS mortality_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert reference data
INSERT INTO mortality_types (code, description) VALUES
    ('fence_electrocution', 'Fence death: electrocution'),
    ('fence_non_electric', 'Fence death: caught on non-electrified fence'),
    ('road_death', 'Road death'),
    ('other', 'Other')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ============================================
-- Sightings Table
-- ============================================
-- Main table storing pangolin sighting records.
-- 
-- Design decisions:
-- - client_id: UUID generated on the client for offline-first design
-- - latitude/longitude: Stored with high precision for GPS accuracy
-- - status: ENUM for data integrity (only 'alive' or 'dead')
-- - mortality_type_id: Foreign key, NULL if pangolin is alive

CREATE TABLE IF NOT EXISTS sightings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    
    -- Client-generated UUID for offline sync
    client_id VARCHAR(36) NOT NULL UNIQUE,
    
    -- Geographic coordinates (high precision for GPS)
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    location_accuracy DECIMAL(10, 2) NULL COMMENT 'Accuracy in meters',
    
    -- Sighting details
    status ENUM('alive', 'dead') NOT NULL,
    mortality_type_id INT NULL,
    notes TEXT NULL,
    
    -- Timestamps
    recorded_at DATETIME NOT NULL COMMENT 'When the sighting occurred',
    synced_at DATETIME NULL COMMENT 'When synced to server',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_mortality_type 
        FOREIGN KEY (mortality_type_id) 
        REFERENCES mortality_types(id)
        ON DELETE SET NULL,
    
    -- Indexes for common queries
    INDEX idx_status (status),
    INDEX idx_recorded_at (recorded_at),
    INDEX idx_location (latitude, longitude)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Images Table
-- ============================================
-- Stores metadata for uploaded sighting images.
-- Actual images are stored in the filesystem.
-- 
-- One-to-one relationship with sightings (each sighting has max 1 image).
-- CASCADE delete removes image record when sighting is deleted.

CREATE TABLE IF NOT EXISTS images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sighting_id INT NOT NULL UNIQUE,
    
    -- File metadata
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    file_size INT NOT NULL COMMENT 'Size in bytes',
    
    -- Timestamps
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_sighting_image 
        FOREIGN KEY (sighting_id) 
        REFERENCES sightings(id)
        ON DELETE CASCADE
        
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Sample Data (Optional)
-- ============================================
-- Uncomment to insert sample data for testing

/*
INSERT INTO sightings (client_id, latitude, longitude, location_accuracy, status, mortality_type_id, notes, recorded_at, synced_at) VALUES
    (UUID(), -25.7479, 28.2293, 10.5, 'alive', NULL, 'Adult pangolin spotted near waterhole', NOW() - INTERVAL 5 DAY, NOW()),
    (UUID(), -26.1952, 28.0344, 15.2, 'dead', 1, 'Found near electric fence perimeter', NOW() - INTERVAL 3 DAY, NOW()),
    (UUID(), -25.4358, 28.1828, 8.3, 'alive', NULL, 'Juvenile, appeared healthy', NOW() - INTERVAL 2 DAY, NOW()),
    (UUID(), -26.0274, 27.8546, 12.0, 'dead', 3, 'Found on N14 highway', NOW() - INTERVAL 1 DAY, NOW()),
    (UUID(), -25.8912, 28.3012, 5.5, 'alive', NULL, 'Foraging in termite mound', NOW(), NOW());
*/

-- ============================================
-- Useful Queries
-- ============================================

-- Count sightings by status
-- SELECT status, COUNT(*) as count FROM sightings GROUP BY status;

-- Count mortality by type
-- SELECT mt.description, COUNT(s.id) as count
-- FROM mortality_types mt
-- LEFT JOIN sightings s ON mt.id = s.mortality_type_id
-- WHERE s.status = 'dead' OR s.status IS NULL
-- GROUP BY mt.id;

-- Recent sightings with images
-- SELECT s.*, i.filename
-- FROM sightings s
-- LEFT JOIN images i ON s.id = i.sighting_id
-- ORDER BY s.recorded_at DESC
-- LIMIT 10;

-- Geographic bounds of all sightings
-- SELECT 
--     MIN(latitude) as min_lat, MAX(latitude) as max_lat,
--     MIN(longitude) as min_lng, MAX(longitude) as max_lng
-- FROM sightings;
