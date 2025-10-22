const PDF_LIB_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';
const FONTKIT_CDN_URL = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';

let pdfLibModulePromise = null;
let fontkitModulePromise = null;
let PDFDocument;
let StandardFonts;
let rgb;

async function loadPdfLib() {
    if (!pdfLibModulePromise) {
        pdfLibModulePromise = import(/* @vite-ignore */ PDF_LIB_CDN_URL)
            .then((module) => {
                PDFDocument = module.PDFDocument;
                StandardFonts = module.StandardFonts;
                rgb = module.rgb;
                return module;
            })
            .catch((error) => {
                pdfLibModulePromise = null;
                console.error('Failed to load pdf-lib from CDN.', error);
                const failure = new Error('Failed to load pdf-lib from CDN.');
                failure.cause = error;
                throw failure;
            });
    }

    return pdfLibModulePromise;
}

async function loadFontkit() {
    if (!fontkitModulePromise) {
        fontkitModulePromise = new Promise((resolve, reject) => {
            // Проверяем, не загружен ли fontkit уже через window.fontkit
            if (window.fontkit) {
                resolve(window.fontkit);
                return;
            }

            // Создаем script тег для загрузки fontkit
            const script = document.createElement('script');
            script.src = FONTKIT_CDN_URL;
            script.async = true;

            script.onload = () => {
                // После загрузки UMD модуля fontkit доступен через window.fontkit
                if (window.fontkit) {
                    console.log('✅ fontkit loaded successfully');
                    resolve(window.fontkit);
                } else {
                    reject(new Error('fontkit loaded but not found in window'));
                }
            };

            script.onerror = (error) => {
                fontkitModulePromise = null;
                console.error('Failed to load fontkit from CDN.', error);
                reject(new Error('Failed to load fontkit from CDN.'));
            };

            document.head.appendChild(script);
        });
    }

    return fontkitModulePromise;
}

// Массив URL шрифтов с поддержкой кириллицы (приоритет сверху вниз)
const FONT_URLS = [
    'https://cdn.jsdelivr.net/npm/@fontsource/roboto@4.5.8/files/roboto-cyrillic-400-normal.woff',
    'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@4.5.11/files/noto-sans-cyrillic-400-normal.woff',
    'fonts/Roboto-Regular.ttf' // Локальный fallback
];
const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGINS = { top: 60, right: 40, bottom: 60, left: 40 };
const TABLE_COLUMNS = [
    { key: 'productName', title: 'Товар', width: 150, align: 'left' },
    { key: 'quantity', title: 'Кільк.', width: 55, align: 'right' },
    { key: 'unit', title: 'Од.', width: 40, align: 'center' },
    { key: 'source', title: 'Джерело', width: 95, align: 'left' },
    { key: 'pricePerUnit', title: 'Ціна', width: 70, align: 'right' },
    { key: 'totalAmount', title: 'Сума', width: 70, align: 'right' }
];
const TABLE_PADDING_X = 6;
const LINE_HEIGHT = 16;

let cachedFontBytes = null;

async function loadFontBytes() {
    if (cachedFontBytes) {
        console.log('✅ Using cached font');
        return cachedFontBytes;
    }

    // Пробуем каждый URL по очереди
    for (let i = 0; i < FONT_URLS.length; i++) {
        const url = FONT_URLS[i];
        try {
            console.log(`📥 Trying to load font (attempt ${i + 1}/${FONT_URLS.length}):`, url);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            cachedFontBytes = await response.arrayBuffer();
            console.log('✅ Font loaded successfully from:', url);
            console.log('📦 Font size:', cachedFontBytes.byteLength, 'bytes');
            return cachedFontBytes;
        } catch (error) {
            console.warn(`⚠️ Failed to load from: ${url} - ${error.message}`);

            // Если это была последняя попытка
            if (i === FONT_URLS.length - 1) {
                console.error('❌ All font sources failed');
                console.warn('⚠️ Will try to use standard fonts (no Cyrillic support)');
                return null;
            }

            // Иначе пробуем следующий URL
            console.log('🔄 Trying next font source...');
        }
    }

    return null;
}

function formatMoney(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '';
    }

    return numericValue.toLocaleString('uk-UA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatQuantity(value) {
    if (value === undefined || value === null) {
        return '';
    }
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
        return numericValue % 1 === 0 ? numericValue.toString() : numericValue.toLocaleString('uk-UA');
    }
    return String(value);
}

function formatSource(source) {
    if (!source) {
        return '—';
    }
    if (source === 'purchase') {
        return 'Закупка';
    }
    // Названия складов передаются как есть
    return source;
}

function sanitizeFileName(value) {
    if (!value || typeof value !== 'string') {
        return 'unloading-report';
    }

    return value
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}\-]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'unloading-report';
}

function splitTextIntoLines(text, font, fontSize, maxWidth) {
    if (!text) {
        return [''];
    }

    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const tentativeLine = currentLine ? `${currentLine} ${word}` : word;
        const lineWidth = font.widthOfTextAtSize(tentativeLine, fontSize);

        if (lineWidth <= maxWidth || !currentLine) {
            currentLine = tentativeLine;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
}

function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function ensureArray(items) {
    if (!Array.isArray(items)) {
        return [];
    }
    return items;
}

function drawTableHeader(page, font, startY) {
    const { width } = page.getSize();
    const tableWidth = width - (MARGINS.left + MARGINS.right);
    const headerHeight = LINE_HEIGHT + 6;
    const headerBottom = startY - headerHeight;
    const headerTop = headerBottom + headerHeight;

    page.drawRectangle({
        x: MARGINS.left,
        y: headerBottom,
        width: tableWidth,
        height: headerHeight,
        color: rgb(0.93, 0.95, 0.99)
    });

    let cursorX = MARGINS.left + TABLE_PADDING_X;
    const textBaseline = headerBottom + ((headerHeight - LINE_HEIGHT) / 2);

    for (const column of TABLE_COLUMNS) {
        page.drawText(column.title, {
            x: cursorX,
            y: textBaseline,
            size: 11,
            font,
            color: rgb(0.12, 0.16, 0.28)
        });
        cursorX += column.width;
    }

    return headerBottom - 4;
}

function createNewPage(pdfDoc, fonts, { isFirstPage, metadata }) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let cursorY = PAGE_HEIGHT - MARGINS.top;

    const titleFont = fonts.bold;
    const textFont = fonts.regular;

    page.drawText('Звіт по відвантаженню', {
        x: MARGINS.left,
        y: cursorY,
        size: 20,
        font: titleFont,
        color: rgb(0.11, 0.12, 0.35)
    });

    cursorY -= LINE_HEIGHT * 1.6;

    page.drawText(`Торгова точка: ${metadata.storeName}`, {
        x: MARGINS.left,
        y: cursorY,
        size: 12,
        font: textFont,
        color: rgb(0.16, 0.16, 0.16)
    });

    cursorY -= LINE_HEIGHT;

    page.drawText(`Дата: ${metadata.date}`, {
        x: MARGINS.left,
        y: cursorY,
        size: 12,
        font: textFont,
        color: rgb(0.16, 0.16, 0.16)
    });

    cursorY -= LINE_HEIGHT;

    page.drawText(`Час: ${metadata.time}`, {
        x: MARGINS.left,
        y: cursorY,
        size: 12,
        font: textFont,
        color: rgb(0.16, 0.16, 0.16)
    });

    cursorY -= LINE_HEIGHT;

    if (isFirstPage) {
        page.drawText(`Кількість позицій: ${metadata.itemsCount}`, {
            x: MARGINS.left,
            y: cursorY,
            size: 12,
            font: textFont,
            color: rgb(0.16, 0.16, 0.16)
        });

        cursorY -= LINE_HEIGHT;

        if (metadata.totalWeight && metadata.totalWeight > 0) {
            page.drawText(`Загальна вага: ${metadata.totalWeight} кг`, {
                x: MARGINS.left,
                y: cursorY,
                size: 12,
                font: textFont,
                color: rgb(0.16, 0.16, 0.16)
            });

            cursorY -= LINE_HEIGHT;
        }

        page.drawText(`Загальна сума: ${metadata.totalAmount} ₴`, {
            x: MARGINS.left,
            y: cursorY,
            size: 12,
            font: textFont,
            color: rgb(0.16, 0.16, 0.16)
        });

        cursorY -= LINE_HEIGHT * 1.5;

        const summaryText = metadata.summary;
        const summaryLines = splitTextIntoLines(summaryText, textFont, 11, PAGE_WIDTH - (MARGINS.left + MARGINS.right));
        for (const line of summaryLines) {
            page.drawText(line, {
                x: MARGINS.left,
                y: cursorY,
                size: 11,
                font: textFont,
                color: rgb(0.22, 0.22, 0.24)
            });
            cursorY -= LINE_HEIGHT;
        }
    } else {
        cursorY -= LINE_HEIGHT;
        page.drawText('Продовження звіту', {
            x: MARGINS.left,
            y: cursorY,
            size: 11,
            font: textFont,
            color: rgb(0.24, 0.24, 0.3)
        });
    }

    cursorY -= LINE_HEIGHT;

    return { page, cursorY };
}

function ensureSpaceForRow(context, requiredHeight) {
    if (context.cursorY - requiredHeight < MARGINS.bottom) {
        const { page, cursorY } = createNewPage(context.pdfDoc, context.fonts, {
            isFirstPage: false,
            metadata: context.metadata
        });
        context.page = page;
        context.cursorY = drawTableHeader(context.page, context.fonts.bold, cursorY);
    }
}

function drawTableRow(context, item, index) {
    const { page, fonts } = context;
    const fontSize = 11;
    const nameLines = splitTextIntoLines(item.productName || '—', fonts.regular, fontSize, TABLE_COLUMNS[0].width - (TABLE_PADDING_X * 2));
    const quantity = formatQuantity(item.quantity);
    const price = formatMoney(item.pricePerUnit);
    const total = formatMoney(item.totalAmount);
    const rowHeight = Math.max(nameLines.length, 1) * LINE_HEIGHT + 6;

    ensureSpaceForRow(context, rowHeight);

    const rowTop = context.cursorY;
    const rowBottom = rowTop - rowHeight;

    let cursorX = MARGINS.left;
    let textStartY = rowTop - LINE_HEIGHT;

    const backgroundColor = index % 2 === 0 ? rgb(0.98, 0.99, 1) : null;
    if (backgroundColor) {
        const tableWidth = PAGE_WIDTH - (MARGINS.left + MARGINS.right);
        page.drawRectangle({
            x: MARGINS.left,
            y: rowBottom,
            width: tableWidth,
            height: rowHeight,
            color: backgroundColor
        });
    }

    const source = formatSource(item.source);
    const sourceLines = splitTextIntoLines(source, fonts.regular, fontSize, TABLE_COLUMNS[3].width - (TABLE_PADDING_X * 2));

    const columnValues = [
        nameLines,
        [quantity],
        [item.unit || ''],
        sourceLines,
        [price ? `${price} ₴` : ''],
        [total ? `${total} ₴` : '']
    ];

    TABLE_COLUMNS.forEach((column, idx) => {
        const lines = columnValues[idx];
        let textY = textStartY;
        const align = column.align;

        for (const line of lines) {
            let textX = cursorX + TABLE_PADDING_X;
            if (align === 'right') {
                const textWidth = fonts.regular.widthOfTextAtSize(line, fontSize);
                textX = cursorX + column.width - TABLE_PADDING_X - textWidth;
            } else if (align === 'center') {
                const textWidth = fonts.regular.widthOfTextAtSize(line, fontSize);
                textX = cursorX + (column.width / 2) - (textWidth / 2);
            }

            page.drawText(line, {
                x: textX,
                y: textY,
                size: fontSize,
                font: fonts.regular,
                color: rgb(0.1, 0.1, 0.12)
            });

            textY -= LINE_HEIGHT;
        }

        cursorX += column.width;
    });

    context.cursorY = rowBottom - 4;
}

function drawTotalsRow(context) {
    const { page, fonts, totals } = context;
    const fontSize = 12;
    const tableWidth = PAGE_WIDTH - (MARGINS.left + MARGINS.right);
    const rowHeight = LINE_HEIGHT + 8;

    ensureSpaceForRow(context, rowHeight);

    const rowTop = context.cursorY;
    const rowBottom = rowTop - rowHeight;
    const textBaseline = rowBottom + ((rowHeight - LINE_HEIGHT) / 2);

    page.drawRectangle({
        x: MARGINS.left,
        y: rowBottom,
        width: tableWidth,
        height: rowHeight,
        color: rgb(0.89, 0.92, 0.98)
    });

    page.drawText('Разом', {
        x: MARGINS.left + TABLE_PADDING_X,
        y: textBaseline,
        size: fontSize,
        font: fonts.bold,
        color: rgb(0.07, 0.07, 0.16)
    });

    const totalText = `${formatMoney(totals.amount)} ₴`;
    const totalWidth = fonts.bold.widthOfTextAtSize(totalText, fontSize);
    const totalX = PAGE_WIDTH - MARGINS.right - TABLE_PADDING_X - totalWidth;

    page.drawText(totalText, {
        x: totalX,
        y: textBaseline,
        size: fontSize,
        font: fonts.bold,
        color: rgb(0.07, 0.07, 0.16)
    });

    context.cursorY = rowBottom - 4;
}

export async function generateUnloadingReport(batchData, options = {}) {
    await loadPdfLib();

    const {
        storeName = 'Невідома точка',
        items,
        submittedAt = new Date(),
        totalWeight = 0,
        summary
    } = batchData || {};

    const resolvedItems = ensureArray(items);
    if (resolvedItems.length === 0) {
        throw new Error('Немає товарів для формування звіту');
    }

    const pdfDoc = await PDFDocument.create();

    let fonts;

    try {
        // Загружаем и регистрируем fontkit для поддержки кириллицы
        console.log('📦 Loading fontkit...');
        const fontkit = await loadFontkit();
        pdfDoc.registerFontkit(fontkit);

        // Загружаем кастомный шрифт (поддерживает украинский)
        const fontBytes = await loadFontBytes();

        if (fontBytes) {
            console.log('📝 Embedding custom font with Cyrillic support...');
            const customFont = await pdfDoc.embedFont(fontBytes);
            fonts = {
                regular: customFont,
                bold: customFont
            };
            console.log('✅ Custom font embedded successfully');
        } else {
            throw new Error('Font bytes not loaded');
        }
    } catch (fontError) {
        console.error('❌ Custom font failed, using standard fonts:', fontError);
        console.warn('⚠️ PDF will be generated but Cyrillic characters may not display correctly');

        // Fallback на стандартные шрифты (только латиница!)
        fonts = {
            regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
            bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
        };
    }

    const totalAmount = resolvedItems.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
    const calculatedWeight = resolvedItems.reduce((sum, item) => {
        if (item.unit === 'kg') {
            return sum + (Number(item.quantity) || 0);
        }
        return sum;
    }, 0);

    const dateObj = new Date(submittedAt);
    const dateStr = dateObj.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const timeStr = dateObj.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const metadata = {
        storeName,
        date: dateStr,
        time: timeStr,
        submittedAt: dateObj,
        itemsCount: resolvedItems.length,
        totalAmount: formatMoney(totalAmount),
        totalWeight: totalWeight || calculatedWeight,
        summary: summary || 'Документ згенеровано автоматично у додатку «Облік закупівель».'
    };

    const context = {
        pdfDoc,
        fonts,
        metadata,
        totals: {
            amount: totalAmount
        }
    };

    const { page, cursorY } = createNewPage(pdfDoc, fonts, {
        isFirstPage: true,
        metadata
    });
    context.page = page;
    context.cursorY = drawTableHeader(context.page, context.fonts.bold, cursorY);

    resolvedItems.forEach((item, index) => {
        drawTableRow(context, item, index);
    });

    drawTotalsRow(context);

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const base64 = bytesToBase64(pdfBytes);

    // Формат: Відвантаження_Гравітон_22-10-2025_14-35.pdf
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    const dateForFile = `${day}-${month}-${year}`;
    const timeForFile = `${hours}-${minutes}`;
    const fileName = `Відвантаження_${storeName}_${dateForFile}_${timeForFile}.pdf`;

    if (options.download !== false && typeof document !== 'undefined') {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    return {
        fileName,
        blob,
        base64,
        bytes: pdfBytes
    };
}
