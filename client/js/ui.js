/**
 * ZAP - Pangolin Tracker
 * UI Module
 * 
 * This module handles all DOM manipulation and user interface updates.
 * It provides a clean separation between business logic and presentation.
 * 
 * Architecture Pattern:
 * - Uses a simple publish-subscribe pattern for UI updates
 * - Implements template-based rendering for list items
 * - Manages modals, toasts, and other UI components
 * 
 * Accessibility:
 * - ARIA attributes are managed dynamically
 * - Focus management for modals and notifications
 * - Screen reader announcements for important updates
 */

const UI = (function() {
    // ============================================
    // DOM Element References
    // ============================================
    
    const elements = {
        // Header
        syncBtn: document.getElementById('syncBtn'),
        pendingCount: document.getElementById('pendingCount'),
        connectionStatus: document.getElementById('connectionStatus'),
        
        // Navigation
        tabSightings: document.getElementById('tabSightings'),
        tabAdd: document.getElementById('tabAdd'),
        tabAnalytics: document.getElementById('tabAnalytics'),
        
        // Views
        viewSightings: document.getElementById('viewSightings'),
        viewAdd: document.getElementById('viewAdd'),
        viewAnalytics: document.getElementById('viewAnalytics'),
        
        // Sightings List
        sightingsList: document.getElementById('sightingsList'),
        sightingsLoading: document.getElementById('sightingsLoading'),
        sightingsEmpty: document.getElementById('sightingsEmpty'),
        filterStatus: document.getElementById('filterStatus'),
        
        // Form
        sightingForm: document.getElementById('sightingForm'),
        photoInput: document.getElementById('photoInput'),
        photoPreview: document.getElementById('photoPreview'),
        previewImage: document.getElementById('previewImage'),
        btnCamera: document.getElementById('btnCamera'),
        btnGallery: document.getElementById('btnGallery'),
        mortalitySection: document.getElementById('mortalitySection'),
        locationMapContainer: document.getElementById('locationMapContainer'),
        locationMap: document.getElementById('locationMap'),
        locationText: document.getElementById('locationText'),
        btnMyLocation: document.getElementById('btnMyLocation'),
        latitude: document.getElementById('latitude'),
        longitude: document.getElementById('longitude'),
        locationAccuracy: document.getElementById('locationAccuracy'),
        notes: document.getElementById('notes'),
        notesCount: document.getElementById('notesCount'),
        btnSubmit: document.getElementById('btnSubmit'),
        
        // Error messages
        statusError: document.getElementById('statusError'),
        mortalityError: document.getElementById('mortalityError'),
        locationError: document.getElementById('locationError'),
        
        // Analytics
        statTotal: document.getElementById('statTotal'),
        statAlive: document.getElementById('statAlive'),
        statDead: document.getElementById('statDead'),
        statRecent: document.getElementById('statRecent'),
        mortalityBars: document.getElementById('mortalityBars'),
        analyticsMap: document.getElementById('analyticsMap'),
        
        // Toast & Modal
        toastContainer: document.getElementById('toastContainer'),
        sightingModal: document.getElementById('sightingModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalBody: document.getElementById('modalBody')
    };
    
    // Map instances
    let analyticsMap = null;
    let locationPickerMap = null;
    let locationMarker = null;
    let mapMarkers = [];
    
    // Cache sightings for modal access (includes server-only sightings)
    let cachedSightings = [];
    
    // ============================================
    // Navigation
    // ============================================
    
    /**
     * Switches to a different view
     * Updates tab states and manages view visibility
     * 
     * @param {string} viewName - 'sightings', 'add', or 'analytics'
     */
    function switchView(viewName) {
        // Update tabs
        const tabs = [elements.tabSightings, elements.tabAdd, elements.tabAnalytics];
        const views = [elements.viewSightings, elements.viewAdd, elements.viewAnalytics];
        
        tabs.forEach((tab, index) => {
            const isActive = tab.id === `tab${capitalize(viewName)}`;
            
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            
            views[index].classList.toggle('active', isActive);
            views[index].hidden = !isActive;
        });
        
        Config.debug('UI', 'Switched to view:', viewName);
        
        // Trigger view-specific initialization
        document.dispatchEvent(new CustomEvent('view:changed', { 
            detail: { view: viewName } 
        }));
    }
    
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    // ============================================
    // Connection Status
    // ============================================
    
    /**
     * Updates the connection status indicator
     * 
     * @param {boolean} isOnline - Whether the app is online
     */
    function updateConnectionStatus(isOnline) {
        const statusDot = elements.connectionStatus.querySelector('.status-dot');
        const statusText = elements.connectionStatus.querySelector('.status-text');
        
        statusDot.classList.toggle('online', isOnline);
        statusDot.classList.toggle('offline', !isOnline);
        statusText.textContent = isOnline ? 'Online' : 'Offline';
        
        Config.debug('UI', 'Connection status:', isOnline ? 'Online' : 'Offline');
    }
    
    /**
     * Updates the pending sync count badge
     * 
     * @param {number} count - Number of pending syncs
     */
    function updatePendingCount(count) {
        elements.pendingCount.textContent = count;
        elements.pendingCount.hidden = count === 0;
        
        if (count > 0) {
            elements.syncBtn.setAttribute('aria-label', `Sync ${count} pending sightings`);
        } else {
            elements.syncBtn.setAttribute('aria-label', 'All sightings synced');
        }
    }
    
    /**
     * Shows/hides sync animation
     * 
     * @param {boolean} syncing - Whether sync is in progress
     */
    function setSyncing(syncing) {
        elements.syncBtn.classList.toggle('syncing', syncing);
        elements.syncBtn.disabled = syncing;
    }
    
    // ============================================
    // Sightings List
    // ============================================
    
    /**
     * Updates the sighting count display area
     * Shows pangolin with count message
     * 
     * @param {number} count - Number of sightings
     */
    function updateSightingCountDisplay(count) {
        const emptyState = elements.sightingsEmpty;
        
        // Always show this section
        emptyState.hidden = false;
        
        if (count === 0) {
            // No sightings - show empty state message
            emptyState.innerHTML = `
                <div class="empty-illustration" aria-hidden="true">//pangolin icon\\</div>
                <h3>No Sightings Yet</h3>
                <p>Be the first to record a pangolin sighting in your area!</p>
                <button class="btn btn-primary" data-action="go-to-add">
                    Record Sighting
                </button>
            `;
        } else {
            // Has sightings - show count message
            const sightingWord = count === 1 ? 'sighting has' : 'sightings have';
            emptyState.innerHTML = `
                <div class="empty-illustration" aria-hidden="true">//pangolin icon\\</div>
                <h3>${count} Pangolin ${sightingWord} been recorded</h3>
                <button class="btn btn-primary" data-action="go-to-add">
                    Record Sighting
                </button>
            `;
        }
        
        // Re-attach click handler for the button
        const goToAddBtn = emptyState.querySelector('[data-action="go-to-add"]');
        if (goToAddBtn) {
            goToAddBtn.addEventListener('click', () => {
                switchView('add');
            });
        }
    }
    
    /**
     * Renders the sightings list
     * 
     * @param {Array} sightings - Array of sighting objects
     */
    function renderSightings(sightings) {
        elements.sightingsLoading.hidden = true;
        
        const count = sightings ? sightings.length : 0;
        
        // Cache sightings for modal access (includes server-only sightings)
        cachedSightings = sightings || [];
        
        // Update the pangolin count display
        updateSightingCountDisplay(count);
        
        if (count === 0) {
            elements.sightingsList.innerHTML = '';
            return;
        }
        
        // Render the sighting cards
        const html = sightings.map(sighting => createSightingCard(sighting)).join('');
        elements.sightingsList.innerHTML = html;
        
        Config.debug('UI', `Rendered ${count} sightings`);
    }
    
    /**
     * Gets a cached sighting by clientId
     * Used for opening modals - works for both local and server-only sightings
     * 
     * @param {string} clientId - The client ID to find
     * @returns {Object|null} The sighting or null if not found
     */
    function getCachedSighting(clientId) {
        return cachedSightings.find(s => s.clientId === clientId) || null;
    }
    
    /**
     * Shows the loading state for sightings list
     */
    function showSightingsLoading() {
        elements.sightingsLoading.hidden = false;
        elements.sightingsEmpty.hidden = true;
        elements.sightingsList.innerHTML = '';
    }

    /**
     * Hides the loading state(calling this after the data loads)
     */
    function hidesSightingsLoading() {
        elements.sightingsLoading.hidden =true;
    }
    /**
     * Creates HTML for a sighting card
     * 
     * @param {Object} sighting - The sighting data
     * @returns {string} HTML string
     */
    function createSightingCard(sighting) {
        const date = new Date(sighting.recordedAt);
        const formattedDate = formatDate(date);
        const locationText = Location.formatCoordinatesShort(
            sighting.latitude, 
            sighting.longitude
        );
        
        const mortalityType = sighting.mortalityType ? 
            Config.getMortalityType(sighting.mortalityType) : null;
        
        const thumbnailHtml = sighting.hasImage ?
            `<img src="${sighting.thumbnailUrl || Config.IMAGE.PLACEHOLDER}" 
                  alt="Sighting photo" loading="lazy">` :
            `<span class="no-image">//pangolin icon\\</span>`;
        
        const notesPreview = sighting.notes ? 
            escapeHtml(sighting.notes.substring(0, 80)) + 
            (sighting.notes.length > 80 ? '...' : '') : 
            '';
        
        const pendingBadge = !sighting.synced ?
            `<span class="pending-badge">//pending icon\\ Pending sync</span>` : '';
        
        return `
            <li class="sighting-card ${!sighting.synced ? 'pending' : ''}" 
                data-client-id="${sighting.clientId}"
                role="listitem"
                tabindex="0">
                <div class="sighting-thumbnail">
                    ${thumbnailHtml}
                </div>
                <div class="sighting-info">
                    <div class="sighting-header">
                        <span class="sighting-status ${sighting.status}">
                            ${sighting.status === 'alive' ? '//alive icon\\' : '//dead icon\\'} ${sighting.status}
                        </span>
                        <span class="sighting-date">${formattedDate}</span>
                    </div>
                    ${mortalityType ? 
                        `<div class="sighting-mortality">
                            ${mortalityType.icon} ${mortalityType.description}
                        </div>` : ''
                    }
                    <div class="sighting-location">
                        //location icon\\ ${locationText}
                    </div>
                    ${notesPreview ? 
                        `<div class="sighting-notes">${notesPreview}</div>` : ''
                    }
                    ${pendingBadge}
                </div>
            </li>
        `;
    }
    
    // ============================================
    // Form Handling
    // ============================================
    
    /**
     * Updates the photo preview
     * 
     * @param {string|null} url - The image URL or null to clear
     */
    function updatePhotoPreview(url) {
        const placeholder = elements.photoPreview.querySelector('.photo-placeholder');
        
        if (url) {
            elements.previewImage.src = url;
            elements.previewImage.hidden = false;
            placeholder.hidden = true;
        } else {
            elements.previewImage.src = '';
            elements.previewImage.hidden = true;
            placeholder.hidden = false;
        }
    }
    
    /**
     * Shows/hides the mortality type selection
     * 
     * @param {boolean} show - Whether to show the section
     */
    function showMortalitySection(show) {
        elements.mortalitySection.hidden = !show;
        
        if (!show) {
            // Clear selection when hiding
            const radios = elements.mortalitySection.querySelectorAll('input[type="radio"]');
            radios.forEach(radio => radio.checked = false);
        }
    }
    
    /**
     * Initializes the location picker map
     */
    function initLocationPickerMap() {
        if (locationPickerMap) return locationPickerMap;
        
        if (typeof L === 'undefined') {
            Config.debug('UI', 'Leaflet not loaded, skipping location map init');
            return null;
        }
        
        // Default to a central location (can be overridden)
        const defaultLat = Config.LOCATION.DEFAULT_LAT || 51.5;
        const defaultLng = Config.LOCATION.DEFAULT_LNG || -0.1;
        const defaultZoom = 10;
        
        locationPickerMap = L.map(elements.locationMap, {
            center: [defaultLat, defaultLng],
            zoom: defaultZoom,
            zoomControl: true
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 18
        }).addTo(locationPickerMap);
        
        // Click handler to place marker
        locationPickerMap.on('click', function(e) {
            setLocationMarker(e.latlng.lat, e.latlng.lng);
        });
        
        Config.debug('UI', 'Location picker map initialized');
        return locationPickerMap;
    }
    
    /**
     * Sets the location marker on the map
     * 
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} accuracy - Optional accuracy in meters
     */
    function setLocationMarker(lat, lng, accuracy = null) {
        if (!locationPickerMap) {
            initLocationPickerMap();
        }
        
        // Remove existing marker
        if (locationMarker) {
            locationPickerMap.removeLayer(locationMarker);
        }
        
        // Create custom icon
        const markerIcon = L.divIcon({
            className: 'location-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        // Add new marker
        locationMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(locationPickerMap);
        
        // Update form fields
        elements.latitude.value = lat;
        elements.longitude.value = lng;
        elements.locationAccuracy.value = accuracy || '';
        
        // Update display text
        elements.locationText.textContent = Location.formatCoordinates(lat, lng, accuracy);
        
        // Add visual feedback
        elements.locationMapContainer.classList.add('has-location');
        elements.locationError.hidden = true;
        
        // Center map on marker
        locationPickerMap.setView([lat, lng], Math.max(locationPickerMap.getZoom(), 13));
        
        Config.debug('UI', `Location set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
    
    /**
     * Refreshes the location picker map (call when view becomes visible)
     */
    function refreshLocationPickerMap() {
        if (locationPickerMap) {
            setTimeout(() => {
                locationPickerMap.invalidateSize();
            }, 100);
        }
    }
    
    /**
     * Clears the location marker
     */
    function clearLocationMarker() {
        if (locationMarker && locationPickerMap) {
            locationPickerMap.removeLayer(locationMarker);
            locationMarker = null;
        }
        
        elements.latitude.value = '';
        elements.longitude.value = '';
        elements.locationAccuracy.value = '';
        elements.locationText.textContent = 'Tap the map to set location';
        elements.locationMapContainer.classList.remove('has-location');
    }
    
    /**
     * Updates the location display (legacy support)
     * 
     * @param {Object} data - Location data or status
     */
    function updateLocationDisplay(data) {
        if (data.status === 'acquiring') {
            elements.locationText.textContent = 'Getting your location...';
            if (elements.btnMyLocation) elements.btnMyLocation.disabled = true;
            elements.locationError.hidden = true;
        } else if (data.status === 'acquired') {
            const pos = data.position.coords;
            setLocationMarker(pos.latitude, pos.longitude, pos.accuracy);
            if (elements.btnMyLocation) elements.btnMyLocation.disabled = false;
        } else if (data.status === 'error') {
            elements.locationText.textContent = 'Tap the map to set location';
            if (elements.btnMyLocation) elements.btnMyLocation.disabled = false;
            // Don't show error for map-based selection
        }
    }
    
    /**
     * Updates the character count for notes
     * 
     * @param {number} count - Current character count
     */
    function updateNotesCount(count) {
        elements.notesCount.textContent = count;
    }
    
    /**
     * Shows/hides form validation errors
     * 
     * @param {Object} errors - Object with field names as keys
     */
    function showFormErrors(errors) {
        elements.statusError.hidden = !errors.status;
        elements.mortalityError.hidden = !errors.mortality;
        elements.locationError.hidden = !errors.location;
        
        if (errors.location) {
            elements.locationError.textContent = errors.location;
        }
    }
    
    /**
     * Sets the submit button loading state
     * 
     * @param {boolean} loading - Whether submission is in progress
     */
    function setSubmitLoading(loading) {
        const btnText = elements.btnSubmit.querySelector('.btn-text');
        const btnLoading = elements.btnSubmit.querySelector('.btn-loading');
        
        elements.btnSubmit.disabled = loading;
        btnText.hidden = loading;
        btnLoading.hidden = !loading;
    }
    
    /**
     * Resets the form to initial state
     */
    function resetForm() {
        elements.sightingForm.reset();
        updatePhotoPreview(null);
        showMortalitySection(false);
        showFormErrors({});
        updateNotesCount(0);
        clearLocationMarker();
    }
    
    // ============================================
    // Analytics
    // ============================================
    
    /**
     * Updates the analytics summary statistics
     * 
     * @param {Object} stats - Statistics object
     */
    function updateAnalyticsStats(stats) {
        elements.statTotal.textContent = stats.total ?? '-';
        elements.statAlive.textContent = stats.alive ?? '-';
        elements.statDead.textContent = stats.dead ?? '-';
        elements.statRecent.textContent = stats.recent ?? '-';
    }
    
    /**
     * Renders the mortality breakdown chart
     * 
     * @param {Array} data - Mortality statistics
     */
    function renderMortalityChart(data) {
        if (!data || data.length === 0) {
            elements.mortalityBars.innerHTML = '<p>No mortality data available</p>';
            return;
        }
        
        const maxValue = Math.max(...data.map(d => d.count));
        
        const html = data.map(item => {
            const type = Config.getMortalityType(item.code);
            const percentage = maxValue > 0 ? (item.count / maxValue) * 100 : 0;
            
            return `
                <div class="bar-item">
                    <span class="bar-label">${type?.icon || ''} ${type?.description || item.code}</span>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="bar-value">${item.count}</span>
                </div>
            `;
        }).join('');
        
        elements.mortalityBars.innerHTML = html;
    }
    
    /**
     * Initializes the analytics map
     */
    function initAnalyticsMap() {
        if (analyticsMap) return; // Already initialized
        
        // Check if Leaflet is available
        if (typeof L === 'undefined') {
            Config.debug('UI', 'Leaflet not loaded, skipping map init');
            return;
        }
        
        analyticsMap = L.map(elements.analyticsMap, {
            center: [Config.LOCATION.DEFAULT_LAT, Config.LOCATION.DEFAULT_LNG],
            zoom: Config.LOCATION.DEFAULT_ZOOM,
            zoomControl: true,
            attributionControl: true
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(analyticsMap);
        
        Config.debug('UI', 'Analytics map initialized');
    }
    
    /**
     * Updates the map with sighting locations
     * 
     * @param {Array} locations - Array of {lat, lng, status} objects
     */
    function updateMapMarkers(locations) {
        if (!analyticsMap) {
            initAnalyticsMap();
        }
        
        // Clear existing markers
        mapMarkers.forEach(marker => analyticsMap.removeLayer(marker));
        mapMarkers = [];
        
        if (!locations || locations.length === 0) return;
        
        const bounds = [];
        
        locations.forEach(loc => {
            const color = loc.status === 'alive' ? '#2E7D32' : '#C62828';
            
            const marker = L.circleMarker([loc.lat, loc.lng], {
                radius: 8,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
            
            marker.bindPopup(`
                <div class="map-popup">
                    <span class="map-popup-status ${loc.status}">${loc.status}</span>
                    <br>
                    <small>${Location.formatCoordinatesShort(loc.lat, loc.lng)}</small>
                </div>
            `);
            
            marker.addTo(analyticsMap);
            mapMarkers.push(marker);
            bounds.push([loc.lat, loc.lng]);
        });
        
        // Fit map to markers
        if (bounds.length > 0) {
            analyticsMap.fitBounds(bounds, { padding: [20, 20] });
        }
        
        Config.debug('UI', `Added ${locations.length} map markers`);
    }
    
    /**
     * Invalidates map size (call after view becomes visible)
     */
    function refreshMap() {
        if (analyticsMap) {
            setTimeout(() => {
                analyticsMap.invalidateSize();
            }, 100);
        }
    }
    
    // ============================================
    // Toast Notifications
    // ============================================
    
    /**
     * Shows a toast notification
     * 
     * @param {string} message - The message to display
     * @param {string} type - 'success', 'error', 'warning', or 'info'
     * @param {number} duration - How long to show (ms)
     */
    function showToast(message, type = 'info', duration = Config.UI.TOAST_DURATION) {
        const icons = {
            success: '//success icon\\',
            error: '//error icon\\',
            warning: '//warning icon\\',
            info: '//info icon\\'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Dismiss">×</button>
        `;
        
        // Add close handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            removeToast(toast);
        });
        
        elements.toastContainer.appendChild(toast);
        
        // Auto-remove after duration
        setTimeout(() => removeToast(toast), duration);
        
        // Announce to screen readers
        announceToScreenReader(message);
        
        Config.debug('UI', `Toast shown: ${type} - ${message}`);
    }
    
    /**
     * Removes a toast with animation
     * 
     * @param {HTMLElement} toast - The toast element
     */
    function removeToast(toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(100%)';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 250);
    }
    
    // ============================================
    // Modal
    // ============================================
    
    /**
     * Opens the sighting detail modal
     * 
     * @param {Object} sighting - The sighting data
     */
    function openSightingModal(sighting) {
        const date = new Date(sighting.recordedAt);
        const mortalityType = sighting.mortalityType ? 
            Config.getMortalityType(sighting.mortalityType) : null;
        
        elements.modalTitle.textContent = `${sighting.status === 'alive' ? '//alive icon\\' : '//dead icon\\'} Pangolin Sighting`;
        
        elements.modalBody.innerHTML = `
            ${sighting.imageUrl ? 
                `<img src="${sighting.imageUrl}" alt="Sighting photo" class="modal-image">` : ''
            }
            
            <div class="modal-detail">
                <div class="modal-detail-label">Status</div>
                <div class="modal-detail-value">
                    <span class="sighting-status ${sighting.status}">
                        ${sighting.status === 'alive' ? '//alive icon\\ Alive' : '//dead icon\\ Dead'}
                    </span>
                </div>
            </div>
            
            ${mortalityType ? `
                <div class="modal-detail">
                    <div class="modal-detail-label">Cause of Death</div>
                    <div class="modal-detail-value">
                        ${mortalityType.icon} ${mortalityType.description}
                    </div>
                </div>
            ` : ''}
            
            <div class="modal-detail">
                <div class="modal-detail-label">Location</div>
                <div class="modal-detail-value">
                    //location icon\\ ${Location.formatCoordinates(
                        sighting.latitude, 
                        sighting.longitude,
                        sighting.locationAccuracy
                    )}
                </div>
            </div>
            
            <div class="modal-detail">
                <div class="modal-detail-label">Recorded</div>
                <div class="modal-detail-value">
                    ${formatDateTime(date)}
                </div>
            </div>
            
            ${sighting.notes ? `
                <div class="modal-detail">
                    <div class="modal-detail-label">Notes</div>
                    <div class="modal-detail-value">
                        ${escapeHtml(sighting.notes)}
                    </div>
                </div>
            ` : ''}
            
            ${!sighting.synced ? `
                <div class="pending-badge" style="margin-top: 16px;">
                    //pending icon\\ Pending sync
                </div>
            ` : ''}
        `;
        
        elements.sightingModal.showModal();
    }
    
    /**
     * Closes the sighting modal
     */
    function closeSightingModal() {
        elements.sightingModal.close();
    }
    
    // ============================================
    // Utility Functions
    // ============================================
    
    /**
     * Escapes HTML to prevent XSS
     * 
     * @param {string} str - The string to escape
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    /**
     * Formats a date for display
     * 
     * @param {Date} date - The date to format
     * @returns {string} Formatted date string
     */
    function formatDate(date) {
        const now = new Date();
        const diff = now - date;
        
        // Less than 24 hours
        if (diff < 86400000) {
            if (diff < 3600000) {
                const mins = Math.floor(diff / 60000);
                return mins <= 1 ? 'Just now' : `${mins} minutes ago`;
            }
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        
        // Less than 7 days
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }
        
        // Otherwise, show date
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    /**
     * Formats a date and time for display
     * 
     * @param {Date} date - The date to format
     * @returns {string} Formatted date/time string
     */
    function formatDateTime(date) {
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    /**
     * Announces a message to screen readers
     * 
     * @param {string} message - The message to announce
     */
    function announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'visually-hidden';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }
    
    // ============================================
    // Public API
    // ============================================
    return {
        // Elements (for direct access if needed)
        elements,
        
        // Navigation
        switchView,
        
        // Status
        updateConnectionStatus,
        updatePendingCount,
        setSyncing,
        
        // Sightings
        renderSightings,
        showSightingsLoading,
        hidesSightingsLoading,
        updateSightingCountDisplay,
        getCachedSighting,
        
        // Form
        updatePhotoPreview,
        showMortalitySection,
        updateLocationDisplay,
        updateNotesCount,
        showFormErrors,
        setSubmitLoading,
        resetForm,
        
        // Location Map Picker
        initLocationPickerMap,
        setLocationMarker,
        clearLocationMarker,
        refreshLocationPickerMap,
        
        // Analytics
        updateAnalyticsStats,
        renderMortalityChart,
        initAnalyticsMap,
        updateMapMarkers,
        refreshMap,
        
        // Notifications
        showToast,
        
        // Modal
        openSightingModal,
        closeSightingModal,
        
        // Utilities
        escapeHtml,
        formatDate,
        formatDateTime,
        announceToScreenReader
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
