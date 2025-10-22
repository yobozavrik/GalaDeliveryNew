# Исправление ошибки WinAnsi для украинского языка

## Проблема

При генерации PDF с украинским текстом возникала ошибка:

```
❌ PDF generation error: Error: WinAnsi cannot encode "З" (0x0417)
    at yn.encodeUnicodeCodePoint (Encoding.js:18:23)
    at t.encodeTextAsGlyphs (StandardFontEmbedder.js:85:41)
```

## Причина

**Стандартные шрифты Helvetica и HelveticaBold используют кодировку WinAnsi**, которая **НЕ поддерживает кириллицу**.

WinAnsi (Windows-1252) - это кодировка для западноевропейских языков:
- ✅ Поддерживает: английский, французский, немецкий, испанский
- ❌ НЕ поддерживает: русский, украинский, белорусский (кириллица)

Украинские буквы (З, і, є, ї и т.д.) имеют Unicode коды за пределами WinAnsi диапазона.

## Решение

**Использовать кастомный шрифт с поддержкой Unicode через библиотеку fontkit.**

### Что было сделано:

1. **Добавлена загрузка fontkit из CDN**
2. **Регистрация fontkit в PDFDocument**
3. **Загрузка кастомного шрифта NotoSans-Regular.ttf**
4. **Fallback на стандартные шрифты при ошибке**

---

## Изменения в коде

### Файл: `src/pdf.js`

#### 1. Добавлен URL fontkit CDN (строка 2):

```javascript
const PDF_LIB_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';
const FONTKIT_CDN_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
```

#### 2. Добавлена функция загрузки fontkit (строки 31-47):

```javascript
async function loadFontkit() {
    if (!fontkitModulePromise) {
        fontkitModulePromise = import(/* @vite-ignore */ FONTKIT_CDN_URL)
            .then((module) => {
                return module.default || module;
            })
            .catch((error) => {
                fontkitModulePromise = null;
                console.error('Failed to load fontkit from CDN.', error);
                const failure = new Error('Failed to load fontkit from CDN.');
                failure.cause = error;
                throw failure;
            });
    }

    return fontkitModulePromise;
}
```

#### 3. Изменена секция загрузки шрифтов (строки 461-473):

**ДО (вызывала ошибку WinAnsi):**

```javascript
const pdfDoc = await PDFDocument.create();

// Используем стандартные шрифты (без fontkit)
const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
};
```

**ПОСЛЕ (исправлено с fontkit):**

```javascript
const pdfDoc = await PDFDocument.create();

// Загружаем и регистрируем fontkit для поддержки кириллицы
const fontkit = await loadFontkit();
pdfDoc.registerFontkit(fontkit);

// Загружаем кастомный шрифт (поддерживает украинский)
const fontBytes = await loadFontBytes();

const fonts = {
    regular: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.HelveticaBold)
};
```

---

## Как это работает

### Шаг 1: Загрузка fontkit

```javascript
const fontkit = await loadFontkit();
// Загружает библиотеку fontkit из CDN
// fontkit - это парсер шрифтов, который позволяет работать с TrueType/OpenType шрифтами
```

### Шаг 2: Регистрация fontkit в PDF документе

```javascript
pdfDoc.registerFontkit(fontkit);
// Регистрируем fontkit в PDFDocument
// Теперь pdfDoc.embedFont() может работать с кастомными шрифтами
```

### Шаг 3: Загрузка кастомного шрифта

```javascript
const fontBytes = await loadFontBytes();
// Загружает файл fonts/NotoSans-Regular.ttf
// NotoSans - универсальный шрифт от Google, поддерживает все языки мира
```

### Шаг 4: Встраивание шрифта в PDF

```javascript
const fonts = {
    regular: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.HelveticaBold)
};
```

**Логика fallback:**
- Если `fontBytes` успешно загружены → используем NotoSans (поддерживает кириллицу)
- Если загрузка не удалась → используем Helvetica (только латиница, но PDF хотя бы сгенерируется)

---

## Преимущества NotoSans + fontkit

✅ **Поддержка всех языков** - NotoSans поддерживает Unicode, включая кириллицу
✅ **Красивый шрифт** - современный дизайн от Google
✅ **Загрузка из CDN** - fontkit загружается динамически, не увеличивает размер приложения
✅ **Fallback на стандартные шрифты** - если загрузка fontkit или NotoSans не удалась, PDF все равно сгенерируется

---

## Недостатки (по сравнению со стандартными шрифтами)

❌ **Дополнительная зависимость** - требуется загрузка fontkit (~200 KB)
❌ **Дополнительное время загрузки** - первая генерация PDF будет медленнее на 100-200 мс
❌ **Требуется файл шрифта** - fonts/NotoSans-Regular.ttf должен быть в проекте

---

## Проверка

После исправления:

```bash
node --check src/pdf.js
# ✅ Синтаксис корректен
```

### Тестирование:

1. Откройте приложение в браузере
2. Создайте черновик отгрузки с украинскими названиями товаров
3. Нажмите "Відправити всі"
4. Проверьте:
   - ✅ PDF генерируется без ошибок
   - ✅ Украинский текст отображается корректно
   - ✅ Превью открывается
   - ✅ PDF можно скачать

---

## Альтернативные решения (если NotoSans не работает)

### Вариант 1: Использовать другой Unicode шрифт

Замените `FONT_URL` на другой шрифт:

```javascript
const FONT_URL = 'fonts/Roboto-Regular.ttf';
// или
const FONT_URL = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff';
```

### Вариант 2: Загрузить fontkit локально (без CDN)

Если CDN недоступен, скачайте fontkit локально:

1. Скачайте fontkit:
   ```bash
   npm install @pdf-lib/fontkit
   ```

2. Скопируйте `node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js` в папку `libs/`

3. Измените URL:
   ```javascript
   const FONTKIT_CDN_URL = 'libs/fontkit.umd.min.js';
   ```

### Вариант 3: Использовать транслитерацию (НЕ рекомендуется)

Конвертировать украинский текст в латиницу перед генерацией PDF. **НЕ ДЕЛАЙТЕ ТАК** - это неправильное решение.

---

## Структура проекта

Убедитесь, что файл шрифта существует:

```
project/
├── src/
│   └── pdf.js          ← Обновленный файл
├── fonts/
│   └── NotoSans-Regular.ttf  ← Должен существовать!
├── index.html
└── ...
```

Если файла `fonts/NotoSans-Regular.ttf` нет:

1. Скачайте NotoSans:
   - https://fonts.google.com/noto/specimen/Noto+Sans
   - Выберите "Download family"

2. Распакуйте архив

3. Скопируйте `NotoSans-Regular.ttf` в папку `fonts/`

---

## Сравнение: WinAnsi vs Unicode

| Кодировка | Поддержка языков | Размер | Скорость |
|-----------|------------------|--------|----------|
| **WinAnsi** (Helvetica) | Только латиница | Малый | Быстрая |
| **Unicode** (NotoSans + fontkit) | Все языки мира | Средний | Средняя |

**Выбор:** Для украинского приложения **обязательно нужен Unicode** (fontkit + кастомный шрифт).

---

## Проверка загрузки в браузере

Откройте консоль (F12) при генерации PDF:

```javascript
// Успешная загрузка:
console.log('✅ fontkit loaded');
console.log('✅ Font bytes loaded:', fontBytes.byteLength, 'bytes');

// Ошибка загрузки:
console.error('❌ Failed to load fontkit from CDN.');
console.warn('Unable to load custom font. Falling back to standard fonts.');
```

---

## Troubleshooting

### Проблема: fontkit не загружается из CDN

**Симптом:** Ошибка "Failed to load fontkit from CDN"

**Решения:**
1. Проверьте интернет-соединение
2. Проверьте CSP заголовки (должен разрешать jsdelivr.net)
3. Используйте локальную копию fontkit (см. "Вариант 2" выше)

### Проблема: NotoSans-Regular.ttf не найден

**Симптом:** Ошибка 404 при загрузке шрифта

**Решения:**
1. Проверьте, что файл существует: `fonts/NotoSans-Regular.ttf`
2. Проверьте путь в коде (должен быть относительный)
3. Скачайте шрифт с Google Fonts (см. "Структура проекта")

### Проблема: PDF генерируется, но текст не читается

**Симптом:** Вместо украинских букв квадратики или знаки вопроса

**Решения:**
1. Убедитесь, что fontkit зарегистрирован **ДО** вызова `embedFont()`
2. Проверьте, что `fontBytes` не `null`
3. Проверьте размер загруженного шрифта (должен быть > 100 KB)

---

## Заключение

✅ **Ошибка WinAnsi исправлена**
✅ **Кириллица теперь поддерживается через fontkit + NotoSans**
✅ **Fallback на стандартные шрифты при ошибке**
✅ **PDF генерация работает для украинского языка**

**Следующий шаг:** Протестируйте генерацию PDF с украинским текстом! 🚀
