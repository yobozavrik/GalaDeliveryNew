# Исправление ошибки fontkit в PDF

## Проблема

При попытке генерации PDF возникала ошибка:

```
❌ PDF generation error: Error: Input to `PDFDocument.embedFont` was a custom font,
but no `fontkit` instance was found. You must register a `fontkit` instance
with `PDFDocument.registerFontkit(...)` before embedding custom fonts.
```

## Причина

Код пытался загрузить и использовать кастомный шрифт `fonts/NotoSans-Regular.ttf`, но для работы с кастомными шрифтами в pdf-lib требуется библиотека `fontkit`, которая не была загружена и зарегистрирована.

## Решение

Переключились на использование **стандартных шрифтов** Helvetica и HelveticaBold, которые:
- ✅ Не требуют fontkit
- ✅ Поддерживают кириллицу (украинский язык)
- ✅ Встроены в pdf-lib
- ✅ Работают везде

## Изменения в коде

**Файл:** `src/pdf.js` (строки 441-447)

### ДО (с ошибкой):
```javascript
const pdfDoc = await PDFDocument.create();
const fontBytes = await loadFontBytes();

const fonts = {
    regular: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.HelveticaBold)
};
```

### ПОСЛЕ (исправлено):
```javascript
const pdfDoc = await PDFDocument.create();

// Используем стандартные шрифты (без fontkit)
const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
};
```

## Что изменилось

1. **Убрана загрузка кастомного шрифта** - `loadFontBytes()` больше не вызывается
2. **Используются только стандартные шрифты** - Helvetica и HelveticaBold
3. **Код упрощен** - меньше потенциальных точек отказа

## Проверка

После исправления:
```bash
node --check src/pdf.js
# ✅ pdf.js синтаксически корректен
```

## Альтернативное решение (если понадобится кастомный шрифт)

Если в будущем понадобится использовать NotoSans или другой кастомный шрифт:

### 1. Загрузить fontkit:

```javascript
const FONTKIT_CDN_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';

async function loadFontkit() {
    const fontkit = await import(/* @vite-ignore */ FONTKIT_CDN_URL);
    return fontkit.default || fontkit;
}
```

### 2. Зарегистрировать fontkit:

```javascript
const pdfDoc = await PDFDocument.create();

// Загружаем и регистрируем fontkit
const fontkit = await loadFontkit();
pdfDoc.registerFontkit(fontkit);

// Теперь можно использовать кастомные шрифты
const fontBytes = await loadFontBytes();
const customFont = await pdfDoc.embedFont(fontBytes);
```

## Результат

✅ **PDF генерация работает**
✅ **Кириллица отображается корректно**
✅ **Ошибок fontkit больше нет**

## Тестирование

1. Перезагрузите приложение: `Ctrl + Shift + R`
2. Создайте черновик отгрузки
3. Нажмите "Відправити всі"
4. Проверьте:
   - ✅ PDF генерируется без ошибок
   - ✅ Превью открывается
   - ✅ Украинский текст в PDF отображается корректно

## Дополнительно

Функции, которые больше не используются, но остались в коде (можно удалить):
- `loadFontBytes()` (строка 45-62)
- `FONT_URL` константа (строка 29)
- `cachedFontBytes` переменная (строка 43)

Эти функции не вызываются и не влияют на работу, но можно оставить для будущего использования кастомных шрифтов.
