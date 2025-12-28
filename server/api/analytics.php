<?php
/**
 * ZAP - Pangolin Tracker
 * Analytics API Endpoint
 * 
 * Provides aggregated statistics and data for the analytics dashboard.
 * 
 * Endpoints:
 * GET /api/analytics.php?type=summary   - Overview statistics
 * GET /api/analytics.php?type=mortality - Mortality breakdown
 * GET /api/analytics.php?type=locations - Location data for map
 * GET /api/analytics.php?type=trends    - Time-based trends
 */

require_once __DIR__ . '/../config/database.php';

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$type = $_GET['type'] ?? 'summary';

try {
    $db = getDatabase();
    
    switch ($type) {
        case 'summary':
            getSummary($db);
            break;
        case 'mortality':
            getMortalityBreakdown($db);
            break;
        case 'locations':
            getLocations($db);
            break;
        case 'trends':
            getTrends($db);
            break;
        default:
            errorResponse('Invalid analytics type', 400);
    }
} catch (PDOException $e) {
    error_log('Analytics error: ' . $e->getMessage());
    errorResponse('Database error', 500);
}

// ============================================
// Summary Statistics
// ============================================
function getSummary(PDO $db): void {
    // Total count
    $total = $db->query("SELECT COUNT(*) FROM sightings")->fetchColumn();
    
    // Count by status
    $stmt = $db->query("
        SELECT status, COUNT(*) as count 
        FROM sightings 
        GROUP BY status
    ");
    $statusCounts = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    // Count from last 7 days
    $recent = $db->query("
        SELECT COUNT(*) FROM sightings 
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ")->fetchColumn();
    
    // Count from last 30 days
    $monthly = $db->query("
        SELECT COUNT(*) FROM sightings 
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    ")->fetchColumn();
    
    // Average per day (last 30 days)
    $avgPerDay = round($monthly / 30, 1);
    
    // Most common mortality type
    $topMortality = $db->query("
        SELECT mt.description, COUNT(*) as count
        FROM sightings s
        JOIN mortality_types mt ON s.mortality_type_id = mt.id
        WHERE s.status = 'dead'
        GROUP BY s.mortality_type_id
        ORDER BY count DESC
        LIMIT 1
    ")->fetch();
    
    successResponse([
        'total' => (int) $total,
        'alive' => (int) ($statusCounts['alive'] ?? 0),
        'dead' => (int) ($statusCounts['dead'] ?? 0),
        'recent' => (int) $recent,
        'monthly' => (int) $monthly,
        'average_per_day' => $avgPerDay,
        'top_mortality_cause' => $topMortality ? $topMortality['description'] : null
    ]);
}

// ============================================
// Mortality Breakdown
// ============================================
function getMortalityBreakdown(PDO $db): void {
    $stmt = $db->query("
        SELECT 
            mt.code,
            mt.description,
            COUNT(s.id) as count,
            ROUND(COUNT(s.id) * 100.0 / NULLIF(
                (SELECT COUNT(*) FROM sightings WHERE status = 'dead'), 0
            ), 1) as percentage
        FROM mortality_types mt
        LEFT JOIN sightings s ON mt.id = s.mortality_type_id AND s.status = 'dead'
        GROUP BY mt.id, mt.code, mt.description
        ORDER BY count DESC
    ");
    
    successResponse($stmt->fetchAll());
}

// ============================================
// Location Data
// ============================================
function getLocations(PDO $db): void {
    $stmt = $db->query("
        SELECT 
            latitude as lat,
            longitude as lng,
            status,
            recorded_at
        FROM sightings
        ORDER BY recorded_at DESC
        LIMIT 1000
    ");
    
    $locations = $stmt->fetchAll();
    
    // Convert to proper types
    $locations = array_map(function($loc) {
        return [
            'lat' => (float) $loc['lat'],
            'lng' => (float) $loc['lng'],
            'status' => $loc['status'],
            'recorded_at' => $loc['recorded_at']
        ];
    }, $locations);
    
    successResponse($locations);
}

// ============================================
// Time-based Trends
// ============================================
function getTrends(PDO $db): void {
    $period = $_GET['period'] ?? '30days';
    
    $intervals = [
        '7days' => ['7 DAY', 'DATE(recorded_at)', 'day'],
        '30days' => ['30 DAY', 'DATE(recorded_at)', 'day'],
        '12months' => ['12 MONTH', 'DATE_FORMAT(recorded_at, "%Y-%m")', 'month']
    ];
    
    if (!isset($intervals[$period])) {
        $period = '30days';
    }
    
    [$interval, $groupBy, $label] = $intervals[$period];
    
    // Sightings over time
    $stmt = $db->query("
        SELECT 
            {$groupBy} as period,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'alive' THEN 1 ELSE 0 END) as alive,
            SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) as dead
        FROM sightings
        WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL {$interval})
        GROUP BY {$groupBy}
        ORDER BY period ASC
    ");
    
    $trends = $stmt->fetchAll();
    
    // Convert counts to integers
    $trends = array_map(function($row) {
        return [
            'period' => $row['period'],
            'total' => (int) $row['total'],
            'alive' => (int) $row['alive'],
            'dead' => (int) $row['dead']
        ];
    }, $trends);
    
    successResponse([
        'period_type' => $label,
        'data' => $trends
    ]);
}
