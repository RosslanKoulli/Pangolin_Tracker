/**
 * ZAP - Pangolin Tracker
 * UI Module
 * 
 * This module handles all DOM manipulation and user interface updates.
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
        locationText: document.getElementById('locationText'),
        btnRefreshLocation: document.getElementById('btnRefreshLocation'),
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
    
    // Map instance for analytics
    let analyticsMap = null;
    let mapMarkers = [];
    
    // ============================================
    // Navigation
    // ============================================
    
    function switchView(viewName) {
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
    
    function updateConnectionStatus(isOnline) {
        const statusDot = elements.connectionStatus.querySelector('.status-dot');
        const statusText = elements.connectionStatus.querySelector('.status-text');
        
        statusDot.classList.toggle('online', isOnline);
        statusDot.classList.toggle('offline', !isOnline);
        statusText.textContent = isOnline ? 'Online' : 'Offline';
        
        Config.debug('UI', 'Connection status:', isOnline ? 'Online' : 'Offline');
    }
    
    function updatePendingCount(count) {
        elements.pendingCount.textContent = count;
        elements.pendingCount.hidden = count === 0;
        
        if (count > 0) {
            elements.syncBtn.setAttribute('aria-label', `Sync ${count} pending sightings`);
        } else {
            elements.syncBtn.setAttribute('aria-label', 'All sightings synced');
        }
    }
    
    function setSyncing(syncing) {
        elements.syncBtn.classList.toggle('syncing', syncing);
        elements.syncBtn.disabled = syncing;
    }
    
    // ============================================
    // Sightings List
    // ============================================
    
    /**
     * Updates the sighting count display area
     * Shows different content based on whether there are sightings or not
     * 
     * @param {number} count - Number of sightings
     */
    function updateSightingCountDisplay(count) {
        const emptyState = elements.sightingsEmpty;
        
        // Always show this section (never hide it)
        emptyState.hidden = false;
        
        if (count === 0) {
            // No sightings - show empty state message
            emptyState.innerHTML = `
                <div class="empty-illustration" aria-hidden="true">🦔</div>
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
                <div class="empty-illustration" aria-hidden="true">🦔</div>
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
     * Updates the count display instead of hiding it
     * 
     * @param {Array} sightings - Array of sighting objects
     */
    function renderSightings(sightings) {
        // Hide loading state
        elements.sightingsLoading.hidden = true;
        
        const count = sightings ? sightings.length : 0;
        
        // Update the count display (this replaces the old show/hide logic)
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
     * Shows the loading state for sightings list
     */
    function showSightingsLoading() {
        elements.sightingsLoading.hidden = false;
        elements.sightingsEmpty.hidden = true;
        elements.sightingsList.innerHTML = '';
    }
    
    /**
     * Hides the loading state
     */
    function hideSightingsLoading() {
        elements.sightingsLoading.hidden = true;
    }
    
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
            `<span class="no-image">🦔</span>`;
        
        const notesPreview = sighting.notes ? 
            escapeHtml(sighting.notes.substring(0, 80)) + 
            (sighting.notes.length > 80 ? '...' : '') : 
            '';
        
        const pendingBadge = !sighting.synced ?
            `<span class="pending-badge">⏳ Pending sync</span>` : '';
        
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
                            ${sighting.status === 'alive' ? '💚' : '💔'} ${sighting.status}
                        </span>
                        <span class="sighting-date">${formattedDate}</span>
                    </div>
                    ${mortalityType ? 
                        `<div class="sighting-mortality">
                            ${mortalityType.icon} ${mortalityType.description}
                        </div>` : ''
                    }
                    <div class="sighting-location">
                        📍 ${locationText}
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
    
    function showMortalitySection(show) {
        elements.mortalitySection.hidden = !show;
        
        if (!show) {
            const radios = elements.mortalitySection.querySelectorAll('input[type="radio"]');
            radios.forEach(radio => radio.checked = false);
        }
    }
    
    function updateLocationDisplay(data) {
        if (data.status === 'acquiring') {
            elements.locationText.textContent = 'Acquiring location...';
            elements.btnRefreshLocation.disabled = true;
            elements.locationError.hidden = true;
        } else if (data.status === 'acquired') {
            const pos = data.position.coords;
            elements.locationText.textContent = Location.formatCoordinates(
                pos.latitude, 
                pos.longitude, 
                pos.accuracy
            );
            elements.latitude.value = pos.latitude;
            elements.longitude.value = pos.longitude;
            elements.locationAccuracy.value = pos.accuracy;
            elements.btnRefreshLocation.disabled = false;
            elements.locationError.hidden = true;
        } else if (data.status === 'error') {
            elements.locationText.textContent = 'Location unavailable';
            elements.btnRefreshLocation.disabled = false;
            elements.locationError.textContent = data.error.message;
            elements.locationError.hidden = false;
        }
    }
    
    function updateNotesCount(count) {
        elements.notesCount.textContent = count;
    }
    
    function showFormErrors(errors) {
        elements.statusError.hidden = !errors.status;
        elements.mortalityError.hidden = !errors.mortality;
        elements.locationError.hidden = !errors.location;
        
        if (errors.location) {
            elements.locationError.textContent = errors.location;
        }
    }
    
    function setSubmitLoading(loading) {
        const btnText = elements.btnSubmit.querySelector('.btn-text');
        const btnLoading = elements.btnSubmit.querySelector('.btn-loading');
        
        elements.btnSubmit.disabled = loading;
        btnText.hidden = loading;
        btnLoading.hidden = !loading;
    }
    
    function resetForm() {
        elements.sightingForm.reset();
        updatePhotoPreview(null);
        showMortalitySection(false);
        showFormErrors({});
        updateNotesCount(0);
        elements.latitude.value = '';
        elements.longitude.value = '';
        elements.locationAccuracy.value = '';
    }
    
    // ============================================
    // Analytics
    // ============================================
    
    function updateAnalyticsStats(stats) {
        elements.statTotal.textContent = stats.total ?? '-';
        elements.statAlive.textContent = stats.alive ?? '-';
        elements.statDead.textContent = stats.dead ?? '-';
        elements.statRecent.textContent = stats.recent ?? '-';
    }
    
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
    
    function initAnalyticsMap() {
        if (analyticsMap) return;
        
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
    
    function updateMapMarkers(locations) {
        if (!analyticsMap) {
            initAnalyticsMap();
        }
        
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
        
        if (bounds.length > 0) {
            analyticsMap.fitBounds(bounds, { padding: [20, 20] });
        }
        
        Config.debug('UI', `Added ${locations.length} map markers`);
    }
    
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
    
    function showToast(message, type = 'info', duration = Config.UI.TOAST_DURATION) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Dismiss">×</button>
        `;
        
        toast.querySelector('.toast-close').addEventListener('click', () => {
            removeToast(toast);
        });
        
        elements.toastContainer.appendChild(toast);
        
        setTimeout(() => removeToast(toast), duration);
        
        announceToScreenReader(message);
        
        Config.debug('UI', `Toast shown: ${type} - ${message}`);
    }
    
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
    
    function openSightingModal(sighting) {
        const date = new Date(sighting.recordedAt);
        const mortalityType = sighting.mortalityType ? 
            Config.getMortalityType(sighting.mortalityType) : null;
        
        elements.modalTitle.textContent = `${sighting.status === 'alive' ? '💚' : '💔'} Pangolin Sighting`;
        
        elements.modalBody.innerHTML = `
            ${sighting.imageUrl ? 
                `<img src="${sighting.imageUrl}" alt="Sighting photo" class="modal-image">` : ''
            }
            
            <div class="modal-detail">
                <div class="modal-detail-label">Status</div>
                <div class="modal-detail-value">
                    <span class="sighting-status ${sighting.status}">
                        ${sighting.status === 'alive' ? '💚 Alive' : '💔 Dead'}
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
                    📍 ${Location.formatCoordinates(
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
                    ⏳ Pending sync
                </div>
            ` : ''}
        `;
        
        elements.sightingModal.showModal();
    }
    
    function closeSightingModal() {
        elements.sightingModal.close();
    }
    
    // ============================================
    // Utility Functions
    // ============================================
    
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    function formatDate(date) {
        const now = new Date();
        const diff = now - date;
        
        if (diff < 86400000) {
            if (diff < 3600000) {
                const mins = Math.floor(diff / 60000);
                return mins <= 1 ? 'Just now' : `${mins} minutes ago`;
            }
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }
        
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
    
    function formatDateTime(date) {
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
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
        hideSightingsLoading,
        updateSightingCountDisplay,
        
        // Form
        updatePhotoPreview,
        showMortalitySection,
        updateLocationDisplay,
        updateNotesCount,
        showFormErrors,
        setSubmitLoading,
        resetForm,
        
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
