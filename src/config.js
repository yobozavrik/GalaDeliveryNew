// Configuration module extracted from app.js
// Provides the SecureConfig class and a shared singleton instance

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
            // Якщо режим не збережено, за замовчуванням використовуємо тестовий
            return storedMode || 'test';
        } catch (error) {
            console.warn('Cannot read mode from localStorage', error);
            return 'test';
        }
    }

    resolveWebhookUrl() {
        // Для локальної розробки завжди використовуємо прямий URL до n8n
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isLocalhost) {
            // На localhost завжди використовуємо прямий URL до n8n (тестовий або продакшн)
            return this.isTestMode
                ? 'https://n8n.dmytrotovstytskyi.online/webhook-test/deliverygb'
                : 'https://n8n.dmytrotovstytskyi.online/webhook/deliverygb';
        }

        // На Vercel використовуємо proxy для продакшн, прямий URL для тестів
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

const config = new SecureConfig();

export { SecureConfig, config };
