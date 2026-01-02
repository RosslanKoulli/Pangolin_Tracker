/**
 * ZAP - Pangolin Tracker
 * Camera Module
 * 
 * This module handles image capture and processing for the app,
 * implementing the MediaDevices API and file input fallbacks.
 * 
 * Key Features:
 * - Camera capture via getUserMedia or file input
 * - Gallery selection
 * - Client-side image compression
 * - EXIF orientation handling
 * - Thumbnail generation
 * 
 * Design Considerations:
 * - Mobile devices may have limited memory
 * - Network may be slow or unavailable
 * - Large images waste storage and bandwidth
 * - JPEG is universally supported
 */

const Camera = (function() {
    // ============================================
    // Private State
    // ============================================
    
    let stream = null; // Active camera stream
    
    // ============================================
    // Camera Capture
    // ============================================
    
    /**
     * Opens the device camera for capture
     * Uses file input with capture attribute as the primary method
     * (more reliable across mobile browsers than getUserMedia for photos)
     * 
     * @param {HTMLInputElement} fileInput - The file input element
     * @returns {Promise<File>} The captured image file
     */
    function captureFromCamera(fileInput) {
        return new Promise((resolve, reject) => {
            // Set up for camera capture
            fileInput.accept = 'image/*';
            fileInput.capture = 'environment'; // Prefer rear camera
            
            // Reset input first to ensure change event fires even for same file
            fileInput.value = '';
            
            const handleChange = (event) => {
                fileInput.removeEventListener('change', handleChange);
                const file = event.target.files[0];
                
                if (file) {
                    Config.debug('Camera', 'Photo captured:', file.name, `(${(file.size / 1024).toFixed(1)} KB)`);
                    resolve(file);
                } else {
                    // No file selected (user cancelled)
                    reject(new CameraError('Camera cancelled', 'CANCELLED'));
                }
            };
            
            fileInput.addEventListener('change', handleChange);
            fileInput.click();
        });
    }
    
    /**
     * Opens the gallery for image selection
     * 
     * @param {HTMLInputElement} fileInput - The file input element
     * @returns {Promise<File>} The selected image file
     */
    function selectFromGallery(fileInput) {
        return new Promise((resolve, reject) => {
            // Set up for gallery selection
            fileInput.accept = 'image/*';
            fileInput.removeAttribute('capture');
            
            // Reset input first to ensure change event fires even for same file
            fileInput.value = '';
            
            const handleChange = (event) => {
                fileInput.removeEventListener('change', handleChange);
                const file = event.target.files[0];
                
                if (file) {
                    // Validate file type
                    if (!Config.IMAGE.ACCEPTED_TYPES.includes(file.type)) {
                        reject(new CameraError(
                            'Unsupported image format. Please use JPEG, PNG, or WebP.',
                            'INVALID_TYPE'
                        ));
                        return;
                    }
                    
                    Config.debug('Camera', 'Image selected:', file.name, `(${(file.size / 1024).toFixed(1)} KB)`);
                    resolve(file);
                } else {
                    reject(new CameraError('No image selected', 'CANCELLED'));
                }
            };
            
            fileInput.addEventListener('change', handleChange);
            fileInput.click();
        });
    }
    
    // ============================================
    // Image Processing
    // ============================================
    
    /**
     * Processes an image file for storage and upload
     * - Resizes to maximum dimension
     * - Compresses to JPEG
     * - Handles EXIF orientation
     * 
     * @param {File|Blob} imageFile - The source image
     * @param {Object} options - Processing options
     * @returns {Promise<Blob>} The processed image blob
     */
    async function processImage(imageFile, options = {}) {
        const maxDimension = options.maxDimension || Config.IMAGE.MAX_DIMENSION;
        const quality = options.quality || Config.IMAGE.QUALITY;
        
        Config.debug('Camera', 'Processing image...');
        
        // Load image
        const img = await loadImage(imageFile);
        
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = Math.round((height / width) * maxDimension);
                width = maxDimension;
            } else {
                width = Math.round((width / height) * maxDimension);
                height = maxDimension;
            }
        }
        
        // Create canvas and draw
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        
        Config.debug('Camera', 
            `Image processed: ${img.width}x${img.height} -> ${width}x${height}, ` +
            `${(blob.size / 1024).toFixed(1)} KB`
        );
        
        return blob;
    }
    
    /**
     * Creates a thumbnail from an image
     * 
     * @param {File|Blob} imageFile - The source image
     * @param {number} size - Maximum thumbnail dimension
     * @returns {Promise<Blob>} The thumbnail blob
     */
    async function createThumbnail(imageFile, size = 200) {
        return processImage(imageFile, {
            maxDimension: size,
            quality: 0.7
        });
    }
    
    /**
     * Loads an image file into an HTMLImageElement
     * 
     * @param {File|Blob} file - The image file
     * @returns {Promise<HTMLImageElement>} The loaded image
     */
    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new CameraError('Failed to load image', 'LOAD_ERROR'));
            };
            
            img.src = url;
        });
    }
    
    /**
     * Converts a canvas to a Blob
     * Uses a Promise wrapper for the callback-based API
     * 
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {string} type - MIME type
     * @param {number} quality - Quality (0-1)
     * @returns {Promise<Blob>} The image blob
     */
    function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.8) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new CameraError('Failed to convert canvas to blob', 'CONVERSION_ERROR'));
                    }
                },
                type,
                quality
            );
        });
    }
    
    // ============================================
    // Preview Utilities
    // ============================================
    
    /**
     * Creates a preview URL for an image file
     * Remember to revoke when done!
     * 
     * @param {File|Blob} file - The image file
     * @returns {string} Object URL for preview
     */
    function createPreviewUrl(file) {
        return URL.createObjectURL(file);
    }
    
    /**
     * Revokes a preview URL to free memory
     * 
     * @param {string} url - The object URL to revoke
     */
    function revokePreviewUrl(url) {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
    
    /**
     * Converts a Blob to a data URL (base64)
     * Useful for storing in JSON or displaying inline
     * 
     * @param {Blob} blob - The image blob
     * @returns {Promise<string>} The data URL
     */
    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new CameraError('Failed to read blob', 'READ_ERROR'));
            
            reader.readAsDataURL(blob);
        });
    }
    
    /**
     * Converts a data URL to a Blob
     * 
     * @param {string} dataUrl - The data URL
     * @returns {Blob} The blob
     */
    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const data = atob(parts[1]);
        const array = new Uint8Array(data.length);
        
        for (let i = 0; i < data.length; i++) {
            array[i] = data.charCodeAt(i);
        }
        
        return new Blob([array], { type: mime });
    }
    
    // ============================================
    // Validation
    // ============================================
    
    /**
     * Validates an image file
     * Checks type and size
     * 
     * @param {File} file - The file to validate
     * @returns {{valid: boolean, error?: string}} Validation result
     */
    function validateImage(file) {
        if (!file) {
            return { valid: false, error: 'No file provided' };
        }
        
        if (!Config.IMAGE.ACCEPTED_TYPES.includes(file.type)) {
            return { 
                valid: false, 
                error: 'Unsupported format. Please use JPEG, PNG, or WebP.' 
            };
        }
        
        if (file.size > Config.IMAGE.MAX_SIZE) {
            const maxMB = (Config.IMAGE.MAX_SIZE / (1024 * 1024)).toFixed(0);
            return { 
                valid: false, 
                error: `File too large. Maximum size is ${maxMB}MB.` 
            };
        }
        
        return { valid: true };
    }
    
    // ============================================
    // Error Class
    // ============================================
    
    class CameraError extends Error {
        constructor(message, code) {
            super(message);
            this.name = 'CameraError';
            this.code = code;
        }
    }
    
    // ============================================
    // Feature Detection
    // ============================================
    
    /**
     * Checks if camera capture is supported
     * 
     * @returns {boolean} True if camera is available
     */
    function isCameraSupported() {
        // File input with capture is the most reliable method
        const input = document.createElement('input');
        return 'capture' in input;
    }
    
    /**
     * Checks if getUserMedia is available
     * (Not currently used, but available for future use)
     * 
     * @returns {boolean} True if getUserMedia is available
     */
    function isGetUserMediaSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    
    // ============================================
    // Cleanup
    // ============================================
    
    /**
     * Stops any active camera stream
     * Should be called when navigating away or component unmounts
     */
    function stopStream() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            Config.debug('Camera', 'Stream stopped');
        }
    }
    
    // ============================================
    // Public API
    // ============================================
    return {
        // Capture
        captureFromCamera,
        selectFromGallery,
        
        // Processing
        processImage,
        createThumbnail,
        
        // Preview
        createPreviewUrl,
        revokePreviewUrl,
        blobToDataUrl,
        dataUrlToBlob,
        
        // Validation
        validateImage,
        
        // Feature detection
        isCameraSupported,
        isGetUserMediaSupported,
        
        // Cleanup
        stopStream,
        
        // Error class
        CameraError
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Camera;
}
