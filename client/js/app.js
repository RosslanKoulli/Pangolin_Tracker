/**
 * ZAP - Pangolin Tracker
 * Main Application Module
 */

const App = (function() {
    let currentPhotoBlob = null;
    let currentPhotoUrl = null;
    let isInitialized = false;
    
    async function init() {
        if (isInitialized) return;
        
        Config.debug('App', 'Initializing...');
        
        try {
            await Database.open();
            setupEventListeners();
            UI.updateConnectionStatus(navigator.onLine);
            await updatePendingSyncCount();
            await loadSightings();
            
            // Request location permission on startup
            requestLocationPermission();
            
            isInitialized = true;
            Config.debug('App', 'Initialization complete');
        } catch (error) {
            console.error('App initialization failed:', error);
            UI.showToast('Failed to initialize app. Please refresh.', 'error');
        }
    }
    
    /**
     * Requests location permission from the user on app startup
     * This ensures the browser prompts for location access
     */
    async function requestLocationPermission() {
        try {
            Config.debug('App', 'Requesting location permission...');
            
            // This will trigger the browser's location permission prompt
            const position = await Location.getCurrentPosition({ timeout: 10000 });
            
            Config.debug('App', 'Location permission granted:', 
                position.coords.latitude.toFixed(4), 
                position.coords.longitude.toFixed(4)
            );
            
        } catch (error) {
            // User denied or error occurred - that's okay, they can still use the map
            Config.debug('App', 'Location permission request result:', error.code || error.message);
        }
    }
    
    function setupEventListeners() {
        // Navigation
        UI.elements.tabSightings.addEventListener('click', () => UI.switchView('sightings'));
        UI.elements.tabAdd.addEventListener('click', () => {
            UI.switchView('add');
            // Initialize and refresh the location picker map
            UI.initLocationPickerMap();
            UI.refreshLocationPickerMap();
        });
        UI.elements.tabAnalytics.addEventListener('click', () => {
            UI.switchView('analytics');
            loadAnalytics();
        });
        
        document.addEventListener('view:changed', (e) => {
            if (e.detail.view === 'analytics') UI.refreshMap();
            if (e.detail.view === 'add') UI.refreshLocationPickerMap();
        });
        
        // Connection events
        document.addEventListener('app:online', handleOnline);
        document.addEventListener('app:offline', handleOffline);
        
        // Sync button
        UI.elements.syncBtn.addEventListener('click', handleSync);
        
        // Filter
        UI.elements.filterStatus.addEventListener('change', handleFilterChange);
        
        // Sightings list
        UI.elements.sightingsList.addEventListener('click', handleSightingClick);
        UI.elements.sightingsList.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSightingClick(e);
            }
        });
        
        // Empty state
        document.querySelector('[data-action="go-to-add"]')?.addEventListener('click', () => {
            UI.switchView('add');
        });
        
        // Photo buttons
        UI.elements.btnCamera.addEventListener('click', handleCameraCapture);
        UI.elements.btnGallery.addEventListener('click', handleGallerySelect);
        
        // Status radios
        document.querySelectorAll('input[name="status"]').forEach(radio => {
            radio.addEventListener('change', handleStatusChange);
        });
        
        // My Location button
        if (UI.elements.btnMyLocation) {
            UI.elements.btnMyLocation.addEventListener('click', requestLocation);
        }
        
        // Notes count
        UI.elements.notes.addEventListener('input', () => {
            UI.updateNotesCount(UI.elements.notes.value.length);
        });
        
        // Form
        UI.elements.sightingForm.addEventListener('submit', handleFormSubmit);
        UI.elements.sightingForm.addEventListener('reset', handleFormReset);
        
        // Modal
        UI.elements.sightingModal.querySelector('.modal-close').addEventListener('click', UI.closeSightingModal);
        UI.elements.sightingModal.addEventListener('click', (e) => {
            if (e.target === UI.elements.sightingModal) UI.closeSightingModal();
        });
        
        // Location updates (for "Use My Location" button)
        Location.addListener(UI.updateLocationDisplay);
    }
    
    async function loadSightings() {
        const filter = UI.elements.filterStatus.value;
        UI.showSightingsLoading();
        
        try {
            let sightings = await Database.getAllSightings({ 
                status: filter !== 'all' ? filter : undefined 
            });
            
            if (API.isOnline) {
                try {
                    const serverSightings = await API.getSightings({ status: filter });
                    sightings = mergeSightings(sightings, serverSightings);
                } catch (error) {
                    Config.debug('App', 'Server fetch failed:', error.message);
                }
            }
            
            for (const sighting of sightings) {
                if (sighting.hasImage) {
                    // Always try local image first, fall back to server URL
                    const blob = await Database.getImage(sighting.clientId);
                    if (blob) {
                        sighting.thumbnailUrl = URL.createObjectURL(blob);
                    }
                    // If no local blob, thumbnailUrl may already be set from server
                }
            }
            
            UI.renderSightings(sightings);
        } catch (error) {
            console.error('Failed to load sightings:', error);
            UI.showToast('Failed to load sightings', 'error');
            UI.renderSightings([]);
        }
    }
    
    function mergeSightings(local, server) {
        const merged = new Map();
        
        for (const s of local) merged.set(s.clientId, s);
        
        for (const s of server) {
            const clientId = s.client_id || s.clientId;
            if (!merged.has(clientId)) {
                merged.set(clientId, {
                    clientId,
                    serverId: s.id,
                    latitude: parseFloat(s.latitude),
                    longitude: parseFloat(s.longitude),
                    locationAccuracy: s.location_accuracy,
                    status: s.status,
                    mortalityType: s.mortality_type,
                    notes: s.notes,
                    hasImage: !!s.image_url,
                    imageUrl: s.image_url,
                    thumbnailUrl: s.thumbnail_url || s.image_url,
                    recordedAt: s.recorded_at,
                    synced: true,
                    syncedAt: s.synced_at
                });
            }
        }
        
        return Array.from(merged.values()).sort((a, b) => 
            new Date(b.recordedAt) - new Date(a.recordedAt)
        );
    }
    
    async function loadAnalytics() {
        try {
            UI.initAnalyticsMap();
            const localSightings = await Database.getAllSightings();
            
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            const localStats = {
                total: localSightings.length,
                alive: localSightings.filter(s => s.status === 'alive').length,
                dead: localSightings.filter(s => s.status === 'dead').length,
                recent: localSightings.filter(s => new Date(s.recordedAt) >= weekAgo).length
            };
            
            UI.updateAnalyticsStats(localStats);
            
            const mortalityStats = {};
            localSightings.filter(s => s.status === 'dead' && s.mortalityType)
                .forEach(s => { mortalityStats[s.mortalityType] = (mortalityStats[s.mortalityType] || 0) + 1; });
            
            UI.renderMortalityChart(Object.entries(mortalityStats).map(([code, count]) => ({ code, count })));
            UI.updateMapMarkers(localSightings.map(s => ({ lat: s.latitude, lng: s.longitude, status: s.status })));
            
            if (API.isOnline) {
                try {
                    const [summary, mortality, locations] = await Promise.all([
                        API.getAnalyticsSummary(),
                        API.getMortalityStats(),
                        API.getLocationData()
                    ]);
                    if (summary) UI.updateAnalyticsStats(summary);
                    if (mortality) UI.renderMortalityChart(mortality);
                    if (locations) UI.updateMapMarkers(locations);
                } catch (error) {
                    Config.debug('App', 'Analytics fetch failed:', error.message);
                }
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
            UI.showToast('Failed to load analytics', 'error');
        }
    }
    
    async function handleOnline() {
        UI.updateConnectionStatus(true);
        UI.showToast('Back online! Syncing data...', 'success');
        await handleSync();
        await loadSightings();
    }
    
    function handleOffline() {
        UI.updateConnectionStatus(false);
        UI.showToast('You are offline. Data will sync when connected.', 'warning');
    }
    
    async function handleSync() {
        const pendingCount = await Database.getPendingSyncCount();
        
        if (pendingCount === 0) {
            UI.showToast('All sightings synced', 'info');
            return;
        }
        
        if (!API.isOnline) {
            UI.showToast('Cannot sync while offline', 'warning');
            return;
        }
        
        UI.setSyncing(true);
        
        try {
            const pendingItems = await Database.getPendingSyncs();
            let synced = 0, failed = 0;
            
            for (const item of pendingItems) {
                try {
                    const sighting = await Database.getSighting(item.clientId);
                    if (!sighting) {
                        await Database.removeSyncQueueItem(item.id);
                        continue;
                    }
                    
                    const serverResponse = await API.syncSighting(sighting);
                    await Database.markSynced(item.clientId, serverResponse.id);
                    await Database.removeSyncQueueItem(item.id);
                    synced++;
                } catch (error) {
                    Config.debug('App', 'Sync failed:', item.clientId, error);
                    await Database.incrementSyncAttempt(item.id);
                    failed++;
                }
            }
            
            await updatePendingSyncCount();
            await loadSightings();
            
            if (synced > 0 && failed === 0) UI.showToast(`Synced ${synced} sighting${synced > 1 ? 's' : ''}`, 'success');
            else if (synced > 0 && failed > 0) UI.showToast(`Synced ${synced}, ${failed} failed`, 'warning');
            else if (failed > 0) UI.showToast('Sync failed. Will retry later.', 'error');
        } catch (error) {
            console.error('Sync error:', error);
            UI.showToast('Sync failed', 'error');
        } finally {
            UI.setSyncing(false);
        }
    }
    
    async function handleFilterChange() { await loadSightings(); }
    
    async function handleSightingClick(event) {
        const card = event.target.closest('.sighting-card');
        if (!card) return;
        
        const clientId = card.dataset.clientId;
        
        // First check cached sightings (includes server-only sightings from other devices)
        let sighting = UI.getCachedSighting(clientId);
        
        // If not in cache, try local database
        if (!sighting) {
            sighting = await Database.getSighting(clientId);
        }
        
        if (sighting) {
            // Try to load local image from IndexedDB if available
            if (sighting.hasImage) {
                const blob = await Database.getImage(sighting.clientId);
                if (blob) {
                    // Local image found - use it
                    sighting.imageUrl = URL.createObjectURL(blob);
                }
                // If no local blob, imageUrl should already be set from server
            }
            UI.openSightingModal(sighting);
        }
    }
    
    async function handleCameraCapture() {
        try {
            const file = await Camera.captureFromCamera(UI.elements.photoInput);
            await processSelectedPhoto(file);
        } catch (error) {
            if (error.code !== 'CANCELLED') UI.showToast('Failed to capture photo', 'error');
        }
    }
    
    async function handleGallerySelect() {
        try {
            const file = await Camera.selectFromGallery(UI.elements.photoInput);
            await processSelectedPhoto(file);
        } catch (error) {
            if (error.code !== 'CANCELLED' && error.code !== 'NO_FILE') {
                UI.showToast(error.message || 'Failed to select photo', 'error');
            }
        }
    }
    
    async function processSelectedPhoto(file) {
        const validation = Camera.validateImage(file);
        if (!validation.valid) {
            UI.showToast(validation.error, 'error');
            return;
        }
        
        try {
            currentPhotoBlob = await Camera.processImage(file);
            if (currentPhotoUrl) Camera.revokePreviewUrl(currentPhotoUrl);
            currentPhotoUrl = Camera.createPreviewUrl(currentPhotoBlob);
            UI.updatePhotoPreview(currentPhotoUrl);
            UI.showToast('Photo added', 'success');
        } catch (error) {
            console.error('Photo processing error:', error);
            UI.showToast('Failed to process photo', 'error');
        }
    }
    
    function handleStatusChange(event) {
        UI.showMortalitySection(event.target.value === 'dead');
    }
    
    async function requestLocation() {
        try { await Location.getCurrentPosition(); }
        catch (error) { Config.debug('App', 'Location error:', error.message); }
    }
    
    async function handleFormSubmit(event) {
        event.preventDefault();
        
        const errors = validateForm();
        UI.showFormErrors(errors);
        
        if (Object.keys(errors).length > 0) {
            UI.showToast('Please fix the errors', 'warning');
            return;
        }
        
        UI.setSubmitLoading(true);
        
        try {
            const formData = new FormData(UI.elements.sightingForm);
            
            const sighting = {
                latitude: parseFloat(UI.elements.latitude.value),
                longitude: parseFloat(UI.elements.longitude.value),
                locationAccuracy: parseFloat(UI.elements.locationAccuracy.value) || null,
                status: formData.get('status'),
                mortalityType: formData.get('status') === 'dead' ? formData.get('mortalityType') : null,
                notes: formData.get('notes') || '',
                hasImage: !!currentPhotoBlob,
                recordedAt: new Date().toISOString()
            };
            
            const savedSighting = await Database.saveSighting(sighting);
            
            if (currentPhotoBlob) {
                await Database.saveImage(savedSighting.clientId, currentPhotoBlob);
            }
            
            await Database.addToSyncQueue(savedSighting.clientId, 'create');
            await updatePendingSyncCount();
            
            UI.showToast('Sighting recorded!', 'success');
            handleFormReset();
            
            if (API.isOnline) handleSync();
            
            setTimeout(() => {
                UI.switchView('sightings');
                loadSightings();
            }, 500);
        } catch (error) {
            console.error('Submit error:', error);
            UI.showToast('Failed to save sighting', 'error');
        } finally {
            UI.setSubmitLoading(false);
        }
    }
    
    function validateForm() {
        const errors = {};
        const status = document.querySelector('input[name="status"]:checked');
        
        if (!status) errors.status = true;
        if (status && status.value === 'dead') {
            if (!document.querySelector('input[name="mortalityType"]:checked')) {
                errors.mortality = true;
            }
        }
        if (!UI.elements.latitude.value || !UI.elements.longitude.value) {
            errors.location = 'Location required. Please enable location services.';
        }
        
        return errors;
    }
    
    function handleFormReset() {
        if (currentPhotoUrl) {
            Camera.revokePreviewUrl(currentPhotoUrl);
            currentPhotoUrl = null;
        }
        currentPhotoBlob = null;
        UI.resetForm();
        requestLocation();
    }
    
    async function updatePendingSyncCount() {
        const count = await Database.getPendingSyncCount();
        UI.updatePendingCount(count);
    }
    
    return { init, loadSightings, loadAnalytics, handleSync };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.init);
} else {
    App.init();
}
