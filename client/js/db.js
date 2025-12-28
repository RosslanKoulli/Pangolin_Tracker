/**
 * ZAP - Pangolin Tracker
 * IndexedDB Database Module
 * 
 * This module provides a Promise-based wrapper around IndexedDB,
 * implementing the offline-first data storage strategy for the PWA.
 * 
 * Architecture Rationale:
 * - IndexedDB was chosen over localStorage because:
 *   1. It supports structured data and indexes (better querying)
 *   2. It can store binary data (images as Blobs)
 *   3. It has much larger storage limits (~50MB+ vs 5-10MB)
 *   4. It supports transactions for data integrity
 * 
 * The module uses a singleton pattern to ensure only one database
 * connection is maintained throughout the application lifecycle.
 */

const Database = (function() {
    // Private variable to hold the database connection
    let db = null;
    
    /**
     * Opens or creates the IndexedDB database
     * Uses versioned schema migration for upgrades
     * 
     * @returns {Promise<IDBDatabase>} The database connection
     */
    async function openDatabase() {
        // Return existing connection if available
        if (db) return db;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(
                Config.DATABASE.NAME,
                Config.DATABASE.VERSION
            );
            
            // Called when database needs to be created or upgraded
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                const oldVersion = event.oldVersion;
                
                Config.debug('Database', `Upgrading from v${oldVersion} to v${Config.DATABASE.VERSION}`);
                
                // Version 1: Initial schema
                if (oldVersion < 1) {
                    // Sightings store - holds all sighting records
                    if (!database.objectStoreNames.contains(Config.DATABASE.STORES.SIGHTINGS)) {
                        const sightingsStore = database.createObjectStore(
                            Config.DATABASE.STORES.SIGHTINGS,
                            { keyPath: 'clientId' }
                        );
                        
                        sightingsStore.createIndex('serverId', 'serverId', { unique: false });
                        sightingsStore.createIndex('status', 'status', { unique: false });
                        sightingsStore.createIndex('recordedAt', 'recordedAt', { unique: false });
                        sightingsStore.createIndex('synced', 'synced', { unique: false });
                        
                        Config.debug('Database', 'Created sightings store');
                    }
                    
                    // Pending sync queue
                    if (!database.objectStoreNames.contains(Config.DATABASE.STORES.PENDING_SYNC)) {
                        const pendingStore = database.createObjectStore(
                            Config.DATABASE.STORES.PENDING_SYNC,
                            { keyPath: 'id', autoIncrement: true }
                        );
                        
                        pendingStore.createIndex('clientId', 'clientId', { unique: false });
                        pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
                        
                        Config.debug('Database', 'Created pending_sync store');
                    }
                    
                    // Cached images store
                    if (!database.objectStoreNames.contains(Config.DATABASE.STORES.CACHED_IMAGES)) {
                        database.createObjectStore(
                            Config.DATABASE.STORES.CACHED_IMAGES,
                            { keyPath: 'clientId' }
                        );
                        
                        Config.debug('Database', 'Created cached_images store');
                    }
                    
                    // Metadata store
                    if (!database.objectStoreNames.contains(Config.DATABASE.STORES.METADATA)) {
                        database.createObjectStore(
                            Config.DATABASE.STORES.METADATA,
                            { keyPath: 'key' }
                        );
                        
                        Config.debug('Database', 'Created metadata store');
                    }
                }
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                
                db.onversionchange = () => {
                    db.close();
                    db = null;
                    Config.debug('Database', 'Database version changed, connection closed');
                };
                
                Config.debug('Database', 'Database opened successfully');
                resolve(db);
            };
            
            request.onerror = (event) => {
                Config.debug('Database', 'Error opening database:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    /**
     * Generic helper to perform a transaction on an object store
     */
    async function withStore(storeName, mode, callback) {
        const database = await openDatabase();
        
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            
            const request = callback(store);
            
            if (request instanceof IDBRequest) {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            }
        });
    }
    
    // ============================================
    // Sightings CRUD Operations
    // ============================================
    
    async function saveSighting(sighting) {
        if (!sighting.clientId) {
            sighting.clientId = generateUUID();
        }
        
        sighting.synced = false;
        sighting.createdAt = new Date().toISOString();
        sighting.updatedAt = new Date().toISOString();
        
        await withStore(Config.DATABASE.STORES.SIGHTINGS, 'readwrite', (store) => {
            return store.put(sighting);
        });
        
        Config.debug('Database', 'Sighting saved:', sighting.clientId);
        return sighting;
    }
    
    async function getAllSightings(options = {}) {
        const database = await openDatabase();
        
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(Config.DATABASE.STORES.SIGHTINGS, 'readonly');
            const store = transaction.objectStore(Config.DATABASE.STORES.SIGHTINGS);
            
            let request;
            
            if (options.status && options.status !== 'all') {
                const index = store.index('status');
                request = index.getAll(options.status);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => {
                let results = request.result;
                
                if (options.syncedOnly !== undefined) {
                    results = results.filter(s => s.synced === options.syncedOnly);
                }
                
                results.sort((a, b) => {
                    return new Date(b.recordedAt) - new Date(a.recordedAt);
                });
                
                resolve(results);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async function getSighting(clientId) {
        return withStore(Config.DATABASE.STORES.SIGHTINGS, 'readonly', (store) => {
            return store.get(clientId);
        });
    }
    
    async function updateSighting(clientId, updates) {
        const sighting = await getSighting(clientId);
        
        if (!sighting) {
            throw new Error(`Sighting not found: ${clientId}`);
        }
        
        const updated = {
            ...sighting,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        await withStore(Config.DATABASE.STORES.SIGHTINGS, 'readwrite', (store) => {
            return store.put(updated);
        });
        
        Config.debug('Database', 'Sighting updated:', clientId);
        return updated;
    }
    
    async function markSynced(clientId, serverId) {
        return updateSighting(clientId, {
            synced: true,
            serverId: serverId,
            syncedAt: new Date().toISOString()
        });
    }
    
    async function deleteSighting(clientId) {
        await withStore(Config.DATABASE.STORES.SIGHTINGS, 'readwrite', (store) => {
            return store.delete(clientId);
        });
        
        await deleteImage(clientId);
        
        Config.debug('Database', 'Sighting deleted:', clientId);
    }
    
    // ============================================
    // Pending Sync Queue Operations
    // ============================================
    
    async function addToSyncQueue(clientId, action = 'create') {
        const queueItem = {
            clientId: clientId,
            action: action,
            createdAt: new Date().toISOString(),
            attempts: 0,
            lastAttempt: null
        };
        
        const id = await withStore(Config.DATABASE.STORES.PENDING_SYNC, 'readwrite', (store) => {
            return store.add(queueItem);
        });
        
        Config.debug('Database', `Added to sync queue: ${clientId} (${action})`);
        return id;
    }
    
    async function getPendingSyncs() {
        return withStore(Config.DATABASE.STORES.PENDING_SYNC, 'readonly', (store) => {
            return store.getAll();
        });
    }
    
    async function getPendingSyncCount() {
        return withStore(Config.DATABASE.STORES.PENDING_SYNC, 'readonly', (store) => {
            return store.count();
        });
    }
    
    async function removeSyncQueueItem(id) {
        await withStore(Config.DATABASE.STORES.PENDING_SYNC, 'readwrite', (store) => {
            return store.delete(id);
        });
        
        Config.debug('Database', 'Removed from sync queue:', id);
    }
    
    async function incrementSyncAttempt(id) {
        const database = await openDatabase();
        
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(Config.DATABASE.STORES.PENDING_SYNC, 'readwrite');
            const store = transaction.objectStore(Config.DATABASE.STORES.PENDING_SYNC);
            
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    item.attempts += 1;
                    item.lastAttempt = new Date().toISOString();
                    store.put(item);
                }
            };
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
    
    // ============================================
    // Image Cache Operations
    // ============================================
    
    async function saveImage(clientId, blob) {
        const imageData = {
            clientId: clientId,
            blob: blob,
            size: blob.size,
            type: blob.type,
            cachedAt: new Date().toISOString()
        };
        
        await withStore(Config.DATABASE.STORES.CACHED_IMAGES, 'readwrite', (store) => {
            return store.put(imageData);
        });
        
        Config.debug('Database', 'Image cached:', clientId, `(${(blob.size / 1024).toFixed(1)} KB)`);
    }
    
    async function getImage(clientId) {
        const imageData = await withStore(Config.DATABASE.STORES.CACHED_IMAGES, 'readonly', (store) => {
            return store.get(clientId);
        });
        
        return imageData ? imageData.blob : null;
    }
    
    async function deleteImage(clientId) {
        await withStore(Config.DATABASE.STORES.CACHED_IMAGES, 'readwrite', (store) => {
            return store.delete(clientId);
        });
    }
    
    // ============================================
    // Metadata Operations
    // ============================================
    
    async function setMetadata(key, value) {
        await withStore(Config.DATABASE.STORES.METADATA, 'readwrite', (store) => {
            return store.put({ key, value, updatedAt: new Date().toISOString() });
        });
    }
    
    async function getMetadata(key) {
        const data = await withStore(Config.DATABASE.STORES.METADATA, 'readonly', (store) => {
            return store.get(key);
        });
        
        return data ? data.value : undefined;
    }
    
    // ============================================
    // Utility Functions
    // ============================================
    
    function generateUUID() {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }
        
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    async function clearAll() {
        const database = await openDatabase();
        const storeNames = Object.values(Config.DATABASE.STORES);
        
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeNames, 'readwrite');
            
            storeNames.forEach(name => {
                transaction.objectStore(name).clear();
            });
            
            transaction.oncomplete = () => {
                Config.debug('Database', 'All stores cleared');
                resolve();
            };
            
            transaction.onerror = () => reject(transaction.error);
        });
    }
    
    async function getStats() {
        const stats = {};
        
        for (const storeName of Object.values(Config.DATABASE.STORES)) {
            const count = await withStore(storeName, 'readonly', (store) => {
                return store.count();
            });
            stats[storeName] = count;
        }
        
        return stats;
    }
    
    // ============================================
    // Public API
    // ============================================
    return {
        open: openDatabase,
        saveSighting,
        getAllSightings,
        getSighting,
        updateSighting,
        markSynced,
        deleteSighting,
        addToSyncQueue,
        getPendingSyncs,
        getPendingSyncCount,
        removeSyncQueueItem,
        incrementSyncAttempt,
        saveImage,
        getImage,
        deleteImage,
        setMetadata,
        getMetadata,
        generateUUID,
        clearAll,
        getStats
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Database;
}
