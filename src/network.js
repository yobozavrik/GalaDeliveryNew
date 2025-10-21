import { config } from './config.js';

const FALLBACK_ERROR_SIGNATURE = 'webhook "POST deliverygb" is not registered';

const parseJsonSafely = (text) => {
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        console.warn('Failed to parse JSON response:', error);
        return text;
    }
};

const shouldRetryWithTestWebhook = (error) => {
    if (!error || error.status !== 404) {
        return false;
    }

    const body = typeof error.body === 'string' ? error.body : '';

    if (!body) {
        return false;
    }

    try {
        const parsed = JSON.parse(body);
        const message = typeof parsed?.message === 'string' ? parsed.message : '';
        return message.includes(FALLBACK_ERROR_SIGNATURE);
    } catch (parseError) {
        return body.includes(FALLBACK_ERROR_SIGNATURE) || body.includes('requested webhook');
    }
};

const postJsonToWebhook = async (url, payload) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
            mode: 'cors'
        });

        const text = await response.text();
        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            error.body = text;
            error.url = url;
            throw error;
        }

        return parseJsonSafely(text);
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            const abortError = new Error('Request timed out');
            abortError.status = 408;
            throw abortError;
        }
        throw error;
    }
};

const sendWithFallback = async (payload) => {
    const shouldAllowFallback = !config.isTestMode && config.N8N_WEBHOOK_URL !== config.testWebhookUrl;
    const urlsToTry = [config.N8N_WEBHOOK_URL];

    if (shouldAllowFallback) {
        urlsToTry.push(config.testWebhookUrl);
    }

    let lastError = null;

    for (let index = 0; index < urlsToTry.length; index += 1) {
        const url = urlsToTry[index];

        try {
            if (index > 0) {
                console.warn('Retrying with backup webhook URL:', url);
            }
            return await postJsonToWebhook(url, payload);
        } catch (error) {
            lastError = error;

            const canRetry = index === 0 && shouldAllowFallback && shouldRetryWithTestWebhook(error);
            if (!canRetry) {
                break;
            }
        }
    }

    throw lastError;
};

class SecureApiClient {
    static async sendPurchase(data, file = null) {
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

        const payload = {
            ...data,
            photo: photoBase64,
            photoFilename: file ? `${data.productName.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.jpg` : null
        };

        try {
            return await sendWithFallback(payload);
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    static async sendUnloadingBatch(storeName, items) {
        const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
        const totalItems = items.length;

        const payload = {
            type: 'Відвантаження',
            storeName,
            totalItems,
            totalAmount: Number(totalAmount.toFixed(2)),
            items: items.map(item => ({
                productName: item.productName,
                quantity: item.quantity,
                unit: item.unit,
                pricePerUnit: item.pricePerUnit,
                totalAmount: item.totalAmount,
                timestamp: item.timestamp,
                source: item.source || 'purchase'
            })),
            createdAt: new Date().toISOString()
        };

        try {
            return await sendWithFallback(payload);
        } catch (error) {
            console.error('Batch API Error:', error);
            throw error;
        }
    }

    static async sendPurchaseBatch(locationName, items) {
        const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
        const totalItems = items.length;

        const payload = {
            type: 'Закупка',
            locationName,
            totalItems,
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
            return await sendWithFallback(payload);
        } catch (error) {
            console.error('Purchase Batch API Error:', error);
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
        if (!config.GEMINI_API_URL) {
            throw new Error('Gemini API not configured');
        }

        const base64Image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });

        const prompt = `Ти - експерт з розпізнавання чеків з магазину METRO. Проаналізуй це фото чека і витягни ВСІХ товари.\n\nДля КОЖНОГО товару вкажи:\n1. Точна назва товару українською (якщо на чеку російською - переклади на українську)\n2. Кількість (число)\n3. Одиниця виміру (кг, шт, упаковка, ящик, пучок, або інше)\n4. Ціна за одиницю (число в гривнях)\n\nВАЖЛИВО:\n- Якщо кількість вказана в грамах (г) - переведи в кілограми (кг)\n- Якщо на чеку вказана загальна сума, а не ціна за одиницю - розрахуй ціну за одиницю\n- Ігноруй рядки які не є товарами (підсумки, знижки, загальні суми)\n- Відповідь ТІЛЬКИ в форматі JSON масиву\n\nФормат відповіді:\n[\n  {\n    \"productName\": \"Назва товару\",\n    \"quantity\": 1.5,\n    \"unit\": \"kg\",\n    \"pricePerUnit\": 45.50\n  }\n]\n\nМожливі значення unit: kg, piece, pack, box, bunch, other\n\nВідповідай ТІЛЬКИ JSON масивом, без додаткових пояснень.`;

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
}

export { SecureApiClient };
