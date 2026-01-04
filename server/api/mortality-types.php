<?php
/**
 * ZAP - Pangolin Tracker
 * Mortality Types API Endpoint
 * 
 * Returns the list of mortality type options for the frontend.
 * This is reference data that rarely changes.
 */

require_once __DIR__ . '/../config/database.php';

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

try {
    $db = getDatabase();
    
    $stmt = $db->query("
        SELECT id, code, description 
        FROM mortality_types 
        ORDER BY id
    ");
    
    $types = $stmt->fetchAll();
    
    // Add icons (matching frontend config)
    $icons = [
        'fence_electrocution' => '<img src="icons/ElectrocutionSign.png" alt="" class="inline-icon">',
        'fence_non_electric' => '<img src="icons/ChainFence.png" alt="" class="inline-icon">',
        'road_death' => '<img src="icons/Road Accident.png" alt="" class="inline-icon">',
        'other' => '<img src="icons/Question_Mark.png" alt="" class="inline-icon">'
    ];
    
    $types = array_map(function($type) use ($icons) {
        return [
            'id' => (int) $type['id'],
            'code' => $type['code'],
            'description' => $type['description'],
            'icon' => $icons[$type['code']] ?? '<img src="icons/Question_Mark.png" alt="" class="inline-icon">'
        ];
    }, $types);
    
    successResponse($types);
    
} catch (PDOException $e) {
    error_log('Mortality types error: ' . $e->getMessage());
    errorResponse('Database error', 500);
}
