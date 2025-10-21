import { config } from './config.js';

class AppState {
    constructor(uiAdapter = null) {
        this.screen = 'main';
        this.tab = 'purchases';
        this.isUnloading = false;
        this.isDelivery = false;
        this.selectedStore = null;
        this.batchItems = [];
        this.editingItemId = null;
        this.operationType = null;
        this.uiAdapter = uiAdapter;
    }

    setUIAdapter(uiAdapter) {
        this.uiAdapter = uiAdapter;
    }

    addBatchItem(item) {
        if (this.batchItems.length >= 20) {
            throw new Error('Максимум 20 товарів в одній заявці');
        }
        this.batchItems.push(item);
        this.updateUI();
    }

    removeBatchItem(index) {
        this.batchItems.splice(index, 1);
        this.updateUI();
    }

    clearBatch() {
        this.batchItems = [];
        this.updateUI();
    }

    getBatchCount() {
        return this.batchItems.length;
    }

    setScreen(screen, options = {}) {
        this.screen = screen;
        if (options.isUnloading !== undefined) this.isUnloading = options.isUnloading;
        if (options.isDelivery !== undefined) this.isDelivery = options.isDelivery;
        if (Object.prototype.hasOwnProperty.call(options, 'operationType')) {
            this.operationType = options.operationType;
        }
        this.updateUI();
    }

    setTab(tab) {
        this.tab = tab;
        this.updateUI();
    }

    updateUI() {
        if (this.uiAdapter && typeof this.uiAdapter.update === 'function') {
            this.uiAdapter.update(this);
        }
    }
}

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
        })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
}

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
    }

    static async removeItemFromDraft(locationName, itemId) {
        const draft = await this.getDraft(locationName);

        if (!draft || !draft.items) return null;

        draft.items = draft.items.filter(item => item.id !== itemId);
        draft.updatedAt = new Date().toISOString();

        if (draft.items.length === 0) {
            await IndexedDBManager.delete('purchaseDrafts', locationName);
            await IndexedDBManager.logAction('delete_empty_purchase_draft', locationName);
        } else {
            await IndexedDBManager.put('purchaseDrafts', draft);
            await IndexedDBManager.logAction('remove_purchase_draft_item', `${locationName}: item ${itemId}`);
        }

        return draft;
    }

    static async updateItemInDraft(locationName, itemId, updatedItem) {
        const draft = await this.getDraft(locationName);

        if (!draft || !draft.items) return null;

        const itemIndex = draft.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) return null;

        updatedItem.id = itemId;
        updatedItem.timestamp = draft.items[itemIndex].timestamp;
        updatedItem.updatedAt = new Date().toISOString();

        draft.items[itemIndex] = updatedItem;
        draft.updatedAt = new Date().toISOString();

        await IndexedDBManager.put('purchaseDrafts', draft);
        await IndexedDBManager.logAction('update_purchase_draft_item', `${locationName}: ${updatedItem.productName}`);

        return draft;
    }

    static async deleteDraft(locationName) {
        await IndexedDBManager.delete('purchaseDrafts', locationName);
        await IndexedDBManager.logAction('delete_purchase_draft', locationName);
    }

    static async getAllDraftsArray() {
        const drafts = await IndexedDBManager.getAll('purchaseDrafts');
        return drafts.map(draft => ({
            locationName: draft.locationName,
            itemCount: draft.items.length,
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt || draft.createdAt
        })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }
}

class InventoryManager {
    static async getStock(productName, unit) {
        try {
            const key = `${productName}_${unit}`;
            const stock = await IndexedDBManager.get('inventory', key);
            if (!stock) {
                return { key, productName, unit, quantity: 0, lastUpdated: null };
            }
            return stock;
        } catch (error) {
            console.error('Error reading stock:', error);
            return { key: `${productName}_${unit}`, productName, unit, quantity: 0, lastUpdated: null };
        }
    }

    static async addStock(productName, quantity, unit) {
        try {
            const key = `${productName}_${unit}`;
            const stock = await this.getStock(productName, unit);

            stock.quantity += quantity;
            stock.lastUpdated = new Date().toISOString();

            await IndexedDBManager.put('inventory', { ...stock, key });
            await IndexedDBManager.logAction('add_stock', `${productName} +${quantity} ${unit}`);

            return stock.quantity;
        } catch (error) {
            console.error('Error updating stock:', error);
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

            await IndexedDBManager.put('inventory', { ...stock, key });
            await IndexedDBManager.logAction('remove_stock', `${productName} -${quantity} ${unit}`);

            return stock.quantity;
        } catch (error) {
            console.error('Error removing stock:', error);
            throw error;
        }
    }

    static async checkAvailability(productName, quantity, unit) {
        try {
            if (config.isWarehouseProduct(productName)) {
                return { available: true, stock: 0 };
            }

            const stock = await this.getStock(productName, unit);
            const available = stock.quantity >= quantity;

            return {
                available,
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

class IndexedDBManager {
    static DB_NAME = 'GalaBaluvanaDB';
    static DB_VERSION = 1;
    static db = null;
    static isAvailable = false;
    static cloneFallback(value) {
        if (Array.isArray(value)) {
            return [...value];
        }

        if (value && typeof value === 'object') {
            return { ...value };
        }

        return value;
    }

    static safeParseJSON(rawValue, fallback, context = 'localStorage') {
        if (!rawValue) {
            return this.cloneFallback(fallback);
        }

        try {
            const parsed = JSON.parse(rawValue);

            if (Array.isArray(fallback)) {
                return Array.isArray(parsed) ? parsed : this.cloneFallback(fallback);
            }

            if (fallback && typeof fallback === 'object') {
                return parsed && typeof parsed === 'object' ? parsed : this.cloneFallback(fallback);
            }

            return parsed;
        } catch (error) {
            console.warn(`IndexedDBManager: invalid JSON in ${context}, falling back to default`, error);
            return this.cloneFallback(fallback);
        }
    }

    static async init() {
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

                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('type', 'type', { unique: false });
                    historyStore.createIndex('location', 'location', { unique: false });
                    historyStore.createIndex('productName', 'productName', { unique: false });
                    console.log('✅ Created object store: history');
                }

                if (!db.objectStoreNames.contains('drafts')) {
                    db.createObjectStore('drafts', { keyPath: 'storeName' });
                    console.log('✅ Created object store: drafts');
                }

                if (!db.objectStoreNames.contains('purchaseDrafts')) {
                    db.createObjectStore('purchaseDrafts', { keyPath: 'locationName' });
                    console.log('✅ Created object store: purchaseDrafts');
                }

                if (!db.objectStoreNames.contains('inventory')) {
                    const inventoryStore = db.createObjectStore('inventory', { keyPath: 'key' });
                    inventoryStore.createIndex('productName', 'productName', { unique: false });
                    inventoryStore.createIndex('quantity', 'quantity', { unique: false });
                    console.log('✅ Created object store: inventory');
                }

                if (!db.objectStoreNames.contains('logs')) {
                    db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                    console.log('✅ Created object store: logs');
                }
            };
        });
    }

    static getTransaction(storeName, mode = 'readonly') {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        const tx = this.db.transaction(storeName, mode);
        tx.onerror = (event) => {
            console.error('Transaction error:', event.target.error);
        };
        return tx;
    }

    static async get(storeName, key) {
        if (!this.isAvailable || !this.db) {
            return this.getFromLocalStorage(storeName, key);
        }

        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction(storeName);
                const store = tx.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async getAll(storeName) {
        if (!this.isAvailable || !this.db) {
            return this.getAllFromLocalStorage(storeName);
        }

        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction(storeName);
                const store = tx.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async put(storeName, data) {
        if (!this.isAvailable || !this.db) {
            return this.saveToLocalStorage(storeName, data);
        }

        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.put(data);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async delete(storeName, key) {
        if (!this.isAvailable || !this.db) {
            return this.deleteFromLocalStorage(storeName, key);
        }

        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.delete(key);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async clear(storeName) {
        if (!this.isAvailable || !this.db) {
            return this.clearLocalStorage(storeName);
        }

        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    static async getHistory(limit = 100) {
        const items = await this.getAll('history');
        return items
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    static async addToHistory(item) {
        if (!item.timestamp) {
            item.timestamp = new Date().toISOString();
        }
        await this.put('history', item);
    }

    static async clearHistory() {
        await this.clear('history');
    }

    static async logAction(type, details) {
        try {
            const logEntry = {
                type,
                details,
                timestamp: new Date().toISOString()
            };

            if (!this.isAvailable || !this.db) {
                const logs = this.safeParseJSON(localStorage.getItem('logs'), [], 'logs');
                logs.push(logEntry);
                localStorage.setItem('logs', JSON.stringify(logs));
                return;
            }

            const tx = this.getTransaction('logs', 'readwrite');
            const store = tx.objectStore('logs');
            store.add(logEntry);
        } catch (error) {
            console.error('Error logging action:', error);
        }
    }

    static async migrateFromLocalStorage() {
        const history = this.safeParseJSON(localStorage.getItem('delivery_history'), [], 'delivery_history');
        for (const item of history) {
            await this.put('history', item);
        }

        const drafts = this.safeParseJSON(localStorage.getItem('delivery_drafts'), {}, 'delivery_drafts');
        for (const storeName of Object.keys(drafts)) {
            await this.put('drafts', drafts[storeName]);
        }

        const purchaseDrafts = this.safeParseJSON(localStorage.getItem('purchase_drafts'), {}, 'purchase_drafts');
        for (const locationName of Object.keys(purchaseDrafts)) {
            await this.put('purchaseDrafts', purchaseDrafts[locationName]);
        }

        localStorage.setItem('migrated_to_indexeddb', 'true');
    }

    static getLocalStorageKey(storeName) {
        return `indexeddb_fallback_${storeName}`;
    }

    static getFromLocalStorage(storeName, key) {
        const data = this.safeParseJSON(
            localStorage.getItem(this.getLocalStorageKey(storeName)),
            {},
            `${storeName}-store`
        );
        return data[key] || null;
    }

    static getAllFromLocalStorage(storeName) {
        const data = this.safeParseJSON(
            localStorage.getItem(this.getLocalStorageKey(storeName)),
            {},
            `${storeName}-store`
        );
        return Object.values(data);
    }

    static saveToLocalStorage(storeName, value) {
        const data = this.safeParseJSON(
            localStorage.getItem(this.getLocalStorageKey(storeName)),
            {},
            `${storeName}-store`
        );
        const key = value?.storeName || value?.locationName || value?.key || value?.id;
        if (!key) {
            console.warn('IndexedDBManager: cannot determine key for localStorage save', { storeName, value });
            return false;
        }
        data[key] = value;
        localStorage.setItem(this.getLocalStorageKey(storeName), JSON.stringify(data));
        return true;
    }

    static deleteFromLocalStorage(storeName, key) {
        const data = this.safeParseJSON(
            localStorage.getItem(this.getLocalStorageKey(storeName)),
            {},
            `${storeName}-store`
        );
        delete data[key];
        localStorage.setItem(this.getLocalStorageKey(storeName), JSON.stringify(data));
        return true;
    }

    static clearLocalStorage(storeName) {
        localStorage.removeItem(this.getLocalStorageKey(storeName));
        return true;
    }
}

export {
    AppState,
    SecureStorageManager,
    DraftManager,
    PurchaseDraftManager,
    InventoryManager,
    IndexedDBManager
};
