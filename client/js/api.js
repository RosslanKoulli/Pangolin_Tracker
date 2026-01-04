/**
 * ZAP - Pangolin Tracker
 * API Module
 * 
 * This module handles all communication with the REST API server.
 * It implements:
 * - Automatic retry with exponential backoff
 * - Offline detection and queuing
 * - Request/response transformation
 * - Error handling and normalization
 * 
 * Architecture Decision:
 * The API module acts as a facade, abstracting network complexity
 * from the rest of the application. Components don't need to know
 * about retries, offline states, or error normalization.
 */

const API = (function() {
    // ============================================
    // Private State
    // ============================================
    
    let isOnline = navigator.onLine;
    
    // Track network status
    window.addEventListener('online', () => {
        isOnline = true;
        Config.debug('API', 'Network status: Online');
        document.dispatchEvent(new CustomEvent('app:online'));
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        Config.debug('API', 'Network status: Offline');
        document.dispatchEvent(new CustomEvent('app:offline'));
    });
    
    // ============================================
    // Core Request Function
    // ============================================
    
    /**
     * Makes an HTTP request with automatic retry logic
     * 
     * @param {string} url - The URL to request
     * @param {Object} options - Fetch options
     * @param {number} retryCount - Current retry attempt (internal use)
     * @returns {Promise<Object>} The response data
     */
    async function request(url, options = {}, retryCount = 0) {
        // Check online status first
        if (!isOnline) {
            throw new APIError('No network connection', 'OFFLINE');
        }
        
        // Set default headers
        const headers = {
            'Accept': 'application/json',
            ...options.headers
        };
        
        // Don't set Content-Type for FormData (browser sets boundary)
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        
        const fetchOptions = {
            ...options,
            headers
        };
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), Config.API.TIMEOUT);
        fetchOptions.signal = controller.signal;
        
        try {
            Config.debug('API', `${options.method || 'GET'} ${url}`);
            
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);
            
            // Parse response
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            // Handle HTTP errors
            if (!response.ok) {
                throw new APIError(
                    data.message || `HTTP ${response.status}`,
                    'HTTP_ERROR',
                    response.status,
                    data
                );
            }
            
            return data;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Handle abort (timeout)
            if (error.name === 'AbortError') {
                throw new APIError('Request timed out', 'TIMEOUT');
            }
            
            // Handle network errors with retry
            if (error instanceof TypeError || error.code === 'OFFLINE') {
                if (retryCount < Config.API.MAX_RETRIES) {
                    const delay = Config.API.RETRY_DELAY * Math.pow(2, retryCount);
                    Config.debug('API', `Retry ${retryCount + 1} in ${delay}ms`);
                    
                    await sleep(delay);
                    return request(url, options, retryCount + 1);
                }
                
                throw new APIError('Network error after retries', 'NETWORK_ERROR');
            }
            
            // Re-throw API errors as-is
            if (error instanceof APIError) {
                throw error;
            }
            
            // Wrap unknown errors
            throw new APIError(error.message, 'UNKNOWN_ERROR');
        }
    }
    
    /**
     * Custom error class for API-related errors
     */
    class APIError extends Error {
        constructor(message, code, status = null, data = null) {
            super(message);
            this.name = 'APIError';
            this.code = code;
            this.status = status;
            this.data = data;
        }
    }
    
    /**
     * Helper function to sleep for a duration
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // ============================================
    // Sightings API
    // ============================================
    
    /**
     * Fetches all sightings from the server
     * 
     * @param {Object} params - Query parameters
     * @returns {Promise<Array>} Array of sighting objects
     */
    async function getSightings(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `${Config.getApiUrl('SIGHTINGS')}${queryString ? '?' + queryString : ''}`;
        
        const response = await request(url);
        return response.data || [];
    }
    
    /**
     * Fetches a single sighting by ID
     * 
     * @param {number} id - The server-side sighting ID
     * @returns {Promise<Object>} The sighting object
     */
    async function getSighting(id) {
        const url = `${Config.getApiUrl('SIGHTINGS')}?id=${id}`;
        const response = await request(url);
        return response.data;
    }
    
    /**
     * Creates a new sighting on the server
     * Handles image upload as multipart form data
     * 
     * @param {Object} sighting - The sighting data
     * @param {Blob} imageBlob - Optional image blob
     * @returns {Promise<Object>} The created sighting with server ID
     */
    async function createSighting(sighting, imageBlob = null) {
        const formData = new FormData();
        
        // Build the data object
        const sightingData = {
            client_id: sighting.clientId,
            latitude: sighting.latitude,
            longitude: sighting.longitude,
            location_accuracy: sighting.locationAccuracy,
            status: sighting.status,
            mortality_type: sighting.mortalityType || null,
            notes: sighting.notes || '',
            recorded_at: sighting.recordedAt
        };
        
        // Debug: Log what we're sending
        Config.debug('API', 'Creating sighting with data:', JSON.stringify(sightingData));
        
        // Add sighting data as JSON
        formData.append('data', JSON.stringify(sightingData));
        
        // Add image if present
        if (imageBlob) {
            formData.append('image', imageBlob, 'sighting.jpg');
        }
        
        const response = await request(Config.getApiUrl('SIGHTINGS'), {
            method: 'POST',
            body: formData
        });
        
        return response.data;
    }
    
    /**
     * Updates an existing sighting
     * 
     * @param {number} id - The server-side sighting ID
     * @param {Object} updates - The fields to update
     * @returns {Promise<Object>} The updated sighting
     */
    async function updateSighting(id, updates) {
        const response = await request(Config.getApiUrl('SIGHTINGS'), {
            method: 'PUT',
            body: JSON.stringify({
                id: id,
                ...updates
            })
        });
        
        return response.data;
    }
    
    /**
     * Deletes a sighting from the server
     * 
     * @param {number} id - The server-side sighting ID
     * @returns {Promise<void>}
     */
    async function deleteSighting(id) {
        await request(`${Config.getApiUrl('SIGHTINGS')}?id=${id}`, {
            method: 'DELETE'
        });
    }
    
    // ============================================
    // Sync API
    // ============================================
    
    /**
     * Syncs a locally-stored sighting to the server
     * This is the main sync function called by the background sync process
     * 
     * @param {Object} localSighting - The local sighting data
     * @returns {Promise<Object>} The server response with ID
     */
    async function syncSighting(localSighting) {
        // Get the cached image if available
        let imageBlob = null;
        
        if (localSighting.hasImage) {
            imageBlob = await Database.getImage(localSighting.clientId);
        }
        
        // Create on server
        const serverSighting = await createSighting(localSighting, imageBlob);
        
        Config.debug('API', 'Sighting synced:', localSighting.clientId, '->', serverSighting.id);
        
        return serverSighting;
    }
    
    /**
     * Fetches new/updated sightings since last sync
     * Used to pull down sightings created by other users
     * 
     * @param {string} since - ISO timestamp of last sync
     * @returns {Promise<Array>} New/updated sightings
     */
    async function fetchUpdates(since) {
        const url = `${Config.getApiUrl('SYNC')}?since=${encodeURIComponent(since)}`;
        const response = await request(url);
        return response.data || [];
    }
    
    // ============================================
    // Analytics API
    // ============================================
    
    /**
     * Fetches analytics summary data
     * 
     * @returns {Promise<Object>} Analytics summary
     */
    async function getAnalyticsSummary() {
        const url = `${Config.getApiUrl('ANALYTICS')}?type=summary`;
        const response = await request(url);
        return response.data;
    }
    
    /**
     * Fetches mortality breakdown data
     * 
     * @returns {Promise<Array>} Mortality statistics
     */
    async function getMortalityStats() {
        const url = `${Config.getApiUrl('ANALYTICS')}?type=mortality`;
        const response = await request(url);
        return response.data || [];
    }
    
    /**
     * Fetches location data for map visualization
     * 
     * @returns {Promise<Array>} Array of {lat, lng, status} objects
     */
    async function getLocationData() {
        const url = `${Config.getApiUrl('ANALYTICS')}?type=locations`;
        const response = await request(url);
        return response.data || [];
    }
    
    // ============================================
    // Mortality Types API
    // ============================================
    
    /**
     * Fetches mortality type reference data
     * Usually only called once and cached
     * 
     * @returns {Promise<Array>} Array of mortality types
     */
    async function getMortalityTypes() {
        const response = await request(Config.getApiUrl('MORTALITY_TYPES'));
        return response.data || [];
    }
    
    // ============================================
    // Health Check
    // ============================================
    
    /**
     * Checks if the API server is reachable
     * Used for connectivity testing
     * 
     * @returns {Promise<boolean>} True if server is reachable
     */
    async function healthCheck() {
        try {
            await request(Config.getApiUrl('SIGHTINGS') + '?health=1', {
                method: 'HEAD'
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // ============================================
    // Public API
    // ============================================
    return {
        // State
        get isOnline() { return isOnline; },
        
        // Sightings
        getSightings,
        getSighting,
        createSighting,
        updateSighting,
        deleteSighting,
        
        // Sync
        syncSighting,
        fetchUpdates,
        
        // Analytics
        getAnalyticsSummary,
        getMortalityStats,
        getLocationData,
        
        // Reference data
        getMortalityTypes,
        
        // Health
        healthCheck,
        
        // Error class (for instanceof checks)
        APIError
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
