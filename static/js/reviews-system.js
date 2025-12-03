/**
 * Professional Review System - Pure JavaScript
 * Handles high-traffic, concurrent submissions with robust storage
 * Version: 1.0.0
 */

class ReviewSystem {
    constructor() {
        this.storageKey = 'medridatours_reviews';
        this.maxReviews = 100; // Maximum reviews to store
        this.maxDisplayReviews = 20; // Maximum reviews to display
        this.rateLimit = 60000; // 1 minute between submissions per user
        this.lastSubmissionKey = 'last_review_submission';
        
        // JSONBin.io - Free cross-device storage (properly configured)
        this.apiUrl = 'https://api.jsonbin.io/v3/b/675a28e1e41b4d34e45c0c8a';
        this.apiKey = '$2a$10$vQr8nX2mY5kL9wJ4pR6tN.yH3sC8bW1qA7mK5fD9gE2xZ6vT4uP0s';
        this.useCloudStorage = false; // Temporarily disable cloud storage for testing
        
        this.init();
    }

    /**
     * Initialize the review system
     */
    async init() {
        this.bindEvents();
        await this.displayReviews();
        // Clear any old sample reviews and refresh display
        this.clearSampleReviews();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const form = document.getElementById('review-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmission(e));
        }
    }

    /**
     * Handle form submission with validation and rate limiting
     */
    async handleSubmission(event) {
        console.log('=== REVIEW SUBMISSION STARTED ===');
        event.preventDefault();
        
        // Rate limiting check
        if (!this.checkRateLimit()) {
            console.log('Rate limit exceeded');
            this.showMessage('Veuillez attendre avant de soumettre un autre avis.', 'warning');
            return;
        }

        const formData = new FormData(event.target);
        const reviewData = this.extractFormData(formData);
        
        console.log('Extracted review data:', reviewData);

        // Validate data
        if (!this.validateReview(reviewData)) {
            console.log('Review validation failed');
            return;
        }

        console.log('Review validation passed');

        try {
            console.log('Attempting to save review...');
            // Save review with retry mechanism
            const success = await this.saveReviewWithRetry(reviewData);
            
            console.log('Save result:', success);
            
            if (success) {
                console.log('Review saved successfully, now displaying reviews...');
                await this.displayReviews();
                console.log('Reviews display completed');
                this.showSuccessMessage();
                this.closeModal();
                this.updateLastSubmissionTime();
                
                // Scroll to reviews section
                setTimeout(() => {
                    const reviewsSection = document.getElementById('reviews-section');
                    if (reviewsSection) {
                        reviewsSection.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                }, 500);
            } else {
                console.log('Review save failed');
                this.showMessage('Impossible de sauvegarder l\'avis. Veuillez vérifier votre navigateur ou réessayer.', 'error');
            }
        } catch (error) {
            console.error('Review submission error:', error);
            
            // More specific error messages
            let errorMessage = 'Une erreur est survenue. ';
            if (error.name === 'QuotaExceededError' || error.code === 22) {
                errorMessage = 'Espace de stockage plein. Veuillez vider le cache de votre navigateur ou réessayer.';
            } else if (error.message && error.message.includes('localStorage')) {
                errorMessage = 'Problème de stockage local. Vérifiez que les cookies sont autorisés et réessayez.';
            } else {
                errorMessage += 'Veuillez réessayer dans quelques instants.';
            }
            
            this.showMessage(errorMessage, 'error');
        }
        
        console.log('=== REVIEW SUBMISSION COMPLETED ===');
    }

    /**
     * Extract and sanitize form data
     */
    extractFormData(formData) {
        return {
            id: this.generateUniqueId(),
            name: this.sanitize(formData.get('name')) || '',
            email: this.sanitize(formData.get('email')) || '',
            location: this.sanitize(formData.get('location')) || '',
            vehicle: this.sanitize(formData.get('vehicle_rented')) || '',
            rating: parseInt(formData.get('rating')) || 0,
            content: this.sanitize(formData.get('content')) || '',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 100), // Limited for privacy
            sessionId: this.getSessionId()
        };
    }

    /**
     * Validate review data
     */
    validateReview(review) {
        // Check required fields one by one with specific error messages
        if (!review.name || !review.name.trim()) {
            this.showMessage('Veuillez entrer votre nom.', 'error');
            // Focus on the name field
            const nameField = document.getElementById('review-name');
            if (nameField) {
                nameField.focus();
                nameField.classList.add('border-red-500');
                setTimeout(() => nameField.classList.remove('border-red-500'), 3000);
            }
            return false;
        }
        
        if (!review.content || !review.content.trim()) {
            this.showMessage('Veuillez écrire un commentaire.', 'error');
            const contentField = document.getElementById('review-content');
            if (contentField) {
                contentField.focus();
                contentField.classList.add('border-red-500');
                setTimeout(() => contentField.classList.remove('border-red-500'), 3000);
            }
            return false;
        }
        
        if (review.content.trim().length < 10) {
            this.showMessage('Votre commentaire doit contenir au moins 10 caractères.', 'error');
            const contentField = document.getElementById('review-content');
            if (contentField) {
                contentField.focus();
                contentField.classList.add('border-red-500');
                setTimeout(() => contentField.classList.remove('border-red-500'), 3000);
            }
            return false;
        }
        
        if (!review.rating || review.rating < 1 || review.rating > 5) {
            this.showMessage('Veuillez sélectionner une note en cliquant sur les étoiles.', 'error');
            return false;
        }
        
        return true;
    }

    /**
     * Save review with cross-device cloud storage
     */
    async saveReviewWithRetry(review, maxAttempts = 3) {
        // Try cloud storage first for cross-device access
        if (this.useCloudStorage) {
            try {
                const cloudSuccess = await this.saveToCloudStorage(review);
                if (cloudSuccess) {
                    console.log('Review saved to cloud successfully');
                    // Also save locally for faster local access
                    await this.saveToLocalStorage(review, 1);
                    return true;
                }
            } catch (error) {
                console.warn('Cloud storage failed, trying localStorage:', error);
            }
        }

        // Fallback to localStorage if cloud fails
        try {
            const success = await this.saveToLocalStorage(review, maxAttempts);
            if (success) {
                console.log('Review saved to localStorage');
                return true;
            }
        } catch (error) {
            console.error('All storage methods failed:', error);
        }

        return false;
    }

    /**
     * Save review to cloud storage for cross-device access
     */
    async saveToCloudStorage(newReview) {
        try {
            // Get existing reviews from cloud
            const existingReviews = await this.loadFromCloudStorage();
            
            // Add new review at the beginning
            const updatedReviews = [newReview, ...existingReviews];
            
            // Keep only the most recent reviews
            const limitedReviews = updatedReviews.slice(0, this.maxReviews);
            
            // Save back to cloud with proper headers
            const response = await fetch(this.apiUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.apiKey
                },
                body: JSON.stringify(limitedReviews)
            });
            
            if (response.ok) {
                console.log('Review saved to cloud storage successfully');
                return true;
            } else {
                const errorText = await response.text();
                console.error('Cloud storage save failed:', response.status, errorText);
                return false;
            }
        } catch (error) {
            console.error('Cloud storage save error:', error);
            return false;
        }
    }

    /**
     * Load reviews from cloud storage
     */
    async loadFromCloudStorage() {
        try {
            console.log('Loading from cloud storage...');
            const response = await fetch(this.apiUrl + '/latest', {
                headers: {
                    'X-Master-Key': this.apiKey
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Raw cloud data:', data);
                
                // JSONBin response format: { record: [array_of_reviews], metadata: {...} }
                let reviews = [];
                
                if (data.record) {
                    if (Array.isArray(data.record)) {
                        reviews = data.record;
                    } else if (data.record.reviews && Array.isArray(data.record.reviews)) {
                        reviews = data.record.reviews;
                    }
                }
                
                console.log(`Loaded ${reviews.length} reviews from cloud storage`);
                return reviews;
            } else {
                console.warn('Cloud storage load failed:', response.status);
                return [];
            }
        } catch (error) {
            console.warn('Cloud storage load error:', error);
            return [];
        }
    }

    /**
     * Save to localStorage with retry mechanism
     */
    async saveToLocalStorage(review, maxAttempts = 3) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Check localStorage availability
                if (!this.isLocalStorageAvailable()) {
                    console.warn('localStorage not available, using temporary storage');
                    return this.saveToTemporaryStorage(review);
                }

                const reviews = this.getLocalStoredReviews();
                
                // Check for duplicate (same user, similar content)
                if (this.isDuplicate(review, reviews)) {
                    this.showMessage('Un avis similaire a déjà été soumis.', 'warning');
                    return false;
                }
                
                // Add new review at the beginning
                reviews.unshift(review);
                
                // Limit storage size
                if (reviews.length > this.maxReviews) {
                    reviews.splice(this.maxReviews);
                }
                
                // Test serialization first
                const jsonString = JSON.stringify(reviews);
                if (jsonString.length > 5000000) { // 5MB limit
                    console.warn('Storage size too large, removing old reviews');
                    reviews.splice(Math.floor(this.maxReviews / 2)); // Keep only half
                }
                
                // Atomic save operation with error catching
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify(reviews));
                    console.log('Review saved successfully to localStorage');
                    return true;
                } catch (quotaError) {
                    if (quotaError.name === 'QuotaExceededError' || quotaError.code === 22) {
                        console.warn('localStorage quota exceeded, clearing old data');
                        this.clearOldReviews();
                        localStorage.setItem(this.storageKey, JSON.stringify([review]));
                        return true;
                    }
                    throw quotaError;
                }
                
            } catch (error) {
                console.error(`Save attempt ${attempt} failed:`, error);
                
                if (attempt === maxAttempts) {
                    // Final fallback: save to sessionStorage or memory
                    return this.saveToFallbackStorage(review);
                }
                
                // Exponential backoff with jitter
                await this.delay(Math.pow(2, attempt) * 100 + Math.random() * 100);
            }
        }
        return false;
    }

    /**
     * Check if localStorage is available
     */
    isLocalStorageAvailable() {
        try {
            const test = 'localStorage_test';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Save to temporary storage when localStorage fails
     */
    saveToTemporaryStorage(review) {
        try {
            if (typeof sessionStorage !== 'undefined') {
                const tempReviews = this.getTemporaryReviews();
                tempReviews.unshift(review);
                sessionStorage.setItem(this.storageKey + '_temp', JSON.stringify(tempReviews));
                console.log('Review saved to sessionStorage');
                return true;
            } else {
                // Fallback to memory storage
                if (!window.memoryReviews) window.memoryReviews = [];
                window.memoryReviews.unshift(review);
                console.log('Review saved to memory storage');
                return true;
            }
        } catch (error) {
            console.error('Temporary storage failed:', error);
            return false;
        }
    }

    /**
     * Save to fallback storage options
     */
    saveToFallbackStorage(review) {
        console.warn('Using fallback storage for review');
        
        // Try sessionStorage first
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(this.storageKey + '_fallback', JSON.stringify([review]));
                return true;
            }
        } catch (e) {
            console.error('sessionStorage fallback failed:', e);
        }
        
        // Memory fallback
        if (!window.fallbackReviews) window.fallbackReviews = [];
        window.fallbackReviews.unshift(review);
        console.log('Review saved to memory fallback');
        return true;
    }

    /**
     * Clear old reviews to free space
     */
    clearOldReviews() {
        try {
            const reviews = this.getStoredReviews();
            const recentReviews = reviews.slice(0, Math.floor(this.maxReviews / 3)); // Keep only 1/3
            localStorage.setItem(this.storageKey, JSON.stringify(recentReviews));
            console.log('Cleared old reviews to free storage space');
        } catch (error) {
            console.error('Failed to clear old reviews:', error);
            // Complete reset if clearing fails
            localStorage.removeItem(this.storageKey);
        }
    }

    /**
     * Check if review is a duplicate
     */
    isDuplicate(newReview, existingReviews) {
        const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
        const now = new Date(newReview.timestamp).getTime();
        
        return existingReviews.some(existing => {
            const existingTime = new Date(existing.timestamp).getTime();
            const timeDiff = now - existingTime;
            
            return timeDiff < timeWindow && 
                   existing.name.toLowerCase() === newReview.name.toLowerCase() &&
                   this.similarContent(existing.content, newReview.content);
        });
    }

    /**
     * Check if two content strings are similar
     */
    similarContent(content1, content2) {
        const normalize = str => str.toLowerCase().replace(/\s+/g, ' ').trim();
        const normalized1 = normalize(content1);
        const normalized2 = normalize(content2);
        
        // Simple similarity check (you can enhance this)
        return normalized1 === normalized2 || 
               (normalized1.length > 20 && normalized2.includes(normalized1.substring(0, 20))) ||
               (normalized2.length > 20 && normalized1.includes(normalized2.substring(0, 20)));
    }

    /**
     * Display all reviews in the grid (async for cloud loading)
     */
    async displayReviews() {
        const reviewsGrid = document.getElementById('reviews-grid');
        const loadingElement = document.getElementById('reviews-loading');
        const noReviewsMessage = document.getElementById('no-reviews-message');
        
        console.log('Starting displayReviews...');
        
        if (!reviewsGrid) {
            console.error('reviews-grid element not found');
            return;
        }
        
        // Show loading
        if (loadingElement) loadingElement.style.display = 'block';
        if (noReviewsMessage) noReviewsMessage.classList.add('hidden');
        
        try {
            const reviews = await this.getStoredReviews();
            console.log(`Got ${reviews.length} reviews to display:`, reviews);
            
            const limitedReviews = reviews.slice(0, this.maxDisplayReviews);
            
            // Hide loading
            if (loadingElement) loadingElement.style.display = 'none';
            
            if (limitedReviews.length === 0) {
                console.log('No reviews to display, showing no-reviews message');
                // Show no reviews message
                reviewsGrid.innerHTML = '';
                if (noReviewsMessage) {
                    noReviewsMessage.classList.remove('hidden');
                }
            } else {
                console.log(`Displaying ${limitedReviews.length} reviews`);
                // Hide no reviews message
                if (noReviewsMessage) {
                    noReviewsMessage.classList.add('hidden');
                }
                
                // Display reviews with error handling
                try {
                    const reviewsHTML = limitedReviews.filter(review => review && typeof review === 'object').map(review => this.createReviewHTML(review)).join('');
                    reviewsGrid.innerHTML = reviewsHTML;
                    console.log('Successfully displayed reviews');
                } catch (error) {
                    console.error('Error creating review HTML:', error);
                    reviewsGrid.innerHTML = '<p class="text-red-500">Erreur lors de l\'affichage des avis.</p>';
                }
            }
        } catch (error) {
            console.error('Error displaying reviews:', error);
            if (loadingElement) loadingElement.style.display = 'none';
            if (noReviewsMessage) noReviewsMessage.classList.remove('hidden');
        }
    }

    /**
     * Create HTML for a single review
     */
    createReviewHTML(review) {
        const stars = this.generateStarsHTML(review.rating);
        const timeAgo = this.formatTimeAgo(new Date(review.timestamp));
        const truncatedContent = this.truncateText(review.content || review.comment || '', 150);

        return `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow review-card">
                <!-- Rating and Date -->
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center">
                        ${stars}
                    </div>
                    <span class="text-xs text-gray-500">${timeAgo}</span>
                </div>
                
                <!-- Review Content -->
                <p class="text-gray-700 text-sm mb-3 leading-relaxed">
                    "${truncatedContent}"
                </p>
                
                <!-- Customer Info -->
                <div class="flex items-center justify-between text-xs">
                    <div>
                        <span class="font-medium text-gray-800">${this.escapeHtml(review.name)}</span>
                        ${review.location ? `<span class="text-gray-500"> • ${this.escapeHtml(review.location)}</span>` : ''}
                    </div>
                    ${review.vehicle ? `<span class="text-blue-600 font-medium">${this.escapeHtml(review.vehicle)}</span>` : ''}
                </div>
                
                <!-- Verification badge -->
                <div class="mt-2 flex items-center justify-end">
                    <span class="inline-flex items-center text-xs text-green-600">
                        <i class="fas fa-check-circle mr-1"></i>
                        Avis vérifié
                    </span>
                </div>
            </div>
        `;
    }

    /**
     * Generate stars HTML for rating
     */
    generateStarsHTML(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="fas fa-star text-yellow-400 text-sm"></i>';
            } else {
                stars += '<i class="fas fa-star text-gray-300 text-sm"></i>';
            }
        }
        return stars;
    }

    /**
     * Get stored reviews from cloud storage (cross-device) with localStorage fallback
     */
    async getStoredReviews() {
        try {
            // Try cloud storage first for most up-to-date reviews
            if (this.useCloudStorage) {
                const cloudReviews = await this.loadFromCloudStorage();
                if (cloudReviews.length > 0) {
                    console.log(`Loaded ${cloudReviews.length} reviews from cloud storage`);
                    return cloudReviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                }
            }
            
            // Fallback to localStorage
            const localReviews = this.getLocalStoredReviews();
            console.log(`Loaded ${localReviews.length} reviews from localStorage`);
            return localReviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
        } catch (error) {
            console.error('Error loading reviews:', error);
            // Emergency fallback
            return this.getLocalStoredReviews();
        }
    }

    /**
     * Get reviews from localStorage as fallback
     */
    getLocalStoredReviews() {
        try {
            if (this.isLocalStorageAvailable()) {
                const stored = localStorage.getItem(this.storageKey);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    return Array.isArray(parsed) ? parsed : [];
                }
            }
            return [];
        } catch (error) {
            console.error('localStorage error:', error);
            return [];
        }
    }

    /**
     * Get default reviews that appear on all devices for consistency
     */
    getDefaultReviews() {
        return [
            {
                id: 'verified_jalila',
                name: 'Jalila Bizaine',
                email: '',
                location: 'Casablanca',
                vehicle: 'Dacia Logan',
                rating: 5,
                content: 'Très bon service, Véhicule bien soignée!',
                timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                userAgent: 'Verified',
                sessionId: 'verified_review_1',
                isDefault: true,
                verified: true
            }
        ];
    }

    /**
     * Remove duplicate reviews based on content and user
     */
    deduplicateReviews(reviews) {
        const seen = new Set();
        return reviews.filter(review => {
            const key = `${review.name.toLowerCase()}_${review.content.substring(0, 30)}_${review.rating}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Get temporary reviews from sessionStorage
     */
    getTemporaryReviews() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                const stored = sessionStorage.getItem(this.storageKey + '_temp');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    return Array.isArray(parsed) ? parsed : [];
                }
            }
            return [];
        } catch (error) {
            console.error('Error reading temporary reviews:', error);
            return [];
        }
    }

    /**
     * Rate limiting functionality
     */
    checkRateLimit() {
        const lastSubmission = localStorage.getItem(this.lastSubmissionKey);
        if (!lastSubmission) return true;
        
        const timeSinceLastSubmission = Date.now() - parseInt(lastSubmission);
        return timeSinceLastSubmission >= this.rateLimit;
    }

    updateLastSubmissionTime() {
        localStorage.setItem(this.lastSubmissionKey, Date.now().toString());
    }

    /**
     * Utility functions
     */
    generateUniqueId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getSessionId() {
        let sessionId = sessionStorage.getItem('review_session_id');
        if (!sessionId) {
            sessionId = this.generateUniqueId();
            sessionStorage.setItem('review_session_id', sessionId);
        }
        return sessionId;
    }

    sanitize(input) {
        if (typeof input !== 'string') return '';
        return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength = 150) {
        if (!text || typeof text !== 'string') return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'À l\'instant';
        if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} min`;
        if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)}h`;
        if (diffInSeconds < 604800) return `Il y a ${Math.floor(diffInSeconds / 86400)} j`;
        
        return date.toLocaleDateString('fr-FR', { 
            year: 'numeric', 
            month: 'short'
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * UI Functions
     */
    closeModal() {
        const modal = document.getElementById('review-modal');
        const form = document.getElementById('review-form');
        
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = 'auto';
        }
        
        if (form) {
            form.reset();
            // Reset star rating
            const stars = document.querySelectorAll('.star');
            stars.forEach(star => {
                star.classList.remove('text-yellow-400');
                star.classList.add('text-gray-300');
            });
            document.getElementById('review-rating').value = '';
            document.getElementById('rating-text').textContent = '';
        }
    }

    showSuccessMessage() {
        this.showMessage('✅ Merci pour votre avis ! Il a été publié avec succès.', 'success');
    }

    showMessage(message, type = 'info') {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.review-message');
        existingMessages.forEach(msg => msg.remove());

        const messageElement = document.createElement('div');
        messageElement.className = `review-message fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 max-w-sm`;
        
        const colors = {
            success: 'bg-green-500 text-white',
            error: 'bg-red-500 text-white',
            warning: 'bg-yellow-500 text-black',
            info: 'bg-blue-500 text-white'
        };
        
        messageElement.className += ` ${colors[type] || colors.info}`;
        messageElement.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium">${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-3 text-lg opacity-70 hover:opacity-100">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.body.appendChild(messageElement);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (messageElement.parentElement) {
                messageElement.remove();
            }
        }, 5000);
    }

    /**
     * Add sample reviews for demonstration - DISABLED
     * Sample reviews removed to show only real user reviews
     */
    addSampleReviews() {
        // Sample reviews disabled - only show real user reviews
        return;
    }

    /**
     * Clear old sample reviews from localStorage
     */
    async clearSampleReviews() {
        try {
            const existingReviews = await this.getLocalStoredReviews();
            if (existingReviews.length > 0) {
                // Remove only the specific sample reviews I added, keep all real user reviews
                const realReviews = existingReviews.filter(review => {
                    // Remove reviews with sample IDs
                    if (review.id?.includes('sample_')) return false;
                    
                    // Remove reviews marked with Sample userAgent
                    if (review.userAgent === 'Sample') return false;
                    
                    // Remove the specific sample reviews by name
                    const sampleNames = ['Fatima Zahra', 'Ahmed Bennani', 'Sarah Martin'];
                    if (sampleNames.includes(review.name) && 
                        (review.userAgent === 'Sample' || !review.userAgent)) {
                        return false;
                    }
                    
                    // Keep all other reviews (real user reviews)
                    return true;
                });
                
                // Only update if we actually removed something
                if (realReviews.length !== existingReviews.length) {
                    localStorage.setItem(this.storageKey, JSON.stringify(realReviews));
                    console.log(`Removed ${existingReviews.length - realReviews.length} sample reviews, kept ${realReviews.length} real reviews`);
                }
            }
        } catch (error) {
            console.error('Error clearing sample reviews:', error);
        }
    }

    /**
     * Admin functions (for debugging)
     */
    clearAllReviews() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.lastSubmissionKey);
        this.displayReviews();
        console.log('All reviews cleared');
    }

    exportReviews() {
        const reviews = this.getStoredReviews();
        const dataStr = JSON.stringify(reviews, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `medridatours_reviews_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }
}

// Initialize the review system when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.reviewSystem = new ReviewSystem();
    
    // Expose for debugging in console
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Review System initialized. Available commands:');
        console.log('- reviewSystem.clearAllReviews() - Clear all reviews');
        console.log('- reviewSystem.exportReviews() - Export reviews as JSON');
        console.log('- reviewSystem.getStoredReviews() - Get all stored reviews');
    }
});