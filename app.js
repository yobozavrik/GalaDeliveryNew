import { config } from './src/config.js';
import { InputValidator } from './src/validation.js';
import {
    AppState,
    SecureStorageManager,
    DraftManager,
    PurchaseDraftManager,
    InventoryManager,
    IndexedDBManager
} from './src/state.js';
import { SecureApiClient } from './src/network.js';
import {
    SkeletonLoader,
    AnimationManager,
    ToastManager,
    ThemeManager,
    AppUIAdapter
} from './src/ui.js';
import { generateUnloadingReport } from './src/pdf.js';

// Optimized and secured GalaBaluvanaDelivery App

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
// GLOBAL INSTANCES
// ============================================
const appUI = new AppUIAdapter();
const appState = new AppState(appUI);
const toastManager = new ToastManager();
let selectedFile = null;
let receiptPhotoFile = null;
let receiptPhotoSource = null;
let recognizedItems = [];
let receiptCameraStream = null;
let editingRecognizedIndex = null;

const currencyFormatter = new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});
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

    if (appState.screen === 'receipt-scan') {
    }

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
    } else if (appState.screen === 'operations-detail') {
        appState.setScreen('operations-summary', { isUnloading: false, isDelivery: false, operationType: null });
        await renderOperationsSummary();
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

async function showOperationsSummary() {
function summarizeOperationItems(items) {
    const totalAmount = items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
    const totalWeight = items.reduce((sum, item) => {
        if (item.unit === 'kg') {
            return sum + (Number(item.quantity) || 0);
        }
        return sum;
    }, 0);

    const uniqueProducts = Array.from(new Set(items.map(item => item.productName).filter(Boolean)));

    return {
        totalAmount,
        totalWeight,
        uniqueProducts
    };
}

function formatProductsList(products) {
    if (!products.length) return '—';

    const preview = products.slice(0, 3).join(', ');
    const rest = products.length > 3 ? ` +${products.length - 3}` : '';
    return `${preview}${rest}`;
}
async function renderOperationsSummary() {
    const dateElement = document.getElementById('operationsSummaryDate');
    const purchaseSubtitle = document.getElementById('purchaseOperationSubtitle');
    const unloadingSubtitle = document.getElementById('unloadingOperationSubtitle');
    const purchaseAmount = document.getElementById('purchaseTotalAmount');
    const purchaseWeight = document.getElementById('purchaseTotalWeight');
    const purchaseProducts = document.getElementById('purchaseProductsList');
    const unloadingAmount = document.getElementById('unloadingTotalAmount');
    const unloadingWeight = document.getElementById('unloadingTotalWeight');
    const unloadingProducts = document.getElementById('unloadingProductsList');
    const emptyState = document.getElementById('operationsEmpty');
    const cardsContainer = document.getElementById('operationsCards');

    if (!dateElement || !purchaseSubtitle || !unloadingSubtitle || !purchaseAmount || !purchaseWeight
        || !purchaseProducts || !unloadingAmount || !unloadingWeight || !unloadingProducts
        || !emptyState || !cardsContainer) {
        return;
    }

    const today = new Date();
    const formatterOptions = { weekday: 'long', day: '2-digit', month: 'long' };
    dateElement.textContent = today.toLocaleDateString('uk-UA', formatterOptions);

    const items = await SecureStorageManager.getHistoryItems();
    const purchaseItems = todaysItems.filter(item => item.type === 'Закупка');
    const unloadingItems = todaysItems.filter(item => item.type === 'Відвантаження');

    const purchaseStats = summarizeOperationItems(purchaseItems);
    const unloadingStats = summarizeOperationItems(unloadingItems);

    const formatAmount = (amount) => currencyFormatter.format(Math.round(amount * 100) / 100);
    const formatWeight = (weight) => weight > 0 ? `${weight.toFixed(2)} кг` : '—';

    purchaseAmount.textContent = formatAmount(purchaseStats.totalAmount);
    purchaseWeight.textContent = formatWeight(purchaseStats.totalWeight);
    purchaseProducts.textContent = formatProductsList(purchaseStats.uniqueProducts);
    purchaseSubtitle.textContent = purchaseItems.length
        ? `${purchaseItems.length} ${purchaseItems.length === 1 ? 'операція' : 'операції'}`
        : 'Немає операцій';

    unloadingAmount.textContent = formatAmount(unloadingStats.totalAmount);
    unloadingWeight.textContent = formatWeight(unloadingStats.totalWeight);
    unloadingProducts.textContent = formatProductsList(unloadingStats.uniqueProducts);
    unloadingSubtitle.textContent = unloadingItems.length
        ? `${unloadingItems.length} ${unloadingItems.length === 1 ? 'операція' : 'операції'}`
        : 'Немає операцій';

    const hasOperations = purchaseItems.length > 0 || unloadingItems.length > 0;
    emptyState.style.display = hasOperations ? 'none' : 'flex';
    cardsContainer.style.display = hasOperations ? 'grid' : 'none';

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
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
        const submissionTimestamp = new Date();
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

        refreshOperationsSummaryIfVisible();

        toastManager.show(`Відправлено ${draft.items.length} ${draft.items.length === 1 ? 'товар' : draft.items.length < 5 ? 'товари' : 'товарів'}`, 'success');

        const totalAmount = draft.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
        const totalAmountText = Number.isFinite(totalAmount) ? totalAmount.toFixed(2) : '0.00';
        try {
            await generateUnloadingReport({
                storeName,
                items: draft.items,
                submittedAt: submissionTimestamp,
                summary: `Відвантаження ${draft.items.length} позицій на суму ${totalAmountText} ₴.`
            });
        } catch (pdfError) {
            console.warn('Не вдалося створити PDF-звіт:', pdfError);
        }

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

        refreshOperationsSummaryIfVisible();

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

function populateRecognizedEditUnits() {
    const select = document.getElementById('recognizedEditUnit');
    if (!select) return;

    select.innerHTML = '';

    config.units.forEach(u => {
        const option = document.createElement('option');
        option.value = u.value;
        option.textContent = u.label;
        select.appendChild(option);
    });
}

function clearRecognizedEditErrors() {
    clearFieldError('recognizedEditName');
    clearFieldError('recognizedEditQuantity');
    clearFieldError('recognizedEditPrice');
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
        refreshOperationsSummaryIfVisible();

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
        refreshOperationsSummaryIfVisible();
        hideAiSummaryModal();
        toastManager.show('Історію та залишки очищено', 'success');
    }
}

// ============================================
// RECEIPT SCANNING FUNCTIONS
// ============================================

function stopReceiptCameraStream() {
    if (receiptCameraStream) {
        receiptCameraStream.getTracks().forEach(track => track.stop());
        receiptCameraStream = null;
    }

    const streamWrapper = document.getElementById('receiptCameraStreamWrapper');
    const video = document.getElementById('receiptCameraStream');
    const openCameraBtn = document.getElementById('openCameraBtn');
    const placeholder = document.getElementById('receiptCameraPlaceholder');
    const preview = document.getElementById('receiptPreview');

    if (streamWrapper) streamWrapper.style.display = 'none';
    if (video) video.srcObject = null;
    if (openCameraBtn) {
        openCameraBtn.dataset.mode = 'stream';
        const label = openCameraBtn.querySelector('span');
        if (label) label.textContent = 'Зробити фото';
    }
    if (placeholder) {
        const previewVisible = preview && preview.style.display !== 'none';
        placeholder.style.display = previewVisible ? 'none' : 'flex';
    }
}

async function openReceiptCamera() {
    const openCameraBtn = document.getElementById('openCameraBtn');
    const streamWrapper = document.getElementById('receiptCameraStreamWrapper');
    const video = document.getElementById('receiptCameraStream');
    const placeholder = document.getElementById('receiptCameraPlaceholder');
    const preview = document.getElementById('receiptPreview');

    if (!openCameraBtn || !streamWrapper || !video) {
        toastManager.show('Камеру не знайдено. Оновіть сторінку та спробуйте знову', 'error');
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        toastManager.show('Ваш пристрій не підтримує камеру або доступ заборонено', 'error');
        return;
    }

    const isCapturing = openCameraBtn.dataset.mode === 'capture';

    if (!isCapturing) {
        try {
            stopReceiptCameraStream();
            if (preview) preview.style.display = 'none';
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' }
                }
            });

            receiptCameraStream = stream;
            video.srcObject = stream;
            streamWrapper.style.display = 'block';
            await video.play().catch(() => {});

            openCameraBtn.dataset.mode = 'capture';
            const label = openCameraBtn.querySelector('span');
            if (label) label.textContent = 'Зробити знімок';
            if (placeholder) placeholder.style.display = 'none';
        } catch (error) {
            console.error('Receipt camera error:', error);
            toastManager.show('Не вдалося отримати доступ до камери', 'error');
        }
        return;
    }

    if (!video.videoWidth || !video.videoHeight) {
        toastManager.show('Камера ще не готова. Зачекайте та спробуйте знову', 'warning');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');

    if (!context) {
        toastManager.show('Не вдалося обробити зображення з камери', 'error');
        stopReceiptCameraStream();
        return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(new Error('Не вдалося зберегти фото'));
                }
            }, 'image/jpeg', 0.95);
        });

        const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
        receiptPhotoSource = 'camera';
        applyReceiptPhotoFile(file);
    } catch (error) {
        console.error('Receipt capture error:', error);
        toastManager.show('Не вдалося зробити фото чека', 'error');
    } finally {
        stopReceiptCameraStream();
    }
}

function showReceiptScanScreen() {
    stopReceiptCameraStream();
    appState.setScreen('receipt-scan');
    receiptPhotoFile = null;
    receiptPhotoSource = null;

    const preview = document.getElementById('receiptPreview');
    const processBtn = document.getElementById('processReceiptBtn');
    const actions = document.getElementById('receiptCameraActions');
    const previewImage = document.getElementById('receiptPreviewImage');
    const placeholder = document.getElementById('receiptCameraPlaceholder');
    if (preview) preview.style.display = 'none';
    if (previewImage) previewImage.src = '';
    if (processBtn) processBtn.style.display = 'none';
    if (actions) actions.style.display = 'flex';
    if (placeholder) placeholder.style.display = 'flex';
}

function applyReceiptPhotoFile(file) {
    if (!file) return false;

    if (!InputValidator.validateFile(file)) {
        toastManager.show('Файл занадто великий або непідтримуваний формат', 'error');
        return false;
    }

    receiptPhotoFile = file;

    const preview = document.getElementById('receiptPreview');
    const previewImage = document.getElementById('receiptPreviewImage');
    const processBtn = document.getElementById('processReceiptBtn');
    const actions = document.getElementById('receiptCameraActions');
    const placeholder = document.getElementById('receiptCameraPlaceholder');

    if (previewImage) {
        const previewUrl = URL.createObjectURL(file);
        previewImage.src = previewUrl;
        previewImage.onload = () => URL.revokeObjectURL(previewUrl);
    }

    if (preview) preview.style.display = 'block';
    if (processBtn) processBtn.style.display = 'block';
    if (actions) actions.style.display = 'flex';
    if (placeholder) placeholder.style.display = 'none';
}

function retakeReceiptPhoto() {
    receiptPhotoFile = null;
    receiptPhotoSource = null;

    stopReceiptCameraStream();

    const preview = document.getElementById('receiptPreview');
    const processBtn = document.getElementById('processReceiptBtn');
    const actions = document.getElementById('receiptCameraActions');
    const placeholder = document.getElementById('receiptCameraPlaceholder');
    if (preview) preview.style.display = 'none';
    if (processBtn) processBtn.style.display = 'none';
    if (actions) actions.style.display = 'flex';
    if (placeholder) placeholder.style.display = 'flex';
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

function updateRecognizedEditTotal() {
    const quantityInput = document.getElementById('recognizedEditQuantity');
    const priceInput = document.getElementById('recognizedEditPrice');
    const totalElement = document.getElementById('recognizedEditTotal');

    if (!quantityInput || !priceInput || !totalElement) return;

    const quantity = parseFloat(quantityInput.value);
    const price = parseFloat(priceInput.value);

    if (isNaN(quantity) || isNaN(price)) {
        totalElement.textContent = '0.00 ₴';
        return;
    }

    const total = (quantity * price).toFixed(2);
    totalElement.textContent = `${total} ₴`;
}

function closeRecognizedEditModal() {
    const modal = document.getElementById('recognizedItemEditModal');
    const form = document.getElementById('recognizedEditForm');
    const totalElement = document.getElementById('recognizedEditTotal');

    if (form) {
        form.reset();
    }

    if (totalElement) {
        totalElement.textContent = '0.00 ₴';
    }

    clearRecognizedEditErrors();
    editingRecognizedIndex = null;

    if (modal) {
        modal.classList.remove('visible');
    }
}

function editRecognizedItem(index) {
    const item = recognizedItems[index];
    const modal = document.getElementById('recognizedItemEditModal');
    const nameInput = document.getElementById('recognizedEditName');
    const quantityInput = document.getElementById('recognizedEditQuantity');
    const priceInput = document.getElementById('recognizedEditPrice');
    const unitSelect = document.getElementById('recognizedEditUnit');

    if (!item || !modal || !nameInput || !quantityInput || !priceInput || !unitSelect) {
        toastManager.show('Не вдалося відкрити редагування товару', 'error');
        return;
    }

    editingRecognizedIndex = index;
    clearRecognizedEditErrors();

    const sanitizedName = InputValidator.sanitizeString(item.productName || '');
    nameInput.value = sanitizedName;

    const quantityValue = typeof item.quantity === 'number'
        ? item.quantity
        : parseFloat(item.quantity) || 0;
    quantityInput.value = quantityValue.toString();

    const priceValue = typeof item.pricePerUnit === 'number'
        ? item.pricePerUnit
        : parseFloat(item.pricePerUnit) || 0;
    priceInput.value = priceValue.toFixed(2);

    const unitValue = item.unit || 'piece';
    const sanitizedUnitValue = InputValidator.sanitizeString(unitValue) || 'piece';

    if (![...unitSelect.options].some(option => option.value === sanitizedUnitValue)) {
        const fallbackOption = document.createElement('option');
        fallbackOption.value = sanitizedUnitValue;
        fallbackOption.textContent = sanitizedUnitValue;
        unitSelect.appendChild(fallbackOption);
    }

    unitSelect.value = sanitizedUnitValue;

    updateRecognizedEditTotal();

    modal.classList.add('visible');

    setTimeout(() => {
        nameInput.focus({ preventScroll: true });
    }, 50);
}

function handleRecognizedEditSubmit(event) {
    event.preventDefault();

    if (editingRecognizedIndex === null || !recognizedItems[editingRecognizedIndex]) {
        toastManager.show('Немає товару для редагування', 'error');
        return;
    }

    const nameInput = document.getElementById('recognizedEditName');
    const quantityInput = document.getElementById('recognizedEditQuantity');
    const priceInput = document.getElementById('recognizedEditPrice');
    const unitSelect = document.getElementById('recognizedEditUnit');

    if (!nameInput || !quantityInput || !priceInput || !unitSelect) {
        toastManager.show('Форма редагування недоступна', 'error');
        return;
    }

    clearRecognizedEditErrors();

    const rawName = nameInput.value.trim();
    const rawQuantity = quantityInput.value.trim();
    const rawPrice = priceInput.value.trim();
    const selectedUnit = unitSelect.value;

    if (!InputValidator.validateProductName(rawName)) {
        showFieldError('recognizedEditName', 'Назва товару повинна містити від 2 до 100 символів');
        return;
    }

    if (!InputValidator.validateQuantity(rawQuantity)) {
        showFieldError('recognizedEditQuantity', 'Кількість повинна бути більше 0 і не більше 10000');
        return;
    }

    if (!InputValidator.validatePrice(rawPrice)) {
        showFieldError('recognizedEditPrice', 'Ціна повинна бути від 0 до 100000');
        return;
    }

    const sanitizedName = InputValidator.sanitizeString(rawName);
    const quantity = parseFloat(rawQuantity);
    const pricePerUnit = parseFloat(rawPrice);
    const totalAmount = parseFloat((quantity * pricePerUnit).toFixed(2));

    recognizedItems[editingRecognizedIndex] = {
        ...recognizedItems[editingRecognizedIndex],
        productName: sanitizedName,
        quantity,
        unit: selectedUnit,
        pricePerUnit,
        totalAmount
    };

    toastManager.show('Товар оновлено', 'success');
    closeRecognizedEditModal();
    showRecognizedItemsScreen();
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

    populateRecognizedEditUnits();

    // Setup event listeners
    document.getElementById('backButton')?.addEventListener('click', handleBackButton);
    document.getElementById('startPurchaseBtn')?.addEventListener('click', startPurchase);
    document.getElementById('startUnloadingBtn')?.addEventListener('click', startUnloading);
    document.getElementById('operationsSummaryBtn')?.addEventListener('click', showOperationsSummary);
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
        stopReceiptCameraStream();
        appState.setScreen('purchase-form');
        appState.isUnloading = false;
        appState.isDelivery = false;
        setupPurchaseForm();
    });
    document.getElementById('openCameraBtn')?.addEventListener('click', openReceiptCamera);
    document.getElementById('chooseReceiptPhotoBtn')?.addEventListener('click', () => {
        const input = document.getElementById('receiptPhotoInput');
        if (!input) return;

        try {
            if (typeof input.showPicker === 'function') {
                input.showPicker();
                return;
            }
        } catch (error) {
            console.warn('Receipt picker error, falling back to click():', error);
        }

        input.click();
    });
    document.getElementById('receiptPhotoInput')?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        receiptPhotoSource = 'gallery';
        applyReceiptPhotoFile(file);
        event.target.value = '';
    });
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

    document.getElementById('recognizedEditForm')?.addEventListener('submit', handleRecognizedEditSubmit);
    document.getElementById('recognizedEditCancelBtn')?.addEventListener('click', closeRecognizedEditModal);
    document.getElementById('closeRecognizedEditBtn')?.addEventListener('click', closeRecognizedEditModal);
    document.getElementById('recognizedItemEditModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeRecognizedEditModal();
        }
    });
    document.getElementById('recognizedEditQuantity')?.addEventListener('input', updateRecognizedEditTotal);
    document.getElementById('recognizedEditPrice')?.addEventListener('input', updateRecognizedEditTotal);

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
