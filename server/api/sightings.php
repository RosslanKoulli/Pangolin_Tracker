<?php
/**
 * ZAP - Pangolin Tracker
 * Sightings API Endpoint
 * 
 * This is the main REST API endpoint for managing pangolin sightings.
 * 
 * Endpoints:
 * GET    /api/sightings.php          - List all sightings
 * GET    /api/sightings.php?id=X     - Get single sighting
 * POST   /api/sightings.php          - Create new sighting
 * PUT    /api/sightings.php          - Update sighting
 * DELETE /api/sightings.php?id=X     - Delete sighting
 */

require_once __DIR__ . '/../config/database.php';

// Route to appropriate handler based on HTTP method
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            handleGet();
            break;
        case 'POST':
            handlePost();
            break;
        case 'PUT':
            handlePut();
            break;
        case 'DELETE':
            handleDelete();
            break;
        default:
            errorResponse('Method not allowed', 405);
    }
} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error', 500);
} catch (Exception $e) {
    error_log('Server error: ' . $e->getMessage());
    errorResponse('Server error', 500);
}

// ============================================
// GET Handler
// ============================================
function handleGet(): void {
    $db = getDatabase();
    
    // Check if getting single sighting
    if (isset($_GET['id'])) {
        getSingle($db, (int) $_GET['id']);
        return;
    }
    
    // Health check
    if (isset($_GET['health'])) {
        successResponse(['status' => 'healthy']);
        return;
    }
    
    // List all sightings with optional filters
    getList($db);
}

/**
 * Get a single sighting by ID
 */
function getSingle(PDO $db, int $id): void {
    $stmt = $db->prepare("
        SELECT 
            s.*,
            mt.code as mortality_type_code,
            mt.description as mortality_type_description,
            i.filename as image_filename
        FROM sightings s
        LEFT JOIN mortality_types mt ON s.mortality_type_id = mt.id
        LEFT JOIN images i ON s.id = i.sighting_id
        WHERE s.id = ?
    ");
    
    $stmt->execute([$id]);
    $sighting = $stmt->fetch();
    
    if (!$sighting) {
        errorResponse('Sighting not found', 404);
    }
    
    successResponse(formatSighting($sighting));
}

/**
 * Get list of sightings with filters
 */
function getList(PDO $db): void {
    $where = [];
    $params = [];
    
    // Status filter
    if (isset($_GET['status']) && in_array($_GET['status'], ['alive', 'dead'])) {
        $where[] = 's.status = ?';
        $params[] = $_GET['status'];
    }
    
    // Date range filter
    if (isset($_GET['from'])) {
        $where[] = 's.recorded_at >= ?';
        $params[] = $_GET['from'];
    }
    
    if (isset($_GET['to'])) {
        $where[] = 's.recorded_at <= ?';
        $params[] = $_GET['to'];
    }
    
    // Build query
    $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
    
    $sql = "
        SELECT 
            s.*,
            mt.code as mortality_type_code,
            mt.description as mortality_type_description,
            i.filename as image_filename
        FROM sightings s
        LEFT JOIN mortality_types mt ON s.mortality_type_id = mt.id
        LEFT JOIN images i ON s.id = i.sighting_id
        {$whereClause}
        ORDER BY s.recorded_at DESC
        LIMIT 500
    ";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    $sightings = array_map('formatSighting', $stmt->fetchAll());
    
    successResponse($sightings);
}

/**
 * Format a sighting for API response
 */
function formatSighting(array $row): array {
    return [
        'id' => (int) $row['id'],
        'client_id' => $row['client_id'],
        'latitude' => (float) $row['latitude'],
        'longitude' => (float) $row['longitude'],
        'location_accuracy' => $row['location_accuracy'] ? (float) $row['location_accuracy'] : null,
        'status' => $row['status'],
        'mortality_type' => $row['mortality_type_code'] ?? null,
        'mortality_description' => $row['mortality_type_description'] ?? null,
        'notes' => $row['notes'],
        'image_url' => $row['image_filename'] ? getImageUrl($row['image_filename']) : null,
        // Format timestamps as ISO 8601 with UTC indicator for consistent parsing
        'recorded_at' => formatTimestamp($row['recorded_at']),
        'synced_at' => formatTimestamp($row['synced_at']),
        'created_at' => formatTimestamp($row['created_at'])
    ];
}

// ============================================
// POST Handler
// ============================================
function handlePost(): void {
    $db = getDatabase();
    
    // Parse JSON data from form field
    $jsonData = $_POST['data'] ?? null;
    
    if (!$jsonData) {
        // Try reading raw JSON body
        $jsonData = file_get_contents('php://input');
    }
    
    $data = json_decode($jsonData, true);
    
    if (!$data) {
        errorResponse('Invalid JSON data', 400);
    }
    
    // Validate required fields
    $errors = [];
    
    $clientId = sanitizeString($data['client_id'] ?? null, 36);
    if (!$clientId) {
        $errors['client_id'] = 'Client ID is required';
    }
    
    $latitude = validateCoordinate($data['latitude'] ?? null, 'lat');
    if ($latitude === null) {
        $errors['latitude'] = 'Valid latitude is required';
    }
    
    $longitude = validateCoordinate($data['longitude'] ?? null, 'lng');
    if ($longitude === null) {
        $errors['longitude'] = 'Valid longitude is required';
    }
    
    $status = validateStatus($data['status'] ?? null);
    if (!$status) {
        $errors['status'] = 'Valid status (alive/dead) is required';
    }
    
    // Mortality type is required if dead
    $mortalityType = null;
    if ($status === 'dead') {
        $mortalityType = validateMortalityType($data['mortality_type'] ?? null);
        if (!$mortalityType) {
            $errors['mortality_type'] = 'Mortality type is required when status is dead';
        }
    }
    
    if (count($errors) > 0) {
        errorResponse('Validation failed', 400, $errors);
    }
    
    // Optional fields
    $locationAccuracy = is_numeric($data['location_accuracy'] ?? null) 
        ? (float) $data['location_accuracy'] 
        : null;
    $notes = sanitizeString($data['notes'] ?? null, 1000);
    
    // Parse recorded_at - convert ISO 8601 to MySQL datetime format
    $recordedAt = date('Y-m-d H:i:s'); // Default to now
    if (!empty($data['recorded_at'])) {
        try {
            $dt = new DateTime($data['recorded_at']);
            $recordedAt = $dt->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            error_log('Invalid recorded_at format: ' . $data['recorded_at']);
            // Keep default
        }
    }
    
    // Get mortality type ID if provided
    $mortalityTypeId = null;
    if ($mortalityType) {
        $stmt = $db->prepare("SELECT id FROM mortality_types WHERE code = ?");
        $stmt->execute([$mortalityType]);
        $mortalityTypeId = $stmt->fetchColumn();
    }
    
    // Check for duplicate client_id
    $stmt = $db->prepare("SELECT id FROM sightings WHERE client_id = ?");
    $stmt->execute([$clientId]);
    $existingId = $stmt->fetchColumn();
    
    if ($existingId) {
        // Return existing sighting (idempotent)
        getSingle($db, (int) $existingId);
        return;
    }
    
    // Insert sighting
    $stmt = $db->prepare("
        INSERT INTO sightings (
            client_id, latitude, longitude, location_accuracy,
            status, mortality_type_id, notes, recorded_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ");
    
    $stmt->execute([
        $clientId,
        $latitude,
        $longitude,
        $locationAccuracy,
        $status,
        $mortalityTypeId,
        $notes,
        $recordedAt
    ]);
    
    $sightingId = (int) $db->lastInsertId();
    
    // Handle image upload
    if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $filename = handleImageUpload($_FILES['image'], $clientId);
        
        if ($filename) {
            $stmt = $db->prepare("
                INSERT INTO images (sighting_id, filename, mime_type, file_size)
                VALUES (?, ?, ?, ?)
            ");
            
            $finfo = new finfo(FILEINFO_MIME_TYPE);
            $mimeType = $finfo->file(UPLOAD_DIR . $filename);
            $fileSize = filesize(UPLOAD_DIR . $filename);
            
            $stmt->execute([$sightingId, $filename, $mimeType, $fileSize]);
        }
    }
    
    // Return created sighting
    getSingle($db, $sightingId);
}

// ============================================
// PUT Handler
// ============================================
function handlePut(): void {
    $db = getDatabase();
    
    // Parse JSON body
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data || !isset($data['id'])) {
        errorResponse('Invalid data or missing ID', 400);
    }
    
    $id = (int) $data['id'];
    
    // Check if sighting exists
    $stmt = $db->prepare("SELECT id FROM sightings WHERE id = ?");
    $stmt->execute([$id]);
    
    if (!$stmt->fetchColumn()) {
        errorResponse('Sighting not found', 404);
    }
    
    // Build update query dynamically
    $updates = [];
    $params = [];
    
    if (isset($data['status'])) {
        $status = validateStatus($data['status']);
        if ($status) {
            $updates[] = 'status = ?';
            $params[] = $status;
        }
    }
    
    if (isset($data['notes'])) {
        $updates[] = 'notes = ?';
        $params[] = sanitizeString($data['notes'], 1000);
    }
    
    if (isset($data['mortality_type'])) {
        $mortalityType = validateMortalityType($data['mortality_type']);
        if ($mortalityType) {
            $stmt = $db->prepare("SELECT id FROM mortality_types WHERE code = ?");
            $stmt->execute([$mortalityType]);
            $updates[] = 'mortality_type_id = ?';
            $params[] = $stmt->fetchColumn();
        }
    }
    
    if (count($updates) === 0) {
        errorResponse('No valid fields to update', 400);
    }
    
    $params[] = $id;
    
    $sql = "UPDATE sightings SET " . implode(', ', $updates) . " WHERE id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    // Return updated sighting
    getSingle($db, $id);
}

// ============================================
// DELETE Handler
// ============================================
function handleDelete(): void {
    if (!isset($_GET['id'])) {
        errorResponse('Missing ID parameter', 400);
    }
    
    $db = getDatabase();
    $id = (int) $_GET['id'];
    
    // Get sighting info for cleanup
    $stmt = $db->prepare("
        SELECT s.client_id, i.filename 
        FROM sightings s 
        LEFT JOIN images i ON s.id = i.sighting_id 
        WHERE s.id = ?
    ");
    $stmt->execute([$id]);
    $sighting = $stmt->fetch();
    
    if (!$sighting) {
        errorResponse('Sighting not found', 404);
    }
    
    // Delete image file if exists
    if ($sighting['filename']) {
        $filepath = UPLOAD_DIR . $sighting['filename'];
        if (file_exists($filepath)) {
            unlink($filepath);
        }
    }
    
    // Delete from database (images deleted via CASCADE)
    $stmt = $db->prepare("DELETE FROM sightings WHERE id = ?");
    $stmt->execute([$id]);
    
    successResponse(null, 'Sighting deleted');
}
