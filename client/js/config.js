/**
 * ZAP - Pangolin Tracker
 * Configuration Module
 *
 * This module centralizes all application configuration settings,
 * making it easy to modify API endpoints, feature flags, and
 * default values without searching through the codebase.
 * 
 * Architecture Decision: Using a frozen object pattern ensures
 * configuration immutability at runtime, preventing accidental
 * modification and improving debugging predictability.
 */

const Config = Object.freeze({
    // ============================================
    // API Configuration
    // ============================================
    API: Object.freeze({
        // Base URL for the REST API
        // Change this when deploying to brighton.domains
        DEMO_MODE: false,
        BASE_URL: '/ci609/assignment1/server/api',
        
        // Individual endpoint paths
        ENDPOINTS: Object.freeze({
            SIGHTINGS: '/sightings.php',
            IMAGES: '/images.php',
            ANALYTICS: '/analytics.php',
            MORTALITY_TYPES: '/mortality-types.php',
            SYNC: '/sync.php'
        }),
        
        // Request timeout in milliseconds
        TIMEOUT: 30000,
        
        // Maximum retries for failed requests
        MAX_RETRIES: 3,
        
        // Delay between retries (uses exponential backoff)
        RETRY_DELAY: 1000
    }),
    
    // ============================================
    // IndexedDB Configuration
    // ============================================
    DATABASE: Object.freeze({
        NAME: 'zap-pangolin-db',
        VERSION: 1,
        
        // Object store names
        STORES: Object.freeze({
            SIGHTINGS: 'sightings',
            PENDING_SYNC: 'pending_sync',
            CACHED_IMAGES: 'cached_images',
            METADATA: 'metadata'
        })
    }),
    
    // ============================================
    // Geolocation Configuration
    // ============================================
    LOCATION: Object.freeze({
        // High accuracy uses GPS, which is slower but more precise
        HIGH_ACCURACY: true,
        
        // Maximum time to wait for location (ms)
        TIMEOUT: 15000,
        
        // Maximum age of cached position (ms)
        // 0 = always get fresh location
        MAXIMUM_AGE: 0,
        
        // Default coordinates (Africa) if geolocation fails
        // Used only for map display, not for data recording
        DEFAULT_LAT: -26.2041,
        DEFAULT_LNG: 28.0473,
        DEFAULT_ZOOM: 6
    }),
    
    // ============================================
    // Image Configuration
    // ============================================
    IMAGE: Object.freeze({
        // Maximum image dimension (width or height)
        // Images larger than this will be resized
        MAX_DIMENSION: 1200,
        
        // JPEG quality (0-1) for compressed images
        QUALITY: 0.8,
        
        // Maximum file size in bytes (5MB)
        MAX_SIZE: 5 * 1024 * 1024,
        
        // Accepted MIME types
        ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
        
        // Placeholder for sightings without images
        PLACEHOLDER: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5ZTllOWUiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIvPjxjaXJjbGUgY3g9IjguNSIgY3k9IjguNSIgcj0iMS41Ii8+PHBhdGggZD0ibTIxIDE1LTUtNUw1IDIxIi8+PC9zdmc+'
    }),
    
    // ============================================
    // Sync Configuration
    // ============================================
    SYNC: Object.freeze({
        // How often to check for pending syncs (ms)
        CHECK_INTERVAL: 30000,
        
        // Minimum time between sync attempts (ms)
        MIN_SYNC_INTERVAL: 5000,
        
        // Background sync tag (for Service Worker)
        TAG: 'zap-sync-sightings'
    }),
    
    // ============================================
    // UI Configuration
    // ============================================
    UI: Object.freeze({
        // Toast notification duration (ms)
        TOAST_DURATION: 4000,
        
        // Maximum notes length
        MAX_NOTES_LENGTH: 1000,
        
        // Debounce delay for form inputs (ms)
        DEBOUNCE_DELAY: 300,
        
        // Animation durations (ms)
        ANIMATION: Object.freeze({
            FAST: 150,
            NORMAL: 250,
            SLOW: 350
        })
    }),
    
    // ============================================
    // Mortality Types (static reference data)
    // ============================================
    MORTALITY_TYPES: Object.freeze([
        { id: 1, code: 'fence_electrocution', description: 'Fence death: electrocution', icon: '<img src="icons/ElectrocutionSign.png" alt="" class="inline-icon">' },
        { id: 2, code: 'fence_non_electric', description: 'Fence death: caught on non-electrified fence', icon: '<img src="icons/ChainFence.png" alt="" class="inline-icon">' },
        { id: 3, code: 'road_death', description: 'Road death', icon: '<img src="icons/Road Accident.png" alt="" class="inline-icon">' },
        { id: 4, code: 'other', description: 'Other', icon: '<img src="icons/Question Mark.png" alt="" class="inline-icon">' }
    ]),
    
    // ============================================
    // Feature Flags
    // ============================================
    FEATURES: Object.freeze({
        // Enable offline mode (Service Worker + IndexedDB)
        OFFLINE_MODE: true,
        
        // Enable background sync API
        BACKGROUND_SYNC: true,
        
        // Enable push notifications (future feature)
        PUSH_NOTIFICATIONS: false,
        
        // Enable debug logging
        DEBUG: true
    }),
    
    // ============================================
    // Helper Methods
    // ============================================
    
    /**
     * Constructs the full API URL for an endpoint
     * @param {string} endpoint - The endpoint key from ENDPOINTS
     * @returns {string} The full API URL
     */
    getApiUrl(endpoint) {
        const path = this.API.ENDPOINTS[endpoint];
        if (!path) {
            throw new Error(`Unknown API endpoint: ${endpoint}`);
        }
        return `${this.API.BASE_URL}${path}`;
    },
    
    /**
     * Gets mortality type by code
     * @param {string} code - The mortality type code
     * @returns {Object|undefined} The mortality type object
     */
    getMortalityType(code) {
        return this.MORTALITY_TYPES.find(type => type.code === code);
    },
    
    /**
     * Logs debug messages if debug mode is enabled
     * @param {string} module - The module name
     * @param {string} message - The log message
     * @param {...any} args - Additional arguments
     */
    debug(module, message, ...args) {
        if (this.FEATURES.DEBUG) {
            console.log(`[ZAP:${module}] ${message}`, ...args);
        }
    }
});

// Export for module usage (if using ES modules in future)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}
