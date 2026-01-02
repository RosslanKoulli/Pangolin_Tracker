<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../config/database.php';

echo "Testing POST to sightings...<br>";

// Simulate a sighting submission
$clientId = 'test-' . uniqid();
$latitude = -25.7479;
$longitude = 28.2293;
$locationAccuracy = 10.5;
$status = 'alive';
$mortalityTypeId = null;
$notes = 'Test sighting from post-test.php';
$recordedAt = date('Y-m-d H:i:s');

try {
    $db = getDatabase();
    
    // This INSERT must match exactly: 8 columns, 8 placeholders (plus NOW())
    $stmt = $db->prepare("
        INSERT INTO sightings (
            client_id, latitude, longitude, location_accuracy,
            status, mortality_type_id, notes, recorded_at, synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ");
    
    $stmt->execute([
        $clientId,           // 1
        $latitude,           // 2
        $longitude,          // 3
        $locationAccuracy,   // 4
        $status,             // 5
        $mortalityTypeId,    // 6
        $notes,              // 7
        $recordedAt          // 8
    ]);
    
    $insertedId = $db->lastInsertId();
    echo "SUCCESS! Inserted with ID: " . $insertedId . "<br>";
    echo "Client ID: " . $clientId . "<br>";
    
    // Verify by fetching it back
    $stmt = $db->prepare("SELECT * FROM sightings WHERE id = ?");
    $stmt->execute([$insertedId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo "<br>Inserted record:<br>";
    echo "<pre>" . print_r($row, true) . "</pre>";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
