<?php

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Step 1: PHP is working<br>";

require_once __DIR__ . '/../config/database.php';
echo "Step 2: database.php loaded<br>";

try {
    $db = getDatabase();
    echo "Step 3: Database connected!<br>";

    $result = $db->query("SELECT COUNT(*) FROM sightings");
    echo "Step 4: Query works! Count: " . $result->fetchColumn();
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
?>