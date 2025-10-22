# Реализация отправки с обязательным PDF

## Статус реализации: В процессе

### ✅ Завершено:
1. Улучшена функция генерации PDF (src/pdf.js)
   - Добавлена колонка "Джерело" (источник товара)
   - Разделены дата и время на отдельные поля
   - Добавлен общий вес в метаданные
   - Имя файла: "Відвантаження_Гравітон_22-10-2025_14-35.pdf"

2. Создано модальное окно превью PDF (index.html)
   - Показывает все данные перед отправкой
   - Кнопка "Завантажити PDF" (скачать локально)
   - Кнопка "Підтвердити та відправити" (подтверждение)
   - Кнопка "Скасувати" (отмена)

3. Добавлены стили для модального окна (styles.css)
   - Адаптивный дизайн
   - Поддержка темной темы
   - Анимации и переходы

### 🔄 В процессе:
4. Вспомогательные функции (app.js) - СЛЕДУЮЩИЙ ШАГ
5. Функция отправки с PDF на сервер (network.js или src/network.js)
6. Переписать submitDraft() с новой логикой
7. Тестирование всего процесса

---

## Детали реализации

### 1. Улучшения в PDF (src/pdf.js)

#### Изменения в структуре таблицы:
```javascript
// БЫЛО:
const TABLE_COLUMNS = [
    { key: 'productName', title: 'Товар', width: 220 },
    { key: 'quantity', title: 'Кількість', width: 80 },
    { key: 'unit', title: 'Од.', width: 50 },
    { key: 'pricePerUnit', title: 'Ціна', width: 90 },
    { key: 'totalAmount', title: 'Сума', width: 95 }
];

// СТАЛО:
const TABLE_COLUMNS = [
    { key: 'productName', title: 'Товар', width: 150 },
    { key: 'quantity', title: 'Кільк.', width: 55 },
    { key: 'unit', title: 'Од.', width: 40 },
    { key: 'source', title: 'Джерело', width: 95 },    // ← ДОБАВЛЕНО
    { key: 'pricePerUnit', title: 'Ціна', width: 70 },
    { key: 'totalAmount', title: 'Сума', width: 70 }
];
```

#### Добавлена функция форматирования источника:
```javascript
function formatSource(source) {
    if (!source) {
        return '—';
    }
    if (source === 'purchase') {
        return 'Закупка';
    }
    // Названия складов передаются как есть (например, "Буча")
    return source;
}
```

#### Улучшены метаданные PDF:
```javascript
// БЫЛО:
const metadata = {
    storeName,
    submittedAt: new Date(submittedAt).toLocaleString('uk-UA'),
    itemsCount: resolvedItems.length,
    totalAmount: formatMoney(totalAmount),
    summary: summary || 'Документ згенеровано автоматично...'
};

// СТАЛО:
const metadata = {
    storeName,
    date: dateStr,           // ← Отдельная дата: "22.10.2025"
    time: timeStr,           // ← Отдельное время: "14:35"
    submittedAt: dateObj,    // ← Объект Date для использования
    itemsCount: resolvedItems.length,
    totalAmount: formatMoney(totalAmount),
    totalWeight: calculatedWeight,  // ← ДОБАВЛЕНО: общий вес в кг
    summary: summary || '...'
};
```

#### Улучшен формат имени файла:
```javascript
// БЫЛО:
const fileName = `${safeStoreName}-${timestamp}.pdf`;
// Пример: graviton-2025-10-22T14-35-22-000Z.pdf

// СТАЛО:
const fileName = `Відвантаження_${storeName}_${dateForFile}_${timeForFile}.pdf`;
// Пример: Відвантаження_Гравітон_22-10-2025_14-35.pdf
```

### 2. Модальное окно превью (index.html)

HTML структура:
```html
<div class="modal-overlay" id="pdfPreviewModal">
    <div class="modal-content glassmorphism pdf-preview-modal">
        <div class="modal-header">
            <h3>📄 Звіт готовий до відправки</h3>
            <button class="modal-close" id="closePdfPreviewBtn">
                <i data-lucide="x"></i>
            </button>
        </div>

        <div class="pdf-preview-content">
            <div class="pdf-info-card glassmorphism">
                <!-- Магазин -->
                <div class="pdf-info-row">
                    <span class="pdf-info-label">Магазин:</span>
                    <span class="pdf-info-value" id="pdfStoreName">—</span>
                </div>

                <!-- Дата -->
                <div class="pdf-info-row">
                    <span class="pdf-info-label">Дата:</span>
                    <span class="pdf-info-value" id="pdfDate">—</span>
                </div>

                <!-- Время -->
                <div class="pdf-info-row">
                    <span class="pdf-info-label">Час:</span>
                    <span class="pdf-info-value" id="pdfTime">—</span>
                </div>

                <div class="pdf-info-divider"></div>

                <!-- Количество товаров -->
                <div class="pdf-info-row">
                    <span class="pdf-info-label">Товарів:</span>
                    <span class="pdf-info-value" id="pdfItemsCount">—</span>
                </div>

                <!-- Общий вес -->
                <div class="pdf-info-row" id="pdfWeightRow">
                    <span class="pdf-info-label">Загальна вага:</span>
                    <span class="pdf-info-value" id="pdfTotalWeight">—</span>
                </div>

                <!-- Общая сумма (выделена) -->
                <div class="pdf-info-row pdf-info-highlight">
                    <span class="pdf-info-label">Сума:</span>
                    <span class="pdf-info-value pdf-info-amount" id="pdfTotalAmount">—</span>
                </div>
            </div>

            <!-- Кнопка скачать PDF -->
            <div class="pdf-preview-actions">
                <button class="btn-secondary" id="downloadPdfBtn">
                    <i data-lucide="download"></i>
                    <span>Завантажити PDF</span>
                </button>
            </div>
        </div>

        <!-- Действия -->
        <div class="modal-actions">
            <button class="btn-secondary" id="cancelPdfSubmitBtn">
                <i data-lucide="x"></i>
                <span>Скасувати</span>
            </button>
            <button class="btn-primary btn-large" id="confirmPdfSubmitBtn">
                <i data-lucide="check-circle"></i>
                <span>Підтвердити та відправити</span>
            </button>
        </div>
    </div>
</div>
```

---

## План дальнейшей реализации

### Шаг 4: Вспомогательные функции в app.js

Нужно добавить следующие функции:

```javascript
// 1. Подсчет общего веса
function calculateTotalWeight(items) {
    return items.reduce((sum, item) => {
        if (item.unit === 'kg') {
            return sum + (Number(item.quantity) || 0);
        }
        return sum;
    }, 0);
}

// 2. Подсчет общей суммы
function calculateTotalAmount(items) {
    return items.reduce((sum, item) => {
        return sum + (Number(item.totalAmount) || 0);
    }, 0);
}

// 3. Скачивание PDF файла
function downloadPdfFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// 4. Форматирование даты для имени файла
function formatDateForFilename(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year}_${hours}-${minutes}`;
}

// 5. Показ модального окна превью PDF (возвращает Promise<boolean>)
function showPdfPreviewModal(data) {
    return new Promise((resolve) => {
        const modal = document.getElementById('pdfPreviewModal');

        // Заполняем данные
        document.getElementById('pdfStoreName').textContent = data.storeName;
        document.getElementById('pdfDate').textContent = data.date;
        document.getElementById('pdfTime').textContent = data.time;
        document.getElementById('pdfItemsCount').textContent =
            `${data.items.length} ${data.items.length === 1 ? 'позиція' : data.items.length < 5 ? 'позиції' : 'позицій'}`;

        // Вес (показываем только если > 0)
        const weightRow = document.getElementById('pdfWeightRow');
        if (data.totalWeight && data.totalWeight > 0) {
            document.getElementById('pdfTotalWeight').textContent = `${data.totalWeight.toFixed(2)} кг`;
            weightRow.style.display = 'flex';
        } else {
            weightRow.style.display = 'none';
        }

        document.getElementById('pdfTotalAmount').textContent =
            `${data.totalAmount.toFixed(2)} ₴`;

        // Обработчики кнопок
        const confirmBtn = document.getElementById('confirmPdfSubmitBtn');
        const cancelBtn = document.getElementById('cancelPdfSubmitBtn');
        const closeBtn = document.getElementById('closePdfPreviewBtn');
        const downloadBtn = document.getElementById('downloadPdfBtn');

        const cleanup = () => {
            modal.classList.remove('visible');
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            closeBtn.replaceWith(closeBtn.cloneNode(true));
            downloadBtn.replaceWith(downloadBtn.cloneNode(true));
        };

        // Подтверждение
        document.getElementById('confirmPdfSubmitBtn').addEventListener('click', () => {
            cleanup();
            resolve(true);
        });

        // Отмена
        const cancelHandler = () => {
            cleanup();
            resolve(false);
        };
        document.getElementById('cancelPdfSubmitBtn').addEventListener('click', cancelHandler);
        document.getElementById('closePdfPreviewBtn').addEventListener('click', cancelHandler);

        // Скачать PDF
        document.getElementById('downloadPdfBtn').addEventListener('click', () => {
            downloadPdfFile(
                data.pdfBlob,
                `Відвантаження_${data.storeName}_${formatDateForFilename(new Date())}.pdf`
            );
            toastManager.show('PDF завантажено', 'success');
        });

        // Показываем модалку
        modal.classList.add('visible');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });
}

// 6. Показ модального окна ошибки PDF
function showPdfErrorModal(error) {
    toastManager.show(
        `Помилка генерації PDF: ${error.message}. Відправка неможлива без звіту.`,
        'error',
        5000
    );
}
```

### Шаг 5: Функция отправки с PDF на сервер (src/network.js)

Нужно добавить новый метод в `SecureApiClient`:

```javascript
static async sendUnloadingBatchWithPDF(storeName, items, pdfBlob) {
    if (!this.validateInput(storeName) || !Array.isArray(items) || items.length === 0) {
        throw new Error('Неправильні дані для відправки');
    }

    const webhookUrl = config.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error('URL вебхука не налаштовано');
    }

    // Создаем FormData для отправки файла и данных
    const formData = new FormData();

    // Данные в JSON
    const submittedAt = new Date();
    const data = {
        storeName,
        date: submittedAt.toLocaleDateString('uk-UA'),
        time: submittedAt.toLocaleTimeString('uk-UA', {
            hour: '2-digit',
            minute: '2-digit'
        }),
        items: items.map(item => ({
            productName: item.productName,
            quantity: Number(item.quantity),
            unit: item.unit,
            source: item.source,
            pricePerUnit: Number(item.pricePerUnit),
            totalAmount: Number(item.totalAmount),
            timestamp: item.timestamp
        })),
        totalAmount: items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
        totalWeight: items.reduce((sum, item) => {
            if (item.unit === 'kg') {
                return sum + Number(item.quantity || 0);
            }
            return sum;
        }, 0),
        submittedAt: submittedAt.toISOString()
    };

    // Добавляем JSON как строку
    formData.append('data', JSON.stringify(data));

    // Добавляем PDF файл
    const fileName = `Відвантаження_${storeName}_${submittedAt.toISOString().split('T')[0]}.pdf`;
    formData.append('pdf', pdfBlob, fileName);

    // Отправляем
    const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
        // НЕ устанавливаем Content-Type - браузер сам добавит boundary для multipart
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
}
```

**Альтернативный вариант (если n8n не поддерживает multipart):**

Отправлять PDF как base64 в JSON:

```javascript
static async sendUnloadingBatchWithPDF(storeName, items, pdfBlob) {
    // ... валидация

    // Конвертируем PDF в base64
    const pdfBase64 = await blobToBase64(pdfBlob);

    const submittedAt = new Date();
    const data = {
        storeName,
        date: submittedAt.toLocaleDateString('uk-UA'),
        time: submittedAt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
        items: items.map(item => ({ /* ... */ })),
        totalAmount: /* ... */,
        totalWeight: /* ... */,
        submittedAt: submittedAt.toISOString(),
        pdfBase64: pdfBase64,  // ← PDF как строка base64
        pdfFileName: `Відвантаження_${storeName}_${formatDateForFilename(submittedAt)}.pdf`
    };

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });

    // ... обработка ответа
}

// Вспомогательная функция
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1]; // Убираем префикс data:application/pdf;base64,
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
```

**Вопрос:** Какой вариант предпочтительнее для n8n webhook?

### Шаг 6: Новая реализация submitDraft()

```javascript
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

    // ===== ШАГ 1: ГЕНЕРАЦИЯ PDF (ОБЯЗАТЕЛЬНО!) =====
    submitBtn.disabled = true;
    if (submitBtnText) {
        submitBtnText.textContent = 'Генеруємо звіт...';
    }

    let pdfResult;
    try {
        const submissionTimestamp = new Date();
        const totalAmount = calculateTotalAmount(draft.items);
        const totalWeight = calculateTotalWeight(draft.items);

        pdfResult = await generateUnloadingReport({
            storeName,
            items: draft.items,
            submittedAt: submissionTimestamp,
            totalWeight,
            summary: `Відвантаження ${draft.items.length} позицій на суму ${totalAmount.toFixed(2)} ₴.`
        }, { download: false }); // НЕ скачиваем автоматически

        console.log('✅ PDF успешно сгенерирован');

    } catch (pdfError) {
        console.error('❌ PDF generation error:', pdfError);

        // БЛОКИРУЕМ отправку!
        submitBtn.disabled = false;
        if (submitBtnText) {
            submitBtnText.textContent = originalText;
        }

        showPdfErrorModal(pdfError);
        return; // СТОП! Без PDF не продолжаем
    }

    // ===== ШАГ 2: ПОКАЗЫВАЕМ ПРЕВЬЮ И ЖДЕМ ПОДТВЕРЖДЕНИЯ =====
    submitBtn.disabled = false;
    if (submitBtnText) {
        submitBtnText.textContent = originalText;
    }

    const confirmed = await showPdfPreviewModal({
        storeName,
        items: draft.items,
        date: new Date().toLocaleDateString('uk-UA'),
        time: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
        totalAmount: calculateTotalAmount(draft.items),
        totalWeight: calculateTotalWeight(draft.items),
        pdfBlob: pdfResult.blob
    });

    if (!confirmed) {
        // Пользователь отменил - PDF остается в памяти
        toastManager.show('Відправку скасовано', 'info');
        return;
    }

    // ===== ШАГ 3: ОТПРАВКА НА СЕРВЕР (ДАННЫЕ + PDF) =====
    submitBtn.disabled = true;
    if (submitBtnText) {
        submitBtnText.textContent = 'Відправляємо...';
    }

    try {
        // Отправляем данные + PDF на сервер
        await SecureApiClient.sendUnloadingBatchWithPDF(
            storeName,
            draft.items,
            pdfResult.blob
        );

        console.log('✅ Data and PDF sent to server');

        // ===== ШАГ 4: ЛОКАЛЬНОЕ СОХРАНЕНИЕ =====
        // Сохраняем в историю
        for (const item of draft.items) {
            await SecureStorageManager.addToHistory(item);

            // Обновляем inventory
            if (item.source === 'purchase') {
                await InventoryManager.removeStock(item.productName, item.quantity, item.unit);
            }
        }

        refreshOperationsSummaryIfVisible();

        // ===== ШАГ 5: СКАЧИВАЕМ PDF ЛОКАЛЬНО =====
        downloadPdfFile(pdfResult.blob, pdfResult.fileName);

        // ===== ШАГ 6: УСПЕХ - УДАЛЯЕМ ЧЕРНОВИК =====
        await DraftManager.deleteDraft(storeName);

        toastManager.show(
            `Відправлено ${draft.items.length} товарів. PDF збережено у завантаженнях`,
            'success'
        );

        // Возвращаемся к списку черновиков
        appState.setScreen('drafts-list');
        await showDraftsList();

    } catch (serverError) {
        console.error('❌ Server submit error:', serverError);

        // Сервер упал, но PDF уже есть - сохраняем его локально
        downloadPdfFile(pdfResult.blob, pdfResult.fileName);

        toastManager.show(
            'Помилка відправки на сервер. PDF збережено локально. Спробуйте ще раз',
            'error',
            5000
        );

        // Черновик НЕ удаляем - можно повторить отправку
    } finally {
        submitBtn.disabled = false;
        if (submitBtnText) {
            submitBtnText.textContent = originalText;
        }
    }
}
```

---

## Обработка ошибок

### Сценарий 1: PDF не создался
```
❌ generateUnloadingReport() упал
    ↓
Показываем ошибку пользователю
    ↓
БЛОКИРУЕМ отправку
    ↓
Черновик остается
    ↓
Пользователь может попробовать снова
```

### Сценарий 2: PDF создался, пользователь отменил
```
✅ PDF создан
    ↓
Показываем превью
    ↓
Пользователь нажал "Скасувати"
    ↓
Возвращаемся к черновику
    ↓
PDF остается в памяти браузера (не скачан)
    ↓
При повторном нажатии - генерируем PDF заново
```

### Сценарий 3: PDF создался, сервер упал
```
✅ PDF создан
    ↓
Пользователь подтвердил
    ↓
❌ SecureApiClient.sendUnloadingBatchWithPDF() упал
    ↓
Скачиваем PDF локально
    ↓
Показываем ошибку
    ↓
Черновик НЕ удаляем
    ↓
Пользователь может повторить отправку
```

### Сценарий 4: Все успешно
```
✅ PDF создан
    ↓
Пользователь подтвердил
    ↓
✅ Данные + PDF отправлены на сервер
    ↓
✅ Сохранено в локальную историю
    ↓
✅ PDF скачан локально
    ↓
✅ Черновик удален
    ↓
✅ Возврат к списку черновиков
```

---

## Backend (n8n webhook)

### Что нужно настроить на сервере:

1. **Прием multipart/form-data** или **JSON с base64**

2. **Парсинг данных:**
   - `data` (JSON) - информация о товарах
   - `pdf` (File/base64) - PDF файл

3. **Сохранение PDF:**
   - Google Drive (создать папку для отчетов)
   - Получить ссылку на файл

4. **Отправка уведомлений:**
   - Gmail: отправить письмо с прикрепленным PDF
   - Telegram: отправить сообщение + PDF как документ

5. **Ответ клиенту:**
```json
{
  "success": true,
  "message": "Відправлено успішно",
  "pdfUrl": "https://drive.google.com/file/d/...",
  "emailSent": true,
  "telegramSent": true
}
```

---

## Следующие шаги

1. ✅ Улучшить PDF генератор - ЗАВЕРШЕНО
2. ✅ Создать модальное окно - ЗАВЕРШЕНО
3. ✅ Добавить стили - ЗАВЕРШЕНО
4. ⏳ Добавить вспомогательные функции в app.js - В РАБОТЕ
5. ⏳ Создать функцию отправки с PDF
6. ⏳ Переписать submitDraft()
7. ⏳ Протестировать процесс

После завершения кода нужно будет:
- Настроить n8n webhook для приема PDF
- Настроить интеграции (Google Drive, Gmail, Telegram)
- Протестировать весь flow от начала до конца
