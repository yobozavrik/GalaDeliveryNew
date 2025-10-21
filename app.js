// Optimized and secured GalaBaluvanaDelivery App
'use strict';

// ============================================
// GLOBAL ERROR HANDLING
// ============================================
window.addEventListener('error', (event) => {
    console.error('[Global Error]', event.error);
    // В production можно отправлять на сервер логирования
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise]', event.reason);
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Debounce function to limit function calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Event Manager for cleanup
class EventManager {
    constructor() {
        this.listeners = [];
    }

    add(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler);
        this.listeners.push({ element, event, handler });
    }

    cleanup() {
        this.listeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.listeners = [];
    }

    remove(element, event) {
        this.listeners = this.listeners.filter(listener => {
            if (listener.element === element && listener.event === event) {
                element?.removeEventListener(event, listener.handler);
                return false;
            }
            return true;
        });
    }
}

// ============================================
// SECURITY: Input Validation
// ============================================
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

// ============================================
// CONFIGURATION
// ============================================
class SecureConfig {
    constructor() {
        this.mode = this.getInitialMode();
        this.N8N_WEBHOOK_URL = this.resolveWebhookUrl();
        // SECURITY: API key moved to server-side proxy
        // Use /api/gemini endpoint instead of direct API calls
        this.GEMINI_API_URL = '/api/gemini';
    }

    getInitialMode() {
        try {
            const storedMode = localStorage.getItem('app_mode');
            // Если режим не сохранён, по умолчанию используем тестовый
            return storedMode || 'test';
        } catch (error) {
            console.warn('Cannot read mode from localStorage', error);
            return 'test';
        }
    }

    resolveWebhookUrl() {
        // Для локальной разработки всегда используем прямой URL к n8n
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            // На localhost всегда используем прямой URL к n8n (тестовый или продакшн)
            return this.isTestMode
                ? 'https://n8n.dmytrotovstytskyi.online/webhook-test/deliverygb'
                : 'https://n8n.dmytrotovstytskyi.online/webhook/deliverygb';
        }

        // На Vercel используем proxy для продакшн, прямой URL для тестов
        const productionUrl = '/api/delivery';
        const testUrl = 'https://n8n.dmytrotovstytskyi.online/webhook-test/deliverygb';
        return this.isTestMode ? testUrl : productionUrl;
    }

    setMode(mode) {
        const normalized = mode === 'test' ? 'test' : 'production';
        this.mode = normalized;

        try {
            localStorage.setItem('app_mode', normalized);
        } catch (error) {
            console.warn('Cannot save mode to localStorage', error);
        }

        this.N8N_WEBHOOK_URL = this.resolveWebhookUrl();
        console.log(`🔁 Mode changed to ${this.isTestMode ? 'test' : 'production'}, webhook:`, this.N8N_WEBHOOK_URL);
        return this.N8N_WEBHOOK_URL;
    }

    toggleMode() {
        return this.setMode(this.isTestMode ? 'production' : 'test');
    }

    get isTestMode() {
        return this.mode === 'test';
    }

    get units() {
        return [
            { value: 'kg', label: 'кг' },
            { value: 'piece', label: 'шт' },
            { value: 'pack', label: 'упаковка' },
            { value: 'box', label: 'ящик' },
            { value: 'bunch', label: 'пучок' },
            { value: 'other', label: 'інше' }
        ];
    }

    get marketLocations() {
        return [
            'Калинівський ринок',
            'Зелений ринок',
            'Метро',
            'Склад овочевий',
            'Склад сировини "Трембіта"',
            'Інше'
        ];
    }

    get unloadingLocations() {
        return [
            'Героїв Майдану',
            'Ентузіастів',
            'Бульвар',
            'Гравітон',
            'Садова',
            'Флоріда',
            'Ентузіастів 2 поверх',
            'Піцерія',
            'Руська',
            'Склад овочевий',
            'Склад сировини "Трембіта"',
            'Склад№2',
            'Інше'
        ];
    }

    get deliveryLocations() {
        return this.unloadingLocations;
    }

    get products() {
        return [
            'Картопля', 'Цибуля', 'Цибуля синя', 'Капуста', 'Морква', 'Буряк', 'Гриби', 'Помідори',
            'Банан', 'Часник', 'Перець', 'Кабачки', 'Баклажан', 'Лимон',
            'Майонез євро 0,520 грам', 'Майонез щедро провансаль 0,550 грам',
            'Майонез столичний 0,550 грам', 'Гарам', 'Сухарі', 'Крекер з цибулею 0,180 грам',
            'Гірчиця американська 0,130 грам', 'Сирки ферма', 'Згущене молоко', 'Мак', 'Томатна паста',
            'Кава', 'Вершки', 'Висівки', 'Мед', 'Дріжджі сухі 0,042 грам', 'Дріжджі 0,1 грам',
            'Хмелі сунелі', 'Оливки', 'Кукурудза', 'Печево топлене молоко', 'Печево Марія',
            'Горгонзола сир', 'Лавровий лист', 'Суха гірчиця', 'Паприка копчена', 'Лимонний сік',
            'Капустка квашена'
        ];
    }

    get warehouseProducts() {
        return ['Картопля', 'Капуста', 'Капустка квашена'];
    }

    get warehouseSources() {
        return [
            'Склад овочевий',
            'Склад сировини "Трембіта"',
            'Склад№2'
        ];
    }

    isWarehouseProduct(productName) {
        return this.warehouseProducts.includes(productName);
    }
}

// ============================================
// STATE MANAGEMENT
// ============================================
class AppState {
    constructor() {
        this.screen = 'main';
        this.tab = 'purchases';
        this.isUnloading = false;
        this.isDelivery = false;
        this.selectedStore = null; // Для хранения выбранного магазина
        this.batchItems = []; // Для хранения списка товаров перед отправкой
        this.editingItemId = null; // ID товару, що редагується
    }

    addBatchItem(item) {
        if (this.batchItems.length >= 20) {
            throw new Error('Максимум 20 товарів в одній заявці');
        }
        this.batchItems.push(item);
    }

    removeBatchItem(index) {
        this.batchItems.splice(index, 1);
    }

    clearBatch() {
        this.batchItems = [];
    }

    getBatchCount() {
        return this.batchItems.length;
    }

    setScreen(screen, options = {}) {
        this.screen = screen;
        if (options.isUnloading !== undefined) this.isUnloading = options.isUnloading;
        if (options.isDelivery !== undefined) this.isDelivery = options.isDelivery;
        this.updateUI();
    }

    setTab(tab) {
        this.tab = tab;
        this.updateUI();
    }

    updateUI() {
        requestAnimationFrame(() => {
            const screens = {
                main: document.getElementById('mainScreen'),
                'purchase-form': document.getElementById('purchaseFormScreen'),
                'store-selection': document.getElementById('storeSelectionScreen'),
                'drafts-list': document.getElementById('draftsListScreen'),
                'draft-view': document.getElementById('draftViewScreen'),
                'purchase-location-selection': document.getElementById('purchaseLocationSelectionScreen'),
                'purchase-drafts-list': document.getElementById('purchaseDraftsListScreen'),
                'purchase-draft-view': document.getElementById('purchaseDraftViewScreen'),
                'metro-method-selection': document.getElementById('metroMethodSelectionScreen'),
                'receipt-scan': document.getElementById('receiptScanScreen'),
                'recognized-items': document.getElementById('recognizedItemsScreen')
            };

            Object.keys(screens).forEach(key => {
                if (screens[key]) {
                    screens[key].style.display = this.screen === key ? 'block' : 'none';
                }
            });

            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            const activeTab = document.getElementById(`${this.tab}Tab`);
            if (activeTab) activeTab.style.display = 'block';

            document.querySelectorAll('.nav-button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === this.tab);
            });

            this.updateHeader();
            const showNav = this.screen === 'main';
            const bottomNav = document.getElementById('bottomNavigation');
            if (bottomNav) bottomNav.style.display = showNav ? 'flex' : 'none';
        });
    }

    updateHeader() {
        const backButton = document.getElementById('backButton');
        const headerTitle = document.getElementById('headerTitle');

        if (!backButton || !headerTitle) return;

        const screenTitles = {
            'purchase-form': () => {
                if (this.isUnloading && this.selectedStore) {
                    return `Відвантаження → ${this.selectedStore}`;
                }
                if (!this.isUnloading && !this.isDelivery && this.selectedStore) {
                    return `Закупка → ${this.selectedStore}`;
                }
                return this.isUnloading ? 'Відвантаження' :
                       this.isDelivery ? 'Доставка' : 'Нова закупівля';
            },
            'store-selection': () => 'Оберіть магазин',
            'drafts-list': () => 'Чернетки відвантаження',
            'draft-view': () => this.selectedStore ? `Чернетка: ${this.selectedStore}` : 'Чернетка',
            'purchase-location-selection': () => 'Оберіть локацію закупки',
            'purchase-drafts-list': () => 'Чернетки закупок',
            'purchase-draft-view': () => this.selectedStore ? `Закупка: ${this.selectedStore}` : 'Чернетка закупки'
        };

        if (screenTitles[this.screen]) {
            backButton.style.display = 'flex';
            headerTitle.textContent = screenTitles[this.screen]();
        } else {
            backButton.style.display = 'none';
            headerTitle.textContent = 'Облік закупівель';
        }
    }
}

// ============================================
// STORAGE MANAGER - ВИКОРИСТОВУЄМО localStorage!
// ============================================
class SecureStorageManager {
    static async getHistoryItems() {
        try {
            const items = await IndexedDBManager.getHistory();
            return items.filter(item => this.validateHistoryItem(item));
        } catch (error) {
            console.error('Error reading from storage:', error);
            return [];
        }
    }

    static validateHistoryItem(item) {
        return item && typeof item === 'object'
            && typeof item.id === 'string'
            && typeof item.productName === 'string'
            && typeof item.quantity === 'number'
            && typeof item.type === 'string';
    }

    static async addToHistory(item) {
        try {
            if (!this.validateHistoryItem(item)) {
                throw new Error('Invalid history item');
            }

            await IndexedDBManager.addToHistory(item);
            return true;
        } catch (error) {
            console.error('Error adding to history:', error);
            return false;
        }
    }

    static async clearHistory() {
        try {
            await IndexedDBManager.clearHistory();
            return true;
        } catch (error) {
            console.error('Error clearing history:', error);
            return false;
        }
    }
}

// ============================================
// DRAFT MANAGER - Менеджер чернеток відвантаження
// ============================================
class DraftManager {
    static async getDraft(storeName) {
        try {
            const draft = await IndexedDBManager.get('drafts', storeName);
            return draft || { storeName, items: [], createdAt: new Date().toISOString() };
        } catch (error) {
            console.error('Error reading draft:', error);
            return { storeName, items: [], createdAt: new Date().toISOString() };
        }
    }

    static async addItemToDraft(storeName, item) {
        const draft = await this.getDraft(storeName);

        if (draft.items.length >= 20) {
            throw new Error('Максимум 20 товарів в одній заявці');
        }

        draft.items.push(item);
        draft.updatedAt = new Date().toISOString();
        draft.storeName = storeName;

        await IndexedDBManager.put('drafts', draft);
        await IndexedDBManager.logAction('add_draft_item', `${storeName}: ${item.productName}`);

        return draft;
    }

    static async removeItemFromDraft(storeName, itemId) {
        const draft = await this.getDraft(storeName);

        if (!draft || !draft.items) return null;

        draft.items = draft.items.filter(item => item.id !== itemId);
        draft.updatedAt = new Date().toISOString();

        if (draft.items.length === 0) {
            await IndexedDBManager.delete('drafts', storeName);
            await IndexedDBManager.logAction('delete_empty_draft', storeName);
        } else {
            await IndexedDBManager.put('drafts', draft);
            await IndexedDBManager.logAction('remove_draft_item', `${storeName}: item ${itemId}`);
        }

        return draft;
    }

    static async updateItemInDraft(storeName, itemId, updatedItem) {
        const draft = await this.getDraft(storeName);

        if (!draft || !draft.items) return null;

        const itemIndex = draft.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) return null;

        // Зберігаємо оригінальний ID та timestamp створення
        updatedItem.id = itemId;
        updatedItem.timestamp = draft.items[itemIndex].timestamp;
        updatedItem.updatedAt = new Date().toISOString();

        draft.items[itemIndex] = updatedItem;
        draft.updatedAt = new Date().toISOString();

        await IndexedDBManager.put('drafts', draft);
        await IndexedDBManager.logAction('update_draft_item', `${storeName}: ${updatedItem.productName}`);

        return draft;
    }

    static async deleteDraft(storeName) {
        await IndexedDBManager.delete('drafts', storeName);
        await IndexedDBManager.logAction('delete_draft', storeName);
    }

    static async getAllDraftsArray() {
        const drafts = await IndexedDBManager.getAll('drafts');
        return drafts.map(draft => ({
            storeName: draft.storeName,
            itemCount: draft.items.length,
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt || draft.createdAt
        }));
    }
}

// ============================================
// PURCHASE DRAFT MANAGER - Менеджер чернеток закупок
// ============================================
class PurchaseDraftManager {
    static async getDraft(locationName) {
        try {
            const draft = await IndexedDBManager.get('purchaseDrafts', locationName);
            return draft || { locationName, items: [], createdAt: new Date().toISOString() };
        } catch (error) {
            console.error('Error reading purchase draft:', error);
            return { locationName, items: [], createdAt: new Date().toISOString() };
        }
    }

    static async addItemToDraft(locationName, item) {
        try {
            const draft = await this.getDraft(locationName);

            if (draft.items.length >= 20) {
                throw new Error('Максимум 20 товарів в одній заявці');
            }

            draft.items.push(item);
            draft.updatedAt = new Date().toISOString();
            draft.locationName = locationName;

            await IndexedDBManager.put('purchaseDrafts', draft);
            await IndexedDBManager.logAction('add_purchase_draft_item', `${locationName}: ${item.productName}`);

            return draft;
        } catch (error) {
            console.error('Error adding item to purchase draft:', error);
            throw error;
        }
    }

    static async removeItemFromDraft(locationName, itemId) {
        try {
            const draft = await this.getDraft(locationName);

            if (!draft || draft.items.length === 0) return null;

            draft.items = draft.items.filter(item => item.id !== itemId);
            draft.updatedAt = new Date().toISOString();

            if (draft.items.length === 0) {
                await IndexedDBManager.delete('purchaseDrafts', locationName);
                await IndexedDBManager.logAction('delete_empty_purchase_draft', locationName);
                return null;
            }

            await IndexedDBManager.put('purchaseDrafts', draft);
            await IndexedDBManager.logAction('remove_purchase_draft_item', `${locationName}: ${itemId}`);

            return draft;
        } catch (error) {
            console.error('Error removing item from purchase draft:', error);
            throw error;
        }
    }

    static async updateItemInDraft(locationName, itemId, updatedItem) {
        try {
            const draft = await this.getDraft(locationName);

            if (!draft || draft.items.length === 0) return null;

            const itemIndex = draft.items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) return null;

            // Зберігаємо оригінальний ID та timestamp створення
            updatedItem.id = itemId;
            updatedItem.timestamp = draft.items[itemIndex].timestamp;
            updatedItem.updatedAt = new Date().toISOString();

            draft.items[itemIndex] = updatedItem;
            draft.updatedAt = new Date().toISOString();

            await IndexedDBManager.put('purchaseDrafts', draft);
            await IndexedDBManager.logAction('update_purchase_draft_item', `${locationName}: ${itemId}`);

            return draft;
        } catch (error) {
            console.error('Error updating item in purchase draft:', error);
            throw error;
        }
    }

    static async deleteDraft(locationName) {
        try {
            await IndexedDBManager.delete('purchaseDrafts', locationName);
            await IndexedDBManager.logAction('delete_purchase_draft', locationName);
        } catch (error) {
            console.error('Error deleting purchase draft:', error);
            throw error;
        }
    }

    static async getAllDraftsArray() {
        try {
            const drafts = await IndexedDBManager.getAll('purchaseDrafts');
            return drafts.map(draft => ({
                locationName: draft.locationName,
                itemCount: draft.items.length,
                createdAt: draft.createdAt,
                updatedAt: draft.updatedAt || draft.createdAt
            }));
        } catch (error) {
            console.error('Error getting all purchase drafts:', error);
            return [];
        }
    }
}

// ============================================
// INVENTORY MANAGER - Учет остатков товаров
// ============================================
class InventoryManager {
    static async getStock(productName, unit) {
        try {
            const key = `${productName}_${unit}`;
            const stock = await IndexedDBManager.get('inventory', key);
            return stock || { key, productName, quantity: 0, unit, lastUpdated: new Date().toISOString() };
        } catch (error) {
            console.error('Error reading stock:', error);
            return { key: `${productName}_${unit}`, productName, quantity: 0, unit, lastUpdated: new Date().toISOString() };
        }
    }

    static async addStock(productName, quantity, unit) {
        try {
            const key = `${productName}_${unit}`;
            const stock = await this.getStock(productName, unit);

            stock.quantity += quantity;
            stock.lastUpdated = new Date().toISOString();

            await IndexedDBManager.put('inventory', stock);
            await IndexedDBManager.logAction('add_stock', `${productName} +${quantity} ${unit}`);

            return stock.quantity;
        } catch (error) {
            console.error('Error adding stock:', error);
            throw error;
        }
    }

    static async removeStock(productName, quantity, unit) {
        try {
            const key = `${productName}_${unit}`;
            const stock = await this.getStock(productName, unit);

            stock.quantity -= quantity;
            if (stock.quantity < 0) {
                stock.quantity = 0;
            }
            stock.lastUpdated = new Date().toISOString();

            await IndexedDBManager.put('inventory', stock);
            await IndexedDBManager.logAction('remove_stock', `${productName} -${quantity} ${unit}`);

            return stock.quantity;
        } catch (error) {
            console.error('Error removing stock:', error);
            throw error;
        }
    }

    static async checkAvailability(productName, quantity, unit) {
        try {
            // Для складских товаров всегда true
            if (config.isWarehouseProduct(productName)) {
                return { available: true, stock: 0 };
            }

            const stock = await this.getStock(productName, unit);
            const available = stock.quantity >= quantity;

            return {
                available: available,
                stock: stock.quantity,
                requested: quantity,
                shortage: available ? 0 : (quantity - stock.quantity)
            };
        } catch (error) {
            console.error('Error checking availability:', error);
            return { available: false, stock: 0, requested: quantity, shortage: quantity };
        }
    }

    static async getAllStock() {
        try {
            return await IndexedDBManager.getAll('inventory');
        } catch (error) {
            console.error('Error getting all stock:', error);
            return [];
        }
    }

    static async clearDailyStock() {
        try {
            await IndexedDBManager.clear('inventory');
            await IndexedDBManager.logAction('clear_inventory', 'Daily inventory cleared');
            console.log('✅ Daily inventory cleared');
            return true;
        } catch (error) {
            console.error('Error clearing inventory:', error);
            return false;
        }
    }
}

// ============================================
// SKELETON LOADER - Loading states
// ============================================
class SkeletonLoader {
    static createDraftCardSkeleton() {
        const card = document.createElement('div');
        card.className = 'skeleton-draft-card';

        const info = document.createElement('div');
        info.className = 'skeleton-draft-card-info';

        const title = document.createElement('div');
        title.className = 'skeleton-draft-card-title';

        const count = document.createElement('div');
        count.className = 'skeleton-draft-card-count';

        info.appendChild(title);
        info.appendChild(count);

        const actions = document.createElement('div');
        actions.className = 'skeleton-draft-card-actions';

        const btn1 = document.createElement('div');
        btn1.className = 'skeleton-button';

        const btn2 = document.createElement('div');
        btn2.className = 'skeleton-button';

        actions.appendChild(btn1);
        actions.appendChild(btn2);

        card.appendChild(info);
        card.appendChild(actions);

        return card;
    }

    static createDraftItemSkeleton() {
        const item = document.createElement('div');
        item.className = 'skeleton-draft-item';

        const info = document.createElement('div');
        info.className = 'skeleton-draft-item-info';

        const name = document.createElement('div');
        name.className = 'skeleton-draft-item-name';

        const details = document.createElement('div');
        details.className = 'skeleton-draft-item-details';

        info.appendChild(name);
        info.appendChild(details);

        item.appendChild(info);

        return item;
    }

    static createHistoryItemSkeleton() {
        const item = document.createElement('div');
        item.className = 'skeleton-history-item';

        const header = document.createElement('div');
        header.className = 'skeleton-history-item-header';

        const title = document.createElement('div');
        title.className = 'skeleton-history-item-title';

        const time = document.createElement('div');
        time.className = 'skeleton-history-item-time';

        header.appendChild(title);
        header.appendChild(time);

        const details = document.createElement('div');
        details.className = 'skeleton-history-item-details';

        item.appendChild(header);
        item.appendChild(details);

        return item;
    }

    static showDraftsSkeleton(container, count = 3) {
        container.innerHTML = '';
        container.style.display = 'flex';

        for (let i = 0; i < count; i++) {
            container.appendChild(this.createDraftCardSkeleton());
        }
    }

    static showDraftItemsSkeleton(container, count = 5) {
        container.innerHTML = '';
        container.style.display = 'flex';

        for (let i = 0; i < count; i++) {
            container.appendChild(this.createDraftItemSkeleton());
        }
    }

    static showHistorySkeleton(container, count = 10) {
        container.innerHTML = '';
        container.style.display = 'block';

        for (let i = 0; i < count; i++) {
            container.appendChild(this.createHistoryItemSkeleton());
        }
    }

    static hide(container) {
        const skeletons = container.querySelectorAll('[class^="skeleton-"]');
        skeletons.forEach(skeleton => skeleton.remove());
    }
}

// ============================================
// ANIMATION MANAGER - Screen transitions
// ============================================
class AnimationManager {
    static animateScreenTransition(fromScreen, toScreen, isBack = false) {
        return new Promise((resolve) => {
            if (!fromScreen || !toScreen) {
                resolve();
                return;
            }

            // Add exit animation to current screen
            const exitClass = isBack ? 'screen-exit-back' : 'screen-exit';
            fromScreen.classList.add(exitClass);

            // Wait for exit animation to complete
            setTimeout(() => {
                fromScreen.style.display = 'none';
                fromScreen.classList.remove(exitClass);

                // Show and animate new screen
                toScreen.style.display = 'flex';
                const enterClass = isBack ? 'screen-enter-back' : 'screen-enter';
                toScreen.classList.add(enterClass);

                // Remove animation class after completion
                setTimeout(() => {
                    toScreen.classList.remove(enterClass);
                    resolve();
                }, 300);
            }, 300);
        });
    }

    static fadeIn(element) {
        element.classList.add('screen-fade-in');
        setTimeout(() => {
            element.classList.remove('screen-fade-in');
        }, 300);
    }

    static fadeOut(element) {
        return new Promise((resolve) => {
            element.classList.add('screen-fade-out');
            setTimeout(() => {
                element.classList.remove('screen-fade-out');
                resolve();
            }, 300);
        });
    }

    static animateListItems(container) {
        const items = container.children;
        Array.from(items).forEach((item, index) => {
            if (index < 10) { // Only animate first 10 items
                item.classList.add('list-item-animated');
                // Remove animation class after completion
                setTimeout(() => {
                    item.classList.remove('list-item-animated');
                }, 300 + (index * 50));
            }
        });
    }

    static animateButtonPress(button) {
        button.classList.add('button-press');
        setTimeout(() => {
            button.classList.remove('button-press');
        }, 200);
    }
}

// ============================================
// TOAST MANAGER
// ============================================
class ToastManager {
    constructor() {
        this.queue = [];
        this.isShowing = false;
    }

    show(message, type = 'success') {
        this.queue.push({ message, type });
        if (!this.isShowing) {
            this.showNext();
        }
    }

    showNext() {
        if (this.queue.length === 0) {
            this.isShowing = false;
            return;
        }

        this.isShowing = true;
        const { message, type } = this.queue.shift();
        const container = document.getElementById('toastContainer');

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // БЕЗОПАСНО: используем textContent вместо innerHTML
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animationName = 'toast-out';
            setTimeout(() => {
                toast.remove();
                this.showNext();
            }, 500);
        }, 3000);
    }
}

// ============================================
// THEME MANAGER
// ============================================
class ThemeManager {
    static init() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
                this.setTheme(newTheme);
            });
        }
    }

    static setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }
}

// ============================================
// API CLIENT
// ============================================
class SecureApiClient {
    static async sendPurchase(data, file = null) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Конвертируем файл в base64, если он есть
        let photoBase64 = null;
        if (file) {
            try {
                const reader = new FileReader();
                photoBase64 = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            } catch (error) {
                console.warn('Failed to encode photo:', error);
            }
        }

        // Отправляем JSON вместо FormData (как в sendUnloadingBatch)
        const payload = {
            ...data,
            photo: photoBase64,
            photoFilename: file ? `${data.productName.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.jpg` : null
        };

        try {
            const response = await fetch(config.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('API Error:', error);
            throw error;
        }
    }

    static async generateAISummary(historyText) {
        if (!config.GEMINI_API_URL) {
            throw new Error('AI API not configured');
        }

        const prompt = `Проаналізуй денний звіт закупівель та створи структурований підсумок українською мовою:\n\n${historyText}\n\nВключи: загальну суму витрат, кількість операцій, топ-3 товари, рекомендації.`;

        const response = await fetch(config.GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error('AI API request failed');
        }

        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || 'Не вдалося згенерувати звіт';
    }

    static async scanReceipt(imageFile) {
        // SECURITY: Using server-side proxy instead of direct API call
        if (!config.GEMINI_API_URL) {
            throw new Error('Gemini API not configured');
        }

        // Конвертируем изображение в base64
        const base64Image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Убираем префикс data:image/...;base64,
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });

        const prompt = `Ти - експерт з розпізнавання чеків з магазину METRO. Проаналізуй це фото чека і витягни ВСІХ товари.

Для КОЖНОГО товару вкажи:
1. Точна назва товару українською (якщо на чеку російською - переклади на українську)
2. Кількість (число)
3. Одиниця виміру (кг, шт, упаковка, ящик, пучок, або інше)
4. Ціна за одиницю (число в гривнях)

ВАЖЛИВО:
- Якщо кількість вказана в грамах (г) - переведи в кілограми (кг)
- Якщо на чеку вказана загальна сума, а не ціна за одиницю - розрахуй ціну за одиницю
- Ігноруй рядки які не є товарами (підсумки, знижки, загальні суми)
- Відповідь ТІЛЬКИ в форматі JSON масиву

Формат відповіді:
[
  {
    "productName": "Назва товару",
    "quantity": 1.5,
    "unit": "kg",
    "pricePerUnit": 45.50
  }
]

Можливі значення unit: kg, piece, pack, box, bunch, other

Відповідай ТІЛЬКИ JSON масивом, без додаткових пояснень.`;

        // Use server-side proxy
        const response = await fetch(config.GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: imageFile.type || 'image/jpeg',
                                data: base64Image
                            }
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${errorData.error || response.status}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('Gemini не повернув відповідь');
        }

        // Парсим JSON из ответа
        // Убираем markdown code blocks если есть
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        try {
            const items = JSON.parse(jsonText);
            if (!Array.isArray(items)) {
                throw new Error('Відповідь не є масивом');
            }
            return items;
        } catch (parseError) {
            console.error('Parse error:', parseError);
            console.error('Raw text:', text);
            throw new Error('Не вдалося розпізнати структуру відповіді AI');
        }
    }

    static async sendUnloadingBatch(storeName, items) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Расчет общей суммы
        const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
        const totalItems = items.length;

        const payload = {
            type: 'Відвантаження',
            storeName: storeName,
            totalItems: totalItems,
            totalAmount: Number(totalAmount.toFixed(2)),
            items: items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                unit: item.unit,
                pricePerUnit: item.pricePerUnit,
                totalAmount: item.totalAmount,
                timestamp: item.timestamp,
                source: item.source || 'purchase' // Добавляем source
            })),
            createdAt: new Date().toISOString()
        };

        try {
            const response = await fetch(config.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Batch API Error:', error);
            throw error;
        }
    }

    static async sendPurchaseBatch(locationName, items) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        // Расчет общей суммы
        const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
        const totalItems = items.length;

        const payload = {
            type: 'Закупка',
            locationName: locationName,
            totalItems: totalItems,
            totalAmount: Number(totalAmount.toFixed(2)),
            items: items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                unit: item.unit,
                pricePerUnit: item.pricePerUnit,
                totalAmount: item.totalAmount,
                timestamp: item.timestamp
            })),
            createdAt: new Date().toISOString()
        };

        try {
            const response = await fetch(config.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
                mode: 'cors'
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Purchase Batch API Error:', error);
            throw error;
        }
    }
}

// ============================================
// PHOTO COMPRESSION WITH WEBP SUPPORT
// ============================================
class PhotoCompressor {
    static async compress(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onerror = () => reject(new Error('Cannot read file'));

            reader.onload = (e) => {
                const img = new Image();

                img.onerror = () => reject(new Error('Cannot load image'));

                img.onload = () => {
                    try {
                        const MAX_WIDTH = 1024;
                        const MAX_HEIGHT = 1024;
                        let { width, height } = img;

                        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                            width = Math.round(width * ratio);
                            height = Math.round(height * ratio);
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, width, height);

                        // Try WebP first (better compression)
                        canvas.toBlob((blob) => {
                            if (blob && blob.size < file.size) {
                                resolve(blob);
                            } else {
                                // Fallback to JPEG
                                canvas.toBlob((jpegBlob) => {
                                    resolve(jpegBlob || file);
                                }, 'image/jpeg', 0.85);
                            }
                        }, 'image/webp', 0.85);

                    } catch (error) {
                        reject(new Error('Compression failed: ' + error.message));
                    }
                };

                img.src = e.target.result;
            };

            reader.readAsDataURL(file);
        });
    }
}

// ============================================
// INDEXED DB MANAGER
// ============================================
class IndexedDBManager {
    static DB_NAME = 'GalaBaluvanaDB';
    static DB_VERSION = 1;
    static db = null;
    static isAvailable = false;

    static async init() {
        // Check if IndexedDB is available
        if (!window.indexedDB) {
            console.warn('⚠️ IndexedDB not available in this browser');
            this.isAvailable = false;
            return Promise.resolve(null);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                this.isAvailable = false;
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isAvailable = true;
                console.log('✅ IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Object Store: history (історія операцій)
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('type', 'type', { unique: false });
                    historyStore.createIndex('location', 'location', { unique: false });
                    historyStore.createIndex('productName', 'productName', { unique: false });
                    console.log('✅ Created object store: history');
                }

                // Object Store: drafts (чернетки відвантаження/доставки)
                if (!db.objectStoreNames.contains('drafts')) {
                    db.createObjectStore('drafts', { keyPath: 'storeName' });
                    console.log('✅ Created object store: drafts');
                }

                // Object Store: purchaseDrafts (чернетки закупок)
                if (!db.objectStoreNames.contains('purchaseDrafts')) {
                    db.createObjectStore('purchaseDrafts', { keyPath: 'locationName' });
                    console.log('✅ Created object store: purchaseDrafts');
                }

                // Object Store: inventory (залишки товарів)
                if (!db.objectStoreNames.contains('inventory')) {
                    const inventoryStore = db.createObjectStore('inventory', { keyPath: 'key' });
                    inventoryStore.createIndex('productName', 'productName', { unique: false });
                    inventoryStore.createIndex('quantity', 'quantity', { unique: false });
                    console.log('✅ Created object store: inventory');
                }

                // Object Store: auditLog (аудит лог)
                if (!db.objectStoreNames.contains('auditLog')) {
                    const auditStore = db.createObjectStore('auditLog', { keyPath: 'id', autoIncrement: true });
                    auditStore.createIndex('timestamp', 'timestamp', { unique: false });
                    auditStore.createIndex('action', 'action', { unique: false });
                    console.log('✅ Created object store: auditLog');
                }
            };
        });
    }

    // ============================================
    // GENERIC CRUD OPERATIONS
    // ============================================

    static async add(storeName, data) {
        if (!this.db || !this.isAvailable) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

            // Properly handle transaction lifecycle
            tx.oncomplete = () => console.log(`Transaction ${storeName} completed`);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    static async put(storeName, data) {
        if (!this.db || !this.isAvailable) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

            // Properly handle transaction lifecycle
            tx.oncomplete = () => console.log(`Transaction ${storeName} completed`);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    static async get(storeName, key) {
        if (!this.db || !this.isAvailable) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

            // Properly handle transaction lifecycle
            tx.oncomplete = () => console.log(`Transaction ${storeName} completed`);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    static async getAll(storeName) {
        if (!this.db || !this.isAvailable) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

            // Properly handle transaction lifecycle
            tx.oncomplete = () => console.log(`Transaction ${storeName} completed`);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    static async delete(storeName, key) {
        if (!this.db || !this.isAvailable) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

            // Properly handle transaction lifecycle
            tx.oncomplete = () => console.log(`Transaction ${storeName} completed`);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    static async clear(storeName) {
        if (!this.db || !this.isAvailable) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);

            // Properly handle transaction lifecycle
            tx.oncomplete = () => console.log(`Transaction ${storeName} completed`);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    // ============================================
    // HISTORY OPERATIONS
    // ============================================

    static async addToHistory(item) {
        try {
            await this.add('history', item);
            await this.logAction('add_history', `Додано: ${item.productName}`);
        } catch (error) {
            console.error('Error adding to history:', error);
            throw error;
        }
    }

    static async getHistory() {
        return await this.getAll('history');
    }

    static async clearHistory() {
        await this.clear('history');
        await this.logAction('clear_history', 'Очищено всю історію');
    }

    // ============================================
    // AUDIT LOG
    // ============================================

    static async logAction(action, details = '') {
        const logEntry = {
            action,
            details,
            timestamp: new Date().toISOString()
        };
        try {
            await this.add('auditLog', logEntry);
        } catch (error) {
            console.error('Error logging action:', error);
        }
    }

    static async getAuditLog(limit = 100) {
        const allLogs = await this.getAll('auditLog');
        return allLogs.slice(-limit).reverse();
    }

    // ============================================
    // MIGRATION FROM LOCALSTORAGE
    // ============================================

    static async migrateFromLocalStorage() {
        console.log('🔄 Starting migration from localStorage...');

        try {
            // Migrate history (correct key: purchase_history)
            const historyJSON = localStorage.getItem('purchase_history');
            if (historyJSON) {
                const history = JSON.parse(historyJSON);
                if (Array.isArray(history)) {
                    for (const item of history) {
                        if (item && item.id) {
                            await this.add('history', item);
                        }
                    }
                    console.log(`✅ Migrated ${history.length} history items`);
                }
            }

            // Migrate drafts
            const draftsJSON = localStorage.getItem('drafts');
            if (draftsJSON) {
                const drafts = JSON.parse(draftsJSON);
                if (typeof drafts === 'object') {
                    for (const [storeName, draft] of Object.entries(drafts)) {
                        if (draft && draft.items) {
                            await this.put('drafts', { storeName, ...draft });
                        }
                    }
                    console.log(`✅ Migrated ${Object.keys(drafts).length} drafts`);
                }
            }

            // Migrate purchase drafts (correct key: purchase_drafts)
            const purchaseDraftsJSON = localStorage.getItem('purchase_drafts');
            if (purchaseDraftsJSON) {
                const purchaseDrafts = JSON.parse(purchaseDraftsJSON);
                if (typeof purchaseDrafts === 'object') {
                    for (const [locationName, draft] of Object.entries(purchaseDrafts)) {
                        if (draft && draft.items) {
                            await this.put('purchaseDrafts', { locationName, ...draft });
                        }
                    }
                    console.log(`✅ Migrated ${Object.keys(purchaseDrafts).length} purchase drafts`);
                }
            }

            // Migrate inventory (correct key: inventory_stock)
            const inventoryJSON = localStorage.getItem('inventory_stock');
            if (inventoryJSON) {
                const inventory = JSON.parse(inventoryJSON);
                if (typeof inventory === 'object') {
                    for (const [key, value] of Object.entries(inventory)) {
                        if (value) {
                            await this.put('inventory', { key, ...value });
                        }
                    }
                    console.log(`✅ Migrated ${Object.keys(inventory).length} inventory items`);
                }
            }

            // Mark migration as complete
            localStorage.setItem('migrated_to_indexeddb', 'true');
            await this.logAction('migration', 'Успішна міграція з localStorage');

            console.log('✅ Migration complete!');
            return true;

        } catch (error) {
            console.error('❌ Migration error:', error);
            await this.logAction('migration_error', error.message);
            return false;
        }
    }
}

// ============================================
// GLOBAL INSTANCES
// ============================================
const config = new SecureConfig();
const appState = new AppState();
const toastManager = new ToastManager();
let selectedFile = null;
let receiptPhotoFile = null;
let recognizedItems = [];

// ============================================
// FORM HANDLERS
// ============================================
function showFieldError(fieldId, message) {
    const errorElement = document.getElementById(`${fieldId}-error`);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function clearFieldError(fieldId) {
    const errorElement = document.getElementById(`${fieldId}-error`);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
}

function validateProductName() {
    const value = document.getElementById('productName').value;
    if (!InputValidator.validateProductName(value)) {
        showFieldError('productName', 'Назва товару повинна містити від 2 до 100 символів');
        return false;
    }
    clearFieldError('productName');
    return true;
}

function validateQuantity() {
    const value = document.getElementById('quantity').value;
    if (!InputValidator.validateQuantity(value)) {
        showFieldError('quantity', 'Кількість повинна бути більше 0 і не більше 10000');
        return false;
    }
    clearFieldError('quantity');
    return true;
}

function validatePrice() {
    const value = document.getElementById('pricePerUnit').value.trim();
    const isOptional = appState.isUnloading || appState.isDelivery;

    if (value === '') {
        if (isOptional) {
            clearFieldError('pricePerUnit');
            return true;
        }
        showFieldError('pricePerUnit', 'Ціна обов\'язкова для закупівлі');
        return false;
    }

    if (!InputValidator.validatePrice(value)) {
        showFieldError('pricePerUnit', 'Ціна повинна бути від 0 до 100000');
        return false;
    }

    clearFieldError('pricePerUnit');
    return true;
}

function validateLocation() {
    const locationField = document.getElementById('location');
    const customLocationField = document.getElementById('customLocation');
    const value = locationField.value;

    if (value === 'Інше') {
        clearFieldError('location');

        if (!InputValidator.validateLocation(customLocationField.value)) {
            showFieldError('customLocation', 'Локація повинна містити від 2 до 100 символів');
            return false;
        }

        clearFieldError('customLocation');
        return true;
    }

    clearFieldError('customLocation');

    if (!InputValidator.validateLocation(value)) {
        showFieldError('location', 'Виберіть локацію');
        return false;
    }

    clearFieldError('location');
    return true;
}

async function handleBackButton() {
    // Скидаємо режим редагування
    appState.editingItemId = null;

    // Розумна навігація назад
    if (appState.screen === 'purchase-form' && appState.isUnloading && appState.selectedStore) {
        // Якщо ми у формі додавання товару до чернетки відвантаження - повертаємось до перегляду чернетки
        await showDraftView(appState.selectedStore);
    } else if (appState.screen === 'purchase-form' && !appState.isUnloading && !appState.isDelivery && appState.selectedStore) {
        // Якщо ми у формі додавання товару до чернетки закупки - повертаємось до перегляду чернетки закупки
        await showPurchaseDraftView(appState.selectedStore);
    } else if (appState.screen === 'draft-view') {
        // З перегляду чернетки відвантаження - до списку чернеток відвантаження
        appState.setScreen('drafts-list');
        await showDraftsList();
    } else if (appState.screen === 'store-selection') {
        // З вибору магазину для відвантаження - до списку чернеток відвантаження
        appState.setScreen('drafts-list');
        await showDraftsList();
    } else if (appState.screen === 'purchase-draft-view') {
        // З перегляду чернетки закупки - до списку чернеток закупок
        appState.setScreen('purchase-drafts-list');
        await showPurchaseDraftsList();
    } else if (appState.screen === 'purchase-location-selection') {
        // З вибору локації для закупки - до списку чернеток закупок
        appState.setScreen('purchase-drafts-list');
        await showPurchaseDraftsList();
    } else {
        // В усіх інших випадках - на головну
        appState.setScreen('main');
    }
}

async function switchTab(tab) {
    appState.setTab(tab);
    if (tab === 'history') await updateHistoryDisplay();
}

async function startPurchase() {
    // Показуємо список чернеток закупок
    appState.setScreen('purchase-drafts-list', { isUnloading: false, isDelivery: false });
    appState.selectedStore = null;
    await showPurchaseDraftsList();
}

async function startUnloading() {
    // Показуємо список чернеток
    appState.setScreen('drafts-list', { isUnloading: true, isDelivery: false });
    appState.selectedStore = null;
    await showDraftsList();
}

function startDelivery() {
    appState.setScreen('purchase-form', { isUnloading: false, isDelivery: true });
    setupPurchaseForm();
}

function setupStoreSelection() {
    const grid = document.getElementById('storesGrid');

    if (!grid) {
        console.error('storesGrid element not found');
        return;
    }

    grid.innerHTML = '';

    const stores = config.unloadingLocations.filter(loc => loc !== 'Інше');

    stores.forEach(store => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'store-card glassmorphism';
        card.setAttribute('data-store', store);

        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'store');
        icon.className = 'store-icon';

        const label = document.createElement('span');
        label.className = 'store-label';
        label.textContent = store;

        card.appendChild(icon);
        card.appendChild(label);

        card.addEventListener('click', async () => await selectStore(store));

        grid.appendChild(card);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function selectStore(storeName) {
    appState.selectedStore = storeName;

    // Якщо вже є чернетка для цього магазину - показуємо її
    const draft = await DraftManager.getDraft(storeName);
    if (draft.items.length > 0) {
        await showDraftView(storeName);
    } else {
        // Інакше відразу йдемо на форму додавання товару
        appState.setScreen('purchase-form');
        setupPurchaseForm();
    }
}

// ============================================
// DRAFT FUNCTIONS - Функції роботи з чернетками
// ============================================

async function showDraftsList() {
    const container = document.getElementById('draftsList');
    const emptyState = document.getElementById('draftsEmpty');
    const summary = document.getElementById('draftsListSummary');

    // Show skeleton while loading
    emptyState.style.display = 'none';
    SkeletonLoader.showDraftsSkeleton(container, 3);
    summary.textContent = 'Завантаження...';

    const drafts = await DraftManager.getAllDraftsArray();
    container.innerHTML = '';

    if (drafts.length === 0) {
        emptyState.style.display = 'block';
        container.style.display = 'none';
        summary.textContent = 'Немає чернеток';
        return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'flex';
    summary.textContent = `Всього чернеток: ${drafts.length}`;

    const fragment = document.createDocumentFragment();

    drafts.forEach(draft => {
        const card = document.createElement('div');
        card.className = 'draft-card glassmorphism';

        const info = document.createElement('div');
        info.className = 'draft-card-info';

        const storeName = document.createElement('div');
        storeName.className = 'draft-card-store';
        storeName.textContent = draft.storeName;

        const count = document.createElement('div');
        count.className = 'draft-card-count';
        count.textContent = `${draft.itemCount} ${draft.itemCount === 1 ? 'товар' : draft.itemCount < 5 ? 'товари' : 'товарів'}`;

        info.appendChild(storeName);
        info.appendChild(count);

        const actions = document.createElement('div');
        actions.className = 'draft-card-actions';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn-view';
        viewBtn.textContent = 'Переглянути';
        viewBtn.type = 'button';
        viewBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await showDraftView(draft.storeName);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = 'Видалити';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteDraft(draft.storeName);
        });

        actions.appendChild(viewBtn);
        actions.appendChild(deleteBtn);

        card.appendChild(info);
        card.appendChild(actions);

        card.addEventListener('click', async () => await showDraftView(draft.storeName));

        fragment.appendChild(card);
    });

    container.appendChild(fragment);

    // Animate list items
    AnimationManager.animateListItems(container);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function showDraftView(storeName) {
    appState.selectedStore = storeName;
    appState.setScreen('draft-view');

    const title = document.getElementById('draftViewTitle');
    const summary = document.getElementById('draftViewSummary');
    const container = document.getElementById('draftItems');
    const emptyState = document.getElementById('draftItemsEmpty');
    const submitBtn = document.getElementById('submitDraftBtn');
    const submitBtnText = document.getElementById('submitDraftBtnText');

    title.textContent = storeName;

    // Show skeleton while loading
    emptyState.style.display = 'none';
    SkeletonLoader.showDraftItemsSkeleton(container, 5);
    summary.textContent = 'Завантаження...';

    const draft = await DraftManager.getDraft(storeName);

    const itemCount = draft.items.length;
    summary.textContent = `${itemCount} ${itemCount === 1 ? 'товар' : itemCount < 5 ? 'товари' : 'товарів'}`;

    if (submitBtnText) {
        submitBtnText.textContent = `Відправити всі (${itemCount})`;
    }

    if (submitBtn) {
        submitBtn.disabled = itemCount === 0;
    }

    container.innerHTML = '';

    if (itemCount === 0) {
        emptyState.style.display = 'block';
        container.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'flex';

    const fragment = document.createDocumentFragment();

    draft.items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'draft-item glassmorphism';

        const info = document.createElement('div');
        info.className = 'draft-item-info';

        const name = document.createElement('div');
        name.className = 'draft-item-name';
        name.textContent = item.productName;

        const unitLabel = config.units.find(u => u.value === item.unit)?.label || item.unit;
        const details = document.createElement('div');
        details.className = 'draft-item-details';
        details.textContent = `${item.quantity} ${unitLabel} • ${item.totalAmount.toFixed(2)} ₴`;

        info.appendChild(name);
        info.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'draft-item-actions';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'draft-item-view';
        viewBtn.type = 'button';
        viewBtn.innerHTML = '<i data-lucide="eye"></i>';
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showItemViewModal(storeName, item);
        });

        const editBtn = document.createElement('button');
        editBtn.className = 'draft-item-edit';
        editBtn.type = 'button';
        editBtn.innerHTML = '<i data-lucide="edit"></i>';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editDraftItem(storeName, item);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'draft-item-delete';
        deleteBtn.type = 'button';
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await removeItemFromDraft(storeName, item.id);
        });

        actions.appendChild(viewBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        itemDiv.appendChild(info);
        itemDiv.appendChild(actions);

        fragment.appendChild(itemDiv);
    });

    container.appendChild(fragment);

    // Animate list items
    AnimationManager.animateListItems(container);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function removeItemFromDraft(storeName, itemId) {
    if (!confirm('Видалити товар з чернетки?')) return;

    await DraftManager.removeItemFromDraft(storeName, itemId);
    toastManager.show('Товар видалено', 'success');

    const draft = await DraftManager.getDraft(storeName);
    if (draft.items.length === 0) {
        // Якщо чернетка порожня - повертаємось до списку
        appState.setScreen('drafts-list');
        await showDraftsList();
    } else {
        // Інакше оновлюємо вигляд
        await showDraftView(storeName);
    }
}

async function deleteDraft(storeName) {
    if (!confirm(`Видалити всю чернетку "${storeName}"?`)) return;

    await DraftManager.deleteDraft(storeName);
    toastManager.show('Чернетку видалено', 'success');
    await showDraftsList();
}

function openNewDraft() {
    appState.setScreen('store-selection');
    setupStoreSelection();
}

function addItemToDraft() {
    appState.setScreen('purchase-form');
    setupPurchaseForm();
}

async function submitDraft() {
    const storeName = appState.selectedStore;
    if (!storeName) return;

    const draft = await DraftManager.getDraft(storeName);
    if (draft.items.length === 0) {
        toastManager.show('Чернетка порожня', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitDraftBtn');
    const submitBtnText = document.getElementById('submitDraftBtnText');

    if (!submitBtn) return;

    const originalText = submitBtnText?.textContent || 'Відправити всі';

    submitBtn.disabled = true;
    if (submitBtnText) {
        submitBtnText.textContent = 'Відправка...';
    }

    try {
        // Відправляємо всю заявку одним запитом
        await SecureApiClient.sendUnloadingBatch(storeName, draft.items);

        // Зберігаємо в історію кожен товар окремо (для локального відображення)
        for (const item of draft.items) {
            await SecureStorageManager.addToHistory(item);

            // Віднімаємо з inventory, якщо джерело - "purchase"
            if (item.source === 'purchase') {
                await InventoryManager.removeStock(item.productName, item.quantity, item.unit);
                console.log(`✅ Removed from inventory: ${item.productName} ${item.quantity} ${item.unit}`);
            }
        }

        toastManager.show(`Відправлено ${draft.items.length} ${draft.items.length === 1 ? 'товар' : draft.items.length < 5 ? 'товари' : 'товарів'}`, 'success');

        // Видаляємо чернетку після успішної відправки
        await DraftManager.deleteDraft(storeName);

        // Повертаємось до списку чернеток
        appState.setScreen('drafts-list');
        await showDraftsList();

    } catch (error) {
        console.error('Submit draft error:', error);
        toastManager.show('Помилка відправки. Спробуйте ще раз.', 'error');
    } finally {
        submitBtn.disabled = false;
        if (submitBtnText) {
            submitBtnText.textContent = originalText;
        }
    }
}

// Глобальна змінна для зберігання поточного товару, що переглядається
let currentViewedItem = { storeName: null, item: null };

function showItemViewModal(storeName, item) {
    currentViewedItem = { storeName, item };

    const modal = document.getElementById('itemViewModal');
    const unitLabel = config.units.find(u => u.value === item.unit)?.label || item.unit;

    document.getElementById('itemDetailName').textContent = item.productName;
    document.getElementById('itemDetailQuantity').textContent = `${item.quantity} ${unitLabel}`;
    document.getElementById('itemDetailPrice').textContent = `${item.pricePerUnit.toFixed(2)} ₴`;
    document.getElementById('itemDetailTotal').textContent = `${item.totalAmount.toFixed(2)} ₴`;
    document.getElementById('itemDetailLocation').textContent = item.location;

    // Показуємо джерело, якщо воно є
    const sourceRow = document.getElementById('itemDetailSourceRow');
    const sourceValue = document.getElementById('itemDetailSource');

    if (item.source) {
        let sourceText = item.source;
        if (item.source === 'purchase') {
            sourceText = 'Сьогоднішня закупка';
        }
        sourceValue.textContent = sourceText;
        sourceRow.style.display = 'flex';
    } else {
        sourceRow.style.display = 'none';
    }

    const date = new Date(item.timestamp).toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('itemDetailTimestamp').textContent = date;

    modal.classList.add('visible');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function hideItemViewModal() {
    document.getElementById('itemViewModal').classList.remove('visible');
    currentViewedItem = { storeName: null, item: null };
}

function editDraftItem(storeName, item) {
    // Зберігаємо дані для редагування
    appState.editingItemId = item.id;
    appState.selectedStore = storeName;

    // Відкриваємо форму
    appState.setScreen('purchase-form');
    setupPurchaseForm();

    // Заповнюємо форму даними товару
    document.getElementById('productName').value = item.productName;
    document.getElementById('quantity').value = item.quantity;
    document.getElementById('unit').value = item.unit;
    document.getElementById('pricePerUnit').value = item.pricePerUnit;
    document.getElementById('location').value = item.location;

    updateTotalAmount();

    // Змінюємо текст кнопки
    const saveButtonText = document.getElementById('saveButtonText');
    if (saveButtonText) {
        saveButtonText.textContent = 'Зберегти зміни';
    }

    toastManager.show('Редагування товару', 'info');
}

// ============================================
// PURCHASE DRAFT FUNCTIONS - Функції роботи з чернетками закупок
// ============================================

async function showPurchaseDraftsList() {
    const container = document.getElementById('purchaseDraftsList');
    const emptyState = document.getElementById('purchaseDraftsEmpty');
    const summary = document.getElementById('purchaseDraftsListSummary');

    // Show skeleton while loading
    emptyState.style.display = 'none';
    SkeletonLoader.showDraftsSkeleton(container, 3);
    summary.textContent = 'Завантаження...';

    const drafts = await PurchaseDraftManager.getAllDraftsArray();
    container.innerHTML = '';

    if (drafts.length === 0) {
        emptyState.style.display = 'block';
        container.style.display = 'none';
        summary.textContent = 'Немає чернеток';
        return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'flex';
    summary.textContent = `Всього чернеток: ${drafts.length}`;

    const fragment = document.createDocumentFragment();

    drafts.forEach(draft => {
        const card = document.createElement('div');
        card.className = 'draft-card glassmorphism';

        const info = document.createElement('div');
        info.className = 'draft-card-info';

        const locationName = document.createElement('div');
        locationName.className = 'draft-card-store';
        locationName.textContent = draft.locationName;

        const count = document.createElement('div');
        count.className = 'draft-card-count';
        count.textContent = `${draft.itemCount} ${draft.itemCount === 1 ? 'товар' : draft.itemCount < 5 ? 'товари' : 'товарів'}`;

        info.appendChild(locationName);
        info.appendChild(count);

        const actions = document.createElement('div');
        actions.className = 'draft-card-actions';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn-view';
        viewBtn.textContent = 'Переглянути';
        viewBtn.type = 'button';
        viewBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await showPurchaseDraftView(draft.locationName);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = 'Видалити';
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deletePurchaseDraft(draft.locationName);
        });

        actions.appendChild(viewBtn);
        actions.appendChild(deleteBtn);

        card.appendChild(info);
        card.appendChild(actions);

        card.addEventListener('click', async () => await showPurchaseDraftView(draft.locationName));

        fragment.appendChild(card);
    });

    container.appendChild(fragment);

    // Animate list items
    AnimationManager.animateListItems(container);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function showPurchaseDraftView(locationName) {
    appState.selectedStore = locationName;
    appState.setScreen('purchase-draft-view');

    const title = document.getElementById('purchaseDraftViewTitle');
    const summary = document.getElementById('purchaseDraftViewSummary');
    const container = document.getElementById('purchaseDraftItems');
    const emptyState = document.getElementById('purchaseDraftItemsEmpty');
    const submitBtn = document.getElementById('submitPurchaseDraftBtn');
    const submitBtnText = document.getElementById('submitPurchaseDraftBtnText');

    title.textContent = locationName;

    // Show skeleton while loading
    emptyState.style.display = 'none';
    SkeletonLoader.showDraftItemsSkeleton(container, 5);
    summary.textContent = 'Завантаження...';

    const draft = await PurchaseDraftManager.getDraft(locationName);

    const itemCount = draft.items.length;
    summary.textContent = `${itemCount} ${itemCount === 1 ? 'товар' : itemCount < 5 ? 'товари' : 'товарів'}`;

    if (submitBtnText) {
        submitBtnText.textContent = `Відправити всі (${itemCount})`;
    }

    if (submitBtn) {
        submitBtn.disabled = itemCount === 0;
    }

    container.innerHTML = '';

    if (itemCount === 0) {
        emptyState.style.display = 'block';
        container.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'flex';

    const fragment = document.createDocumentFragment();

    draft.items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'draft-item glassmorphism';

        const info = document.createElement('div');
        info.className = 'draft-item-info';

        const name = document.createElement('div');
        name.className = 'draft-item-name';
        name.textContent = item.productName;

        const unitLabel = config.units.find(u => u.value === item.unit)?.label || item.unit;
        const details = document.createElement('div');
        details.className = 'draft-item-details';
        details.textContent = `${item.quantity} ${unitLabel} • ${item.totalAmount.toFixed(2)} ₴`;

        info.appendChild(name);
        info.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'draft-item-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'draft-item-delete';
        deleteBtn.type = 'button';
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await removeItemFromPurchaseDraft(locationName, item.id);
        });

        actions.appendChild(deleteBtn);

        itemDiv.appendChild(info);
        itemDiv.appendChild(actions);

        fragment.appendChild(itemDiv);
    });

    container.appendChild(fragment);

    // Animate list items
    AnimationManager.animateListItems(container);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function removeItemFromPurchaseDraft(locationName, itemId) {
    if (!confirm('Видалити товар з чернетки?')) return;

    await PurchaseDraftManager.removeItemFromDraft(locationName, itemId);
    toastManager.show('Товар видалено', 'success');

    const draft = await PurchaseDraftManager.getDraft(locationName);
    if (draft.items.length === 0) {
        // Якщо чернетка порожня - повертаємось до списку
        appState.setScreen('purchase-drafts-list');
        await showPurchaseDraftsList();
    } else {
        // Інакше оновлюємо вигляд
        await showPurchaseDraftView(locationName);
    }
}

async function deletePurchaseDraft(locationName) {
    if (!confirm(`Видалити всю чернетку "${locationName}"?`)) return;

    await PurchaseDraftManager.deleteDraft(locationName);
    toastManager.show('Чернетку видалено', 'success');
    await showPurchaseDraftsList();
}

function openNewPurchaseDraft() {
    appState.setScreen('purchase-location-selection');
    setupPurchaseLocationSelection();
}

function setupPurchaseLocationSelection() {
    const grid = document.getElementById('purchaseLocationsGrid');

    if (!grid) {
        console.error('purchaseLocationsGrid element not found');
        return;
    }

    grid.innerHTML = '';

    const locations = config.marketLocations.filter(loc => loc !== 'Інше');

    locations.forEach(location => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'store-card glassmorphism';
        card.setAttribute('data-location', location);

        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'map-pin');
        icon.className = 'store-icon';

        const label = document.createElement('span');
        label.className = 'store-label';
        label.textContent = location;

        card.appendChild(icon);
        card.appendChild(label);

        card.addEventListener('click', async () => await selectPurchaseLocation(location));

        grid.appendChild(card);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function selectPurchaseLocation(locationName) {
    appState.selectedStore = locationName;

    // Для Метро показуємо вибір методу введення
    if (locationName === 'Метро') {
        appState.setScreen('metro-method-selection');
        return;
    }

    // Якщо вже є чернетка для цієї локації - показуємо її
    const draft = await PurchaseDraftManager.getDraft(locationName);
    if (draft.items.length > 0) {
        await showPurchaseDraftView(locationName);
    } else {
        // Інакше відразу йдемо на форму додавання товару
        appState.setScreen('purchase-form');
        appState.isUnloading = false;
        appState.isDelivery = false;
        setupPurchaseForm();
    }
}

function addItemToPurchaseDraft() {
    appState.setScreen('purchase-form');
    appState.isUnloading = false;
    appState.isDelivery = false;
    setupPurchaseForm();
}

async function submitPurchaseDraft() {
    const locationName = appState.selectedStore;
    if (!locationName) return;

    const draft = await PurchaseDraftManager.getDraft(locationName);
    if (draft.items.length === 0) {
        toastManager.show('Чернетка порожня', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitPurchaseDraftBtn');
    const submitBtnText = document.getElementById('submitPurchaseDraftBtnText');

    if (!submitBtn) return;

    const originalText = submitBtnText?.textContent || 'Відправити всі';

    submitBtn.disabled = true;
    if (submitBtnText) {
        submitBtnText.textContent = 'Відправка...';
    }

    try {
        // Відправляємо всю заявку одним запитом
        await SecureApiClient.sendPurchaseBatch(locationName, draft.items);

        // Зберігаємо в історію кожен товар окремо (для локального відображення)
        for (const item of draft.items) {
            await SecureStorageManager.addToHistory(item);

            // Додаємо до inventory
            await InventoryManager.addStock(item.productName, item.quantity, item.unit);
            console.log(`✅ Added to inventory: ${item.productName} ${item.quantity} ${item.unit}`);
        }

        toastManager.show(`Відправлено ${draft.items.length} ${draft.items.length === 1 ? 'товар' : draft.items.length < 5 ? 'товари' : 'товарів'}`, 'success');

        // Видаляємо чернетку після успішної відправки
        await PurchaseDraftManager.deleteDraft(locationName);

        // Повертаємось до списку чернеток
        appState.setScreen('purchase-drafts-list');
        await showPurchaseDraftsList();

    } catch (error) {
        console.error('Submit purchase draft error:', error);
        toastManager.show('Помилка відправки. Спробуйте ще раз.', 'error');
    } finally {
        submitBtn.disabled = false;
        if (submitBtnText) {
            submitBtnText.textContent = originalText;
        }
    }
}

// ============================================
// FORM SETUP
// ============================================

function setupPurchaseForm() {
    document.getElementById('purchaseForm').reset();
    removePhoto();

    ['productName', 'quantity', 'pricePerUnit', 'location', 'customLocation'].forEach(clearFieldError);

    const priceGroup = document.getElementById('priceGroup');
    const totalGroup = document.getElementById('totalGroup');
    const locationLabel = document.getElementById('locationLabel');
    const locationSelect = document.getElementById('location');

    let locations = config.marketLocations;

    if (appState.isUnloading) {
        priceGroup.style.display = 'block';
        totalGroup.style.display = 'block';
        locationLabel.textContent = 'Магазин (відвантаження)';

        // Если магазин уже выбран, блокируем поле
        if (appState.selectedStore) {
            locationSelect.innerHTML = `<option value="${appState.selectedStore}" selected>${appState.selectedStore}</option>`;
            locationSelect.disabled = true;
            locationSelect.style.opacity = '0.6';
            locationSelect.style.cursor = 'not-allowed';
        } else {
            locationSelect.disabled = false;
            locationSelect.style.opacity = '1';
            locationSelect.style.cursor = 'pointer';
            locations = config.unloadingLocations;
        }
    } else if (appState.isDelivery) {
        priceGroup.style.display = 'none';
        totalGroup.style.display = 'none';
        locationLabel.textContent = 'Магазин (доставка)';
        locationSelect.disabled = false;
        locationSelect.style.opacity = '1';
        locations = config.deliveryLocations;
    } else {
        priceGroup.style.display = 'block';
        totalGroup.style.display = 'block';
        locationLabel.textContent = 'Локація закупки';

        // Если локация закупки уже выбрана, блокируем поле
        if (appState.selectedStore) {
            locationSelect.innerHTML = `<option value="${appState.selectedStore}" selected>${appState.selectedStore}</option>`;
            locationSelect.disabled = true;
            locationSelect.style.opacity = '0.6';
            locationSelect.style.cursor = 'not-allowed';
        } else {
            locationSelect.disabled = false;
            locationSelect.style.opacity = '1';
        }
    }

    if (!appState.selectedStore || appState.isDelivery) {
        setupLocationOptions(locations);
    }

    populateDatalist();
    populateUnitSelect();
    updateTotalAmount();
}

function setupLocationOptions(locations) {
    const select = document.getElementById('location');
    select.innerHTML = '<option value="">Оберіть...</option>';

    locations.forEach(loc => {
        const option = document.createElement('option');
        option.value = InputValidator.sanitizeString(loc);
        // БЕЗОПАСНО: textContent вместо innerHTML
        option.textContent = InputValidator.sanitizeString(loc);
        select.appendChild(option);
    });
}

function populateDatalist() {
    const datalist = document.getElementById('productSuggestions');
    datalist.innerHTML = '';

    config.products.forEach(p => {
        const option = document.createElement('option');
        option.value = InputValidator.sanitizeString(p);
        datalist.appendChild(option);
    });
}

function populateUnitSelect() {
    const select = document.getElementById('unit');
    select.innerHTML = '';

    config.units.forEach(u => {
        const option = document.createElement('option');
        option.value = u.value;
        option.textContent = u.label;
        select.appendChild(option);
    });
}

function handleLocationChange() {
    const select = document.getElementById('location');
    const group = document.getElementById('customLocationGroup');
    const customInput = document.getElementById('customLocation');
    const isCustomLocation = select.value === 'Інше';

    group.style.display = isCustomLocation ? 'block' : 'none';
    customInput.disabled = !isCustomLocation;
    customInput.required = isCustomLocation;

    if (!isCustomLocation) {
        customInput.value = '';
        clearFieldError('customLocation');
    }
}

async function handleProductNameChange() {
    // Показуємо поле вибору джерела тільки для відвантаження
    if (!appState.isUnloading) {
        const sourceGroup = document.getElementById('sourceGroup');
        if (sourceGroup) sourceGroup.style.display = 'none';
        return;
    }

    const productName = document.getElementById('productName').value.trim();
    const sourceGroup = document.getElementById('sourceGroup');
    const sourceOptions = document.getElementById('sourceOptions');
    const stockInfo = document.getElementById('stockInfo');

    if (!productName || !config.isWarehouseProduct(productName)) {
        // Обычный товар - скрываем выбор источника
        sourceGroup.style.display = 'none';
        stockInfo.style.display = 'none';
        clearFieldError('source');
        return;
    }

    // Складской товар - показываем выбор источника
    sourceGroup.style.display = 'block';

    // Получаем текущую единицу измерения
    const unit = document.getElementById('unit').value || 'kg';
    const stock = await InventoryManager.getStock(productName, unit);

    // Очищаем предыдущие опции
    sourceOptions.innerHTML = '';

    // Добавляем опцию "Сьогоднішня закупка" если есть остатки
    if (stock.quantity > 0) {
        const unitLabel = config.units.find(u => u.value === unit)?.label || unit;

        const purchaseOption = document.createElement('div');
        purchaseOption.className = 'source-option';

        const purchaseRadio = document.createElement('input');
        purchaseRadio.type = 'radio';
        purchaseRadio.id = 'source_purchase';
        purchaseRadio.name = 'source';
        purchaseRadio.value = 'purchase';
        purchaseRadio.checked = true; // По умолчанию выбран

        const purchaseLabel = document.createElement('label');
        purchaseLabel.htmlFor = 'source_purchase';
        purchaseLabel.textContent = `Сьогоднішня закупка (${stock.quantity} ${unitLabel})`;

        purchaseOption.appendChild(purchaseRadio);
        purchaseOption.appendChild(purchaseLabel);
        sourceOptions.appendChild(purchaseOption);
    }

    // Добавляем опции складов
    config.warehouseSources.forEach(warehouse => {
        const warehouseOption = document.createElement('div');
        warehouseOption.className = 'source-option';

        const warehouseRadio = document.createElement('input');
        warehouseRadio.type = 'radio';
        warehouseRadio.id = `source_${warehouse.replace(/[^a-z0-9]/gi, '_')}`;
        warehouseRadio.name = 'source';
        warehouseRadio.value = warehouse;

        // Если нет закупки, выбираем первый склад по умолчанию
        if (stock.quantity === 0 && warehouse === config.warehouseSources[0]) {
            warehouseRadio.checked = true;
        }

        const warehouseLabel = document.createElement('label');
        warehouseLabel.htmlFor = warehouseRadio.id;
        warehouseLabel.textContent = warehouse;

        warehouseOption.appendChild(warehouseRadio);
        warehouseOption.appendChild(warehouseLabel);
        sourceOptions.appendChild(warehouseOption);
    });

    // Показываем информацию о наличии
    if (stock.quantity > 0) {
        const unitLabel = config.units.find(u => u.value === unit)?.label || unit;
        stockInfo.textContent = `✓ Доступно з закупки: ${stock.quantity} ${unitLabel}`;
        stockInfo.style.display = 'block';
        stockInfo.style.color = '#10b981';
    } else {
        stockInfo.textContent = '⚠ Закупка не проводилася. Оберіть склад.';
        stockInfo.style.display = 'block';
        stockInfo.style.color = '#f59e0b';
    }

    clearFieldError('source');
}

function updateTotalAmount() {
    if (appState.isDelivery) {
        document.getElementById('totalAmount').textContent = '0.00 ₴';
        return;
    }

    const qty = parseFloat(document.getElementById('quantity').value) || 0;
    const price = parseFloat(document.getElementById('pricePerUnit').value) || 0;
    const total = (qty * price).toFixed(2);

    document.getElementById('totalAmount').textContent = `${total} ₴`;
}

async function handlePhotoSelect(event) {
    const file = event.target.files?.[0];
    if (!file) {
        removePhoto();
        return;
    }

    try {
        if (!InputValidator.validateFile(file)) {
            throw new Error('Файл занадто великий або непідтримуваний формат');
        }

        const previewContainer = document.getElementById('photoPreview');
        const previewImage = document.getElementById('previewImage');

        if (previewContainer) previewContainer.style.display = 'block';

        // Compress photo
        toastManager.show('Стискаємо фото...', 'info');
        selectedFile = await PhotoCompressor.compress(file);

        // Show preview
        if (previewImage) {
            const previewUrl = URL.createObjectURL(selectedFile);
            previewImage.src = previewUrl;
            previewImage.onload = () => URL.revokeObjectURL(previewUrl);
        }

        const sizeKB = (selectedFile.size / 1024).toFixed(0);
        toastManager.show(`Фото готове (${sizeKB}KB)`, 'success');

    } catch (error) {
        console.error('Photo error:', error);
        toastManager.show(error.message || 'Помилка обробки фото', 'error');
        event.target.value = '';
        removePhoto();
    }
}

function removePhoto() {
    selectedFile = null;

    const previewContainer = document.getElementById('photoPreview');
    const previewImage = document.getElementById('previewImage');
    const photoInput = document.getElementById('photoInput');

    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImage) previewImage.src = '';
    if (photoInput) photoInput.value = '';
}

async function handleFormSubmit(event) {
    event.preventDefault();

    // Validate all fields
    const isValid = validateProductName() && validateQuantity() && validatePrice() && validateLocation();

    if (!isValid) {
        toastManager.show('Перевірте заповнення полів', 'error');
        return;
    }

    const productName = document.getElementById('productName').value.trim();
    const quantity = parseFloat(document.getElementById('quantity').value);
    const unit = document.getElementById('unit').value;
    const pricePerUnit = parseFloat(document.getElementById('pricePerUnit').value) || 0;
    let location = document.getElementById('location').value;

    if (location === 'Інше') {
        location = document.getElementById('customLocation').value.trim();
    }

    const type = appState.isUnloading ? 'Відвантаження' : appState.isDelivery ? 'Доставка' : 'Закупка';
    const totalAmount = Number((quantity * pricePerUnit).toFixed(2));

    const itemData = {
        id: crypto.randomUUID(),
        productName: InputValidator.sanitizeString(productName),
        quantity,
        unit,
        pricePerUnit,
        totalAmount,
        location: InputValidator.sanitizeString(location),
        timestamp: new Date().toISOString(),
        type
    };

    // Якщо це закупка з вибраною локацією - додаємо до чернетки закупки
    if (!appState.isUnloading && !appState.isDelivery && appState.selectedStore) {
        try {
            await PurchaseDraftManager.addItemToDraft(appState.selectedStore, itemData);
            toastManager.show(`'${productName}' додано до чернетки`, 'success');

            // Повертаємось до перегляду чернетки
            await showPurchaseDraftView(appState.selectedStore);
        } catch (error) {
            console.error('Purchase draft error:', error);
            toastManager.show(error.message || 'Помилка додавання', 'error');
        }
        return;
    }

    // Якщо це відвантаження - перевіряємо джерело та додаємо до чернетки
    if (appState.isUnloading && appState.selectedStore) {
        // Для складських товарів - перевіряємо вибір джерела
        if (config.isWarehouseProduct(productName)) {
            const sourceRadios = document.getElementsByName('source');
            let selectedSource = null;

            for (const radio of sourceRadios) {
                if (radio.checked) {
                    selectedSource = radio.value;
                    break;
                }
            }

            if (!selectedSource) {
                toastManager.show('Оберіть джерело товару', 'error');
                return;
            }

            itemData.source = selectedSource;
        } else {
            // Для звичайних товарів - перевіряємо остатки
            const availability = await InventoryManager.checkAvailability(productName, quantity, unit);

            if (!availability.available) {
                const unitLabel = config.units.find(u => u.value === unit)?.label || unit;
                toastManager.show(
                    `Недостатньо товару на складі. Доступно: ${availability.stock} ${unitLabel}, потрібно: ${quantity} ${unitLabel}`,
                    'error'
                );
                return;
            }

            itemData.source = 'purchase';
        }
        try {
            if (appState.editingItemId) {
                // Редагуємо існуючий товар
                await DraftManager.updateItemInDraft(appState.selectedStore, appState.editingItemId, itemData);
                toastManager.show(`'${productName}' оновлено`, 'success');
                appState.editingItemId = null;
            } else {
                // Додаємо новий товар
                await DraftManager.addItemToDraft(appState.selectedStore, itemData);
                toastManager.show(`'${productName}' додано до чернетки`, 'success');
            }

            // Повертаємось до перегляду чернетки
            await showDraftView(appState.selectedStore);
        } catch (error) {
            console.error('Draft error:', error);
            toastManager.show(error.message || 'Помилка додавання', 'error');
        }
        return;
    }

    // Для закупок та доставок - відправляємо на сервер відразу
    const saveButton = document.getElementById('saveButton');
    const buttonIcon = saveButton.querySelector('.button-icon');
    const buttonSpinner = saveButton.querySelector('.button-spinner');

    saveButton.disabled = true;
    buttonIcon.style.display = 'none';
    buttonSpinner.style.display = 'inline-block';

    try {
        // Save to localStorage FIRST (так дані не потеряются)
        await SecureStorageManager.addToHistory(itemData);

        // Якщо це закупка - додаємо до inventory
        if (type === 'Закупка') {
            await InventoryManager.addStock(productName, quantity, unit);
            console.log(`✅ Added to inventory: ${productName} ${quantity} ${unit}`);
        }

        // Try to send to server (non-blocking)
        try {
            await SecureApiClient.sendPurchase(itemData, selectedFile);
            console.log('✅ Data sent to server');
        } catch (apiError) {
            console.warn('⚠️ Server unavailable, data saved locally only:', apiError);
            toastManager.show('Збережено локально (сервер недоступний)', 'warning');
        }

        toastManager.show(`'${productName}' успішно збережено`, 'success');

        appState.setScreen('main');
        appState.setTab('history');
        await updateHistoryDisplay();

    } catch (error) {
        console.error('Submit error:', error);
        toastManager.show('Помилка збереження. Спробуйте ще раз.', 'error');
    } finally {
        saveButton.disabled = false;
        buttonIcon.style.display = 'inline-block';
        buttonSpinner.style.display = 'none';
    }
}

async function updateHistoryDisplay() {
    const container = document.getElementById('historyItems');
    const emptyState = document.getElementById('historyEmpty');
    const summary = document.getElementById('historySummary');

    // Show skeleton while loading
    emptyState.style.display = 'none';
    SkeletonLoader.showHistorySkeleton(container, 10);
    summary.textContent = 'Завантаження...';

    const items = await SecureStorageManager.getHistoryItems();
    container.innerHTML = '';

    if (items.length === 0) {
        emptyState.style.display = 'block';
        summary.textContent = 'Немає записів';
        return;
    }

    emptyState.style.display = 'none';
    summary.textContent = `Всього записів: ${items.length}`;

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item glassmorphism';

        const date = new Date(item.timestamp).toLocaleString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        const unitLabel = config.units.find(u => u.value === item.unit)?.label || item.unit;

        // БЕЗОПАСНО: создаем элементы через createElement и textContent
        const nameDiv = document.createElement('div');
        nameDiv.className = 'history-item-name';
        nameDiv.textContent = item.productName;

        const typeDiv = document.createElement('div');
        typeDiv.className = 'history-item-type';
        typeDiv.textContent = item.type;

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'history-item-details';
        detailsDiv.textContent = `${item.quantity} ${unitLabel} • ${item.location} • ${item.totalAmount.toFixed(2)} ₴`;

        const dateDiv = document.createElement('div');
        dateDiv.className = 'history-item-date';
        dateDiv.textContent = date;

        div.appendChild(nameDiv);
        div.appendChild(typeDiv);
        div.appendChild(detailsDiv);
        div.appendChild(dateDiv);

        fragment.appendChild(div);
    });

    container.appendChild(fragment);

    // Animate list items
    AnimationManager.animateListItems(container);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function showEndDayModal() {
    document.getElementById('endDayModal').classList.add('visible');
}

function hideEndDayModal() {
    document.getElementById('endDayModal').classList.remove('visible');
}

async function generateDailyReport() {
    hideEndDayModal();

    const modal = document.getElementById('aiSummaryModal');
    const content = document.getElementById('aiSummaryContent');
    const clearBtn = document.getElementById('clearHistoryBtn');

    modal.classList.add('visible');
    content.innerHTML = '<div class="loading-spinner"></div><p>Генеруємо звіт...</p>';
    clearBtn.style.display = 'none';

    try {
        const items = await SecureStorageManager.getHistoryItems();

        if (items.length === 0) {
            content.textContent = 'Немає операцій для аналізу';
            return;
        }

        const historyText = items.map(item =>
            `${item.type}: ${item.productName}, ${item.quantity} ${item.unit}, ${item.totalAmount}₴, ${item.location}`
        ).join('\n');

        const summary = await SecureApiClient.generateAISummary(historyText);

        // БЕЗОПАСНО: textContent вместо innerHTML
        content.textContent = summary;
        clearBtn.style.display = 'inline-block';

    } catch (error) {
        console.error('AI Summary error:', error);
        content.textContent = 'Не вдалося згенерувати звіт. AI API не налаштований або недоступний.';
    }
}

function hideAiSummaryModal() {
    document.getElementById('aiSummaryModal').classList.remove('visible');
}

async function clearHistory() {
    if (confirm('Ви впевнені? Історію буде видалено назавжди.')) {
        await SecureStorageManager.clearHistory();
        await InventoryManager.clearDailyStock(); // Очищаємо залишки
        await updateHistoryDisplay();
        hideAiSummaryModal();
        toastManager.show('Історію та залишки очищено', 'success');
    }
}

// ============================================
// RECEIPT SCANNING FUNCTIONS
// ============================================

function showReceiptScanScreen() {
    appState.setScreen('receipt-scan');
    receiptPhotoFile = null;

    const preview = document.getElementById('receiptPreview');
    const cameraButton = document.querySelector('.receipt-camera-button');
    const processBtn = document.getElementById('processReceiptBtn');

    if (preview) preview.style.display = 'none';
    if (cameraButton) cameraButton.style.display = 'flex';
    if (processBtn) processBtn.style.display = 'none';
}

function handleReceiptPhotoSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!InputValidator.validateFile(file)) {
        toastManager.show('Файл занадто великий або непідтримуваний формат', 'error');
        return;
    }

    receiptPhotoFile = file;

    const preview = document.getElementById('receiptPreview');
    const previewImage = document.getElementById('receiptPreviewImage');
    const cameraButton = document.querySelector('.receipt-camera-button');
    const processBtn = document.getElementById('processReceiptBtn');

    if (previewImage) {
        const previewUrl = URL.createObjectURL(file);
        previewImage.src = previewUrl;
        previewImage.onload = () => URL.revokeObjectURL(previewUrl);
    }

    if (preview) preview.style.display = 'block';
    if (cameraButton) cameraButton.style.display = 'none';
    if (processBtn) processBtn.style.display = 'block';

    toastManager.show('Фото завантажено. Натисніть "Розпізнати чек"', 'success');
}

function retakeReceiptPhoto() {
    receiptPhotoFile = null;

    const preview = document.getElementById('receiptPreview');
    const cameraButton = document.querySelector('.receipt-camera-button');
    const processBtn = document.getElementById('processReceiptBtn');
    const input = document.getElementById('receiptPhotoInput');

    if (preview) preview.style.display = 'none';
    if (cameraButton) cameraButton.style.display = 'flex';
    if (processBtn) processBtn.style.display = 'none';
    if (input) input.value = '';
}

async function processReceipt() {
    if (!receiptPhotoFile) {
        toastManager.show('Спочатку зробіть фото чека', 'error');
        return;
    }

    const processBtn = document.getElementById('processReceiptBtn');
    const scanningStatus = document.getElementById('scanningStatus');
    const receiptPreview = document.getElementById('receiptPreview');

    if (processBtn) processBtn.disabled = true;
    if (scanningStatus) scanningStatus.style.display = 'block';
    if (receiptPreview) receiptPreview.style.display = 'none';

    try {
        const items = await SecureApiClient.scanReceipt(receiptPhotoFile);

        if (!items || items.length === 0) {
            throw new Error('AI не зміг розпізнати товари на чеку');
        }

        recognizedItems = items.map(item => ({
            id: crypto.randomUUID(),
            productName: InputValidator.sanitizeString(item.productName || ''),
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || 'piece',
            pricePerUnit: parseFloat(item.pricePerUnit) || 0,
            totalAmount: (parseFloat(item.quantity) || 0) * (parseFloat(item.pricePerUnit) || 0),
            location: 'Метро',
            timestamp: new Date().toISOString(),
            type: 'Закупка'
        }));

        toastManager.show(`Розпізнано ${recognizedItems.length} товарів`, 'success');
        showRecognizedItemsScreen();

    } catch (error) {
        console.error('Receipt scan error:', error);
        toastManager.show(error.message || 'Помилка розпізнавання чека', 'error');
    } finally {
        if (processBtn) processBtn.disabled = false;
        if (scanningStatus) scanningStatus.style.display = 'none';
        if (receiptPreview) receiptPreview.style.display = 'block';
    }
}

function showRecognizedItemsScreen() {
    appState.setScreen('recognized-items');

    const container = document.getElementById('recognizedItemsList');
    const emptyState = document.getElementById('recognizedItemsEmpty');
    const summary = document.getElementById('recognizedItemsSummary');
    const confirmBtn = document.getElementById('confirmRecognizedItemsBtn');
    const confirmBtnText = document.getElementById('confirmRecognizedItemsBtnText');

    if (!container) return;

    container.innerHTML = '';

    if (recognizedItems.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        if (container) container.style.display = 'none';
        if (summary) summary.textContent = 'Товарів не розпізнано';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (container) container.style.display = 'flex';
    if (summary) summary.textContent = `${recognizedItems.length} товарів розпізнано`;
    if (confirmBtnText) confirmBtnText.textContent = `Підтвердити всі (${recognizedItems.length})`;

    recognizedItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'recognized-item-card';

        const info = document.createElement('div');
        info.className = 'recognized-item-info';

        const name = document.createElement('div');
        name.className = 'recognized-item-name';
        name.textContent = item.productName;

        const unitLabel = config.units.find(u => u.value === item.unit)?.label || item.unit;
        const details = document.createElement('div');
        details.className = 'recognized-item-details';

        const qtySpan = document.createElement('span');
        qtySpan.textContent = `${item.quantity} ${unitLabel}`;

        const priceSpan = document.createElement('span');
        priceSpan.textContent = `${item.pricePerUnit.toFixed(2)} ₴/од`;

        details.appendChild(qtySpan);
        details.appendChild(priceSpan);

        const total = document.createElement('div');
        total.className = 'recognized-item-total';
        total.textContent = `Сума: ${item.totalAmount.toFixed(2)} ₴`;

        info.appendChild(name);
        info.appendChild(details);
        info.appendChild(total);

        const actions = document.createElement('div');
        actions.className = 'recognized-item-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'recognized-item-edit';
        editBtn.type = 'button';
        editBtn.innerHTML = '<i data-lucide="edit"></i>';
        editBtn.addEventListener('click', () => editRecognizedItem(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'recognized-item-delete';
        deleteBtn.type = 'button';
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.addEventListener('click', () => deleteRecognizedItem(index));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        itemDiv.appendChild(info);
        itemDiv.appendChild(actions);

        container.appendChild(itemDiv);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function editRecognizedItem(index) {
    // TODO: Можно добавить модальное окно для редактирования
    // Пока просто удаляем и пользователь может добавить вручную
    toastManager.show('Використовуйте "Видалити" та "Додати товар" для змін', 'info');
}

function deleteRecognizedItem(index) {
    if (!confirm('Видалити цей товар зі списку?')) return;

    recognizedItems.splice(index, 1);
    toastManager.show('Товар видалено', 'success');
    showRecognizedItemsScreen();
}

async function confirmRecognizedItems() {
    if (recognizedItems.length === 0) {
        toastManager.show('Немає товарів для підтвердження', 'error');
        return;
    }

    const locationName = 'Метро';

    // Добавляем все распознанные товары в черновик
    try {
        for (const item of recognizedItems) {
            await PurchaseDraftManager.addItemToDraft(locationName, item);
        }

        toastManager.show(`${recognizedItems.length} товарів додано до чернетки`, 'success');

        // Очищаем распознанные товары
        recognizedItems = [];
        receiptPhotoFile = null;

        // Показываем черновик
        await showPurchaseDraftView(locationName);

    } catch (error) {
        console.error('Confirm items error:', error);
        toastManager.show(error.message || 'Помилка додавання товарів', 'error');
    }
}

// ============================================
// DATE WIDGET
// ============================================
function updateCurrentDate() {
    const now = new Date();

    // Українські назви днів тижня
    const daysOfWeek = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];

    // Форматування повної дати
    const fullDate = now.toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const dayOfWeek = daysOfWeek[now.getDay()];

    // Оновлення елементів
    const dayElement = document.getElementById('currentDay');
    const dateElement = document.getElementById('currentDate');

    if (dayElement) {
        dayElement.textContent = dayOfWeek;
    }

    if (dateElement) {
        dateElement.textContent = fullDate;
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App initializing...');

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Initialize theme
    ThemeManager.init();

    // Initialize IndexedDB
    try {
        await IndexedDBManager.init();
        console.log('✅ IndexedDB ready');

        // Check if migration is needed
        const migrated = localStorage.getItem('migrated_to_indexeddb');
        if (!migrated) {
            console.log('🔄 First run - migrating data...');
            await IndexedDBManager.migrateFromLocalStorage();
            console.log('✅ Migration completed');
        }
    } catch (error) {
        console.error('❌ IndexedDB initialization failed:', error);
        toastManager.show('Помилка ініціалізації бази даних: ' + error.message, 'error');
        // Continue anyway - app can work without IndexedDB (will use localStorage fallback)
    }

    // Initialize current date widget
    updateCurrentDate();
    // Update date every minute
    setInterval(updateCurrentDate, 60000);

    // Initialize mode toggle UI
    const label = document.getElementById('modeToggleLabel');
    const indicator = document.querySelector('.mode-indicator');
    if (label) {
        label.textContent = config.isTestMode ? 'Тестовий режим' : 'Робочий режим';
    }
    if (indicator) {
        indicator.style.backgroundColor = config.isTestMode ? '#ef4444' : '#10b981';
    }

    // Hide loading screen AFTER everything is initialized
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }

    // Show main screen
    appState.updateUI();
    console.log('✅ App initialized successfully!');

    // Setup event listeners
    document.getElementById('backButton')?.addEventListener('click', handleBackButton);
    document.getElementById('startPurchaseBtn')?.addEventListener('click', startPurchase);
    document.getElementById('startUnloadingBtn')?.addEventListener('click', startUnloading);
    document.getElementById('startDeliveryBtn')?.addEventListener('click', startDelivery);
    document.getElementById('purchaseForm')?.addEventListener('submit', handleFormSubmit);
    document.getElementById('photoInput')?.addEventListener('change', handlePhotoSelect);
    document.getElementById('photoButton')?.addEventListener('click', () => {
        document.getElementById('photoInput')?.click();
    });
    document.getElementById('removePhotoBtn')?.addEventListener('click', removePhoto);
    document.getElementById('quantity')?.addEventListener('input', updateTotalAmount);
    document.getElementById('pricePerUnit')?.addEventListener('input', updateTotalAmount);
    document.getElementById('location')?.addEventListener('change', handleLocationChange);
    // Use debounced version to prevent excessive DB queries
    const debouncedProductChange = debounce(handleProductNameChange, 300);
    document.getElementById('productName')?.addEventListener('input', debouncedProductChange);
    document.getElementById('unit')?.addEventListener('change', handleProductNameChange);
    document.getElementById('navPurchases')?.addEventListener('click', async () => await switchTab('purchases'));
    document.getElementById('navHistory')?.addEventListener('click', async () => await switchTab('history'));
    document.getElementById('endDayBtn')?.addEventListener('click', showEndDayModal);
    document.getElementById('cancelEndDayBtn')?.addEventListener('click', hideEndDayModal);
    document.getElementById('confirmEndDayBtn')?.addEventListener('click', generateDailyReport);
    document.getElementById('closeAiSummaryBtn')?.addEventListener('click', hideAiSummaryModal);
    document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);

    // Draft management listeners
    document.getElementById('newDraftBtn')?.addEventListener('click', openNewDraft);
    document.getElementById('addItemToDraftBtn')?.addEventListener('click', addItemToDraft);
    document.getElementById('submitDraftBtn')?.addEventListener('click', submitDraft);

    // Purchase draft management listeners
    document.getElementById('newPurchaseDraftBtn')?.addEventListener('click', openNewPurchaseDraft);
    document.getElementById('addItemToPurchaseDraftBtn')?.addEventListener('click', addItemToPurchaseDraft);
    document.getElementById('submitPurchaseDraftBtn')?.addEventListener('click', submitPurchaseDraft);

    // Item view modal listeners
    document.getElementById('closeItemViewBtn')?.addEventListener('click', hideItemViewModal);
    document.getElementById('editItemBtn')?.addEventListener('click', () => {
        if (currentViewedItem.storeName && currentViewedItem.item) {
            hideItemViewModal();
            editDraftItem(currentViewedItem.storeName, currentViewedItem.item);
        }
    });
    document.getElementById('deleteItemFromModalBtn')?.addEventListener('click', async () => {
        if (currentViewedItem.storeName && currentViewedItem.item) {
            hideItemViewModal();
            await removeItemFromDraft(currentViewedItem.storeName, currentViewedItem.item.id);
        }
    });

    // Receipt scanning listeners
    document.getElementById('scanReceiptBtn')?.addEventListener('click', showReceiptScanScreen);
    document.getElementById('manualEntryBtn')?.addEventListener('click', () => {
        appState.setScreen('purchase-form');
        appState.isUnloading = false;
        appState.isDelivery = false;
        setupPurchaseForm();
    });
    document.getElementById('takePhotoReceiptBtn')?.addEventListener('click', () => {
        document.getElementById('receiptPhotoInput')?.click();
    });
    document.getElementById('receiptPhotoInput')?.addEventListener('change', handleReceiptPhotoSelect);
    document.getElementById('retakePhotoBtn')?.addEventListener('click', retakeReceiptPhoto);
    document.getElementById('processReceiptBtn')?.addEventListener('click', processReceipt);
    document.getElementById('confirmRecognizedItemsBtn')?.addEventListener('click', confirmRecognizedItems);
    document.getElementById('tryAgainBtn')?.addEventListener('click', showReceiptScanScreen);
    document.getElementById('addManualItemBtn')?.addEventListener('click', () => {
        appState.setScreen('purchase-form');
        appState.isUnloading = false;
        appState.isDelivery = false;
        setupPurchaseForm();
    });

    // Mode toggle
    document.getElementById('modeToggle')?.addEventListener('click', () => {
        config.toggleMode();
        const label = document.getElementById('modeToggleLabel');
        const indicator = document.querySelector('.mode-indicator');

        if (label) {
            label.textContent = config.isTestMode ? 'Тестовий режим' : 'Робочий режим';
        }

        if (indicator) {
            indicator.style.backgroundColor = config.isTestMode ? '#ef4444' : '#10b981';
        }

        toastManager.show(`Режим змінено на ${config.isTestMode ? 'тестовий' : 'робочий'}`, 'info');
    });

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ SW failed:', err));
    }

    console.log('✅ App initialized');
});
