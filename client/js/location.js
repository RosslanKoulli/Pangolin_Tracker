/**
 * ZAP - Pangolin Tracker
 * Geolocation Module
 * 
 * This module handles all geolocation functionality for the app,
 * implementing the Geolocation API with proper error handling
 * and user feedback.
 * 
 * Design Considerations:
 * - GPS accuracy is crucial for conservation research
 * - Remote areas may have poor GPS signal
 * - User privacy must be respected (permissions)
 * - Battery consumption should be minimized
 * 
 * The module provides both one-shot position requests and
 * continuous watching (for future enhancements).
 */

const Location = (function() {
    // ============================================
    // Private State
    // ============================================
    
    let currentPosition = null;
    let watchId = null;
    let isAcquiring = false;
    
    // Callbacks for position updates
    const listeners = new Set();
    
    // ============================================
    // Core Functions
    // ============================================
    
    /**
     * Gets the current position as a one-shot request
     * Uses high accuracy mode for GPS-quality coordinates
     * 
     * @param {Object} options - Override default options
     * @returns {Promise<GeolocationPosition>} The position object
     */
    async function getCurrentPosition(options = {}) {
        // Check if Geolocation API is available
        if (!navigator.geolocation) {
            throw new LocationError(
                'Geolocation is not supported by this browser',
                'NOT_SUPPORTED'
            );
        }
        
        isAcquiring = true;
        notifyListeners({ status: 'acquiring' });
        
        const positionOptions = {
            enableHighAccuracy: Config.LOCATION.HIGH_ACCURACY,
            timeout: Config.LOCATION.TIMEOUT,
            maximumAge: Config.LOCATION.MAXIMUM_AGE,
            ...options
        };
        
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    isAcquiring = false;
                    currentPosition = position;
                    
                    Config.debug('Location', 
                        `Position acquired: ${position.coords.latitude.toFixed(6)}, ` +
                        `${position.coords.longitude.toFixed(6)} ` +
                        `(±${position.coords.accuracy.toFixed(0)}m)`
                    );
                    
                    notifyListeners({
                        status: 'acquired',
                        position: position
                    });
                    
                    resolve(position);
                },
                (error) => {
                    isAcquiring = false;
                    
                    const locationError = translateGeolocationError(error);
                    Config.debug('Location', 'Error:', locationError.message);
                    
                    notifyListeners({
                        status: 'error',
                        error: locationError
                    });
                    
                    reject(locationError);
                },
                positionOptions
            );
        });
    }
    
    /**
     * Starts watching position for continuous updates
     * Useful for tracking or if we add a "find me" feature
     * 
     * @param {Function} callback - Called on each position update
     * @param {Object} options - Override default options
     * @returns {number} The watch ID for clearing
     */
    function watchPosition(callback, options = {}) {
        if (!navigator.geolocation) {
            throw new LocationError(
                'Geolocation is not supported by this browser',
                'NOT_SUPPORTED'
            );
        }
        
        // Clear any existing watch
        if (watchId !== null) {
            clearWatch();
        }
        
        const positionOptions = {
            enableHighAccuracy: Config.LOCATION.HIGH_ACCURACY,
            timeout: Config.LOCATION.TIMEOUT,
            maximumAge: 0, // Always get fresh position for watch
            ...options
        };
        
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                currentPosition = position;
                callback(position, null);
            },
            (error) => {
                callback(null, translateGeolocationError(error));
            },
            positionOptions
        );
        
        Config.debug('Location', 'Started watching position');
        return watchId;
    }
    
    /**
     * Stops watching position
     */
    function clearWatch() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            Config.debug('Location', 'Stopped watching position');
        }
    }
    
    // ============================================
    // Error Handling
    // ============================================
    
    /**
     * Custom error class for location errors
     */
    class LocationError extends Error {
        constructor(message, code) {
            super(message);
            this.name = 'LocationError';
            this.code = code;
        }
    }
    
    /**
     * Translates browser GeolocationPositionError to our LocationError
     * Provides more user-friendly error messages
     * 
     * @param {GeolocationPositionError} error - The browser error
     * @returns {LocationError} Our custom error
     */
    function translateGeolocationError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return new LocationError(
                    'Location permission denied. Please enable location services in your browser settings.',
                    'PERMISSION_DENIED'
                );
                
            case error.POSITION_UNAVAILABLE:
                return new LocationError(
                    'Unable to determine your location. Please check your GPS settings.',
                    'POSITION_UNAVAILABLE'
                );
                
            case error.TIMEOUT:
                return new LocationError(
                    'Location request timed out. Please try again.',
                    'TIMEOUT'
                );
                
            default:
                return new LocationError(
                    'An unknown error occurred while getting your location.',
                    'UNKNOWN'
                );
        }
    }
    
    // ============================================
    // Permission Handling
    // ============================================
    
    /**
     * Checks the current geolocation permission status
     * Uses the Permissions API where available
     * 
     * @returns {Promise<string>} 'granted', 'denied', or 'prompt'
     */
    async function checkPermission() {
        // Permissions API not universally supported
        if (!navigator.permissions) {
            return 'prompt'; // Assume we need to ask
        }
        
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            
            Config.debug('Location', 'Permission status:', result.state);
            
            // Listen for permission changes
            result.addEventListener('change', () => {
                Config.debug('Location', 'Permission changed to:', result.state);
                notifyListeners({ status: 'permission_changed', permission: result.state });
            });
            
            return result.state;
        } catch (error) {
            // Permissions API failed, assume we need to prompt
            Config.debug('Location', 'Permission check failed:', error);
            return 'prompt';
        }
    }
    
    /**
     * Requests location permission by attempting to get position
     * This is the only reliable way to trigger the permission prompt
     * 
     * @returns {Promise<boolean>} True if permission granted
     */
    async function requestPermission() {
        try {
            await getCurrentPosition({ timeout: 5000 });
            return true;
        } catch (error) {
            return error.code !== 'PERMISSION_DENIED';
        }
    }
    
    // ============================================
    // Utility Functions
    // ============================================
    
    /**
     * Formats coordinates for display
     * 
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} accuracy - Accuracy in meters
     * @returns {string} Formatted string
     */
    function formatCoordinates(lat, lng, accuracy = null) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lngDir = lng >= 0 ? 'E' : 'W';
        
        let formatted = `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lng).toFixed(5)}°${lngDir}`;
        
        if (accuracy !== null) {
            formatted += ` (±${accuracy.toFixed(0)}m)`;
        }
        
        return formatted;
    }
    
    /**
     * Formats coordinates for short display (2 decimal places)
     */
    function formatCoordinatesShort(lat, lng) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lngDir = lng >= 0 ? 'E' : 'W';
        
        return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lng).toFixed(2)}°${lngDir}`;
    }
    
    /**
     * Calculates distance between two points using Haversine formula
     * 
     * @param {number} lat1 - First point latitude
     * @param {number} lng1 - First point longitude
     * @param {number} lat2 - Second point latitude
     * @param {number} lng2 - Second point longitude
     * @returns {number} Distance in kilometers
     */
    function calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }
    
    function toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    
    /**
     * Formats distance for display
     * 
     * @param {number} km - Distance in kilometers
     * @returns {string} Formatted distance
     */
    function formatDistance(km) {
        if (km < 1) {
            return `${Math.round(km * 1000)}m`;
        }
        return `${km.toFixed(1)}km`;
    }
    
    // ============================================
    // Event System
    // ============================================
    
    /**
     * Registers a listener for position updates
     * 
     * @param {Function} callback - The callback function
     */
    function addListener(callback) {
        listeners.add(callback);
    }
    
    /**
     * Removes a position update listener
     * 
     * @param {Function} callback - The callback to remove
     */
    function removeListener(callback) {
        listeners.delete(callback);
    }
    
    /**
     * Notifies all listeners of a position update
     * 
     * @param {Object} data - The update data
     */
    function notifyListeners(data) {
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Location listener error:', error);
            }
        });
    }
    
    // ============================================
    // Public API
    // ============================================
    return {
        // Core functions
        getCurrentPosition,
        watchPosition,
        clearWatch,
        
        // Permission
        checkPermission,
        requestPermission,
        
        // State
        get currentPosition() { return currentPosition; },
        get isAcquiring() { return isAcquiring; },
        get isSupported() { return !!navigator.geolocation; },
        
        // Formatting utilities
        formatCoordinates,
        formatCoordinatesShort,
        calculateDistance,
        formatDistance,
        
        // Events
        addListener,
        removeListener,
        
        // Error class
        LocationError
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Location;
}
