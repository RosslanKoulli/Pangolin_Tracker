<?php
/**
 * ZAP - Pangolin Tracker
 * Database Configuration
 * 
 * This file contains database connection settings and utility functions.
 * Update the credentials when deploying to brighton.domains.
 */

// ============================================
// Database Credentials
// ============================================
// BRIGHTON.DOMAINS DEPLOYMENT DATABASE DATA
define('DB_HOST', 'localhost');
define('DB_NAME', 'rk738_ZAP');
define('DB_USER', 'rk738');
define('DB_PASS', 'Bagmam4p');
define('DB_CHARSET', 'utf8mb4');

// ============================================
// PDO Connection
// ============================================
/**
 * Creates and returns a PDO database connection
 * Uses singleton pattern to avoid multiple connections
 * 
 * @return PDO The database connection
 * @throws PDOException If connection fails
 */
function getDatabase(): PDO {
    static $pdo = null;
    
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST,
            DB_NAME,
            DB_CHARSET
        );
        
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];
        
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }
    
    return $pdo;
}

// ============================================
// API Response Helpers
// ============================================

/**
 * Sends a JSON response with proper headers
 * 
 * @param mixed $data The data to send
 * @param int $statusCode HTTP status code
 */
function jsonResponse($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Sends a success response
 * 
 * @param mixed $data The data to return
 * @param string $message Optional message
 */
function successResponse($data = null, string $message = 'Success'): void {
    jsonResponse([
        'success' => true,
        'message' => $message,
        'data' => $data
    ]);
}

/**
 * Sends an error response
 * 
 * @param string $message Error message
 * @param int $statusCode HTTP status code
 * @param array $errors Additional error details
 */
function errorResponse(string $message, int $statusCode = 400, array $errors = []): void {
    jsonResponse([
        'success' => false,
        'message' => $message,
        'errors' => $errors
    ], $statusCode);
}

// ============================================
// Input Validation
// ============================================

/**
 * Sanitizes and validates input string
 * 
 * @param mixed $value The value to sanitize
 * @param int $maxLength Maximum allowed length
 * @return string|null Sanitized string or null
 */
function sanitizeString($value, int $maxLength = 1000): ?string {
    if ($value === null || $value === '') {
        return null;
    }
    
    $value = trim((string) $value);
    $value = htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    
    if (strlen($value) > $maxLength) {
        $value = substr($value, 0, $maxLength);
    }
    
    return $value;
}

/**
 * Validates and sanitizes a coordinate (latitude or longitude)
 * 
 * @param mixed $value The coordinate value
 * @param string $type 'lat' or 'lng'
 * @return float|null The validated coordinate or null
 */
function validateCoordinate($value, string $type = 'lat'): ?float {
    if (!is_numeric($value)) {
        return null;
    }
    
    $coord = (float) $value;
    
    if ($type === 'lat' && ($coord < -90 || $coord > 90)) {
        return null;
    }
    
    if ($type === 'lng' && ($coord < -180 || $coord > 180)) {
        return null;
    }
    
    return $coord;
}

/**
 * Validates status value
 * 
 * @param mixed $value The status value
 * @return string|null 'alive' or 'dead' or null
 */
function validateStatus($value): ?string {
    $valid = ['alive', 'dead'];
    return in_array($value, $valid, true) ? $value : null;
}

/**
 * Validates mortality type
 * 
 * @param mixed $value The mortality type code
 * @return string|null The validated code or null
 */
function validateMortalityType($value): ?string {
    $valid = ['fence_electrocution', 'fence_non_electric', 'road_death', 'other'];
    return in_array($value, $valid, true) ? $value : null;
}

// ============================================
// CORS Handling
// ============================================

/**
 * Handle CORS preflight request
 */
function handleCors(): void {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ============================================
// File Upload Handling
// ============================================

// Upload directory (relative to server root)
define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('MAX_FILE_SIZE', 5 * 1024 * 1024); // 5MB
define('ALLOWED_TYPES', ['image/jpeg', 'image/png', 'image/webp']);

/**
 * Handles image file upload
 * 
 * @param array $file The $_FILES entry
 * @param string $clientId The sighting's client ID
 * @return string|null The filename or null on failure
 */
function handleImageUpload(array $file, string $clientId): ?string {
    // Check for upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    
    // Validate file size
    if ($file['size'] > MAX_FILE_SIZE) {
        return null;
    }
    
    // Validate MIME type
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    
    if (!in_array($mimeType, ALLOWED_TYPES, true)) {
        return null;
    }
    
    // Generate filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'jpg';
    $filename = $clientId . '.' . $extension;
    
    // Ensure upload directory exists
    if (!is_dir(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }
    
    // Move uploaded file
    $destination = UPLOAD_DIR . $filename;
    
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        return null;
    }
    
    return $filename;
}

/**
 * Gets the public URL for an uploaded image
 * 
 * @param string $filename The image filename
 * @return string The public URL
 */
function getImageUrl(string $filename): string {
    // Adjust this based on your server configuration
    $baseUrl = '/server/uploads/';
    return $baseUrl . $filename;
}

// Handle CORS for all API requests
handleCors();
