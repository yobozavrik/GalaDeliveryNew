// Input validation utilities extracted from app.js

class InputValidator {
    static sanitizeString(str) {
        if (typeof str !== 'string') return '';

        // Enhanced sanitization using DOM API for comprehensive XSS protection
        const temp = document.createElement('div');
        temp.textContent = str;
        let sanitized = temp.innerHTML;

        // Additional safety: remove any remaining dangerous patterns
        sanitized = sanitized
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .replace(/data:text\/html/gi, '')
            .trim();

        return sanitized;
    }

    // Sanitize for different contexts
    static sanitizeHTML(str) {
        if (typeof str !== 'string') return '';
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    static sanitizeURL(url) {
        if (typeof url !== 'string') return '';
        try {
            const parsed = new URL(url, window.location.origin);
            // Only allow http and https protocols
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return '';
            }
            return parsed.href;
        } catch {
            return '';
        }
    }

    static validateProductName(name) {
        const sanitized = this.sanitizeString(name);
        return sanitized.length >= 2 && sanitized.length <= 100;
    }

    static validateQuantity(qty) {
        const num = parseFloat(qty);
        return !isNaN(num) && num > 0 && num <= 10000;
    }

    static validatePrice(price) {
        const num = parseFloat(price);
        return !isNaN(num) && num >= 0 && num <= 100000;
    }

    static validateLocation(location) {
        const sanitized = this.sanitizeString(location);
        return sanitized.length >= 2 && sanitized.length <= 100;
    }

    static validateFile(file) {
        if (!file) return true;
        const maxSize = 10 * 1024 * 1024; // 10MB
        const isImageType = typeof file.type === 'string' && file.type.startsWith('image/');
        const hasImageExtension = typeof file.name === 'string'
            && /\.(apng|avif|bmp|gif|heic|heif|ico|jfif|jpg|jpeg|png|svg|tif|tiff|webp)$/i.test(file.name);
        return file.size <= maxSize && (isImageType || hasImageExtension);
    }
}

export { InputValidator };
