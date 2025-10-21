import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FONT_URL = 'fonts/NotoSans-Regular.ttf';
const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGINS = { top: 60, right: 40, bottom: 60, left: 40 };
const TABLE_COLUMNS = [
    { key: 'productName', title: 'Товар', width: 220, align: 'left' },
    { key: 'quantity', title: 'Кількість', width: 80, align: 'right' },
    { key: 'unit', title: 'Од.', width: 50, align: 'center' },
    { key: 'pricePerUnit', title: 'Ціна', width: 90, align: 'right' },
    { key: 'totalAmount', title: 'Сума', width: 95, align: 'right' }
];
const TABLE_PADDING_X = 6;
const LINE_HEIGHT = 16;

let cachedFontBytes = null;

async function loadFontBytes() {
    if (cachedFontBytes) {
        return cachedFontBytes;
    }

    try {
        const response = await fetch(FONT_URL);
        if (!response.ok) {
            throw new Error(`Font request failed with status ${response.status}`);
        }

        cachedFontBytes = await response.arrayBuffer();
        return cachedFontBytes;
    } catch (error) {
        console.warn('Unable to load custom font. Falling back to standard fonts.', error);
        return null;
    }
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

    page.drawText(`Дата та час: ${metadata.submittedAt}`, {
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

    const columnValues = [
        nameLines,
        [quantity],
        [item.unit || ''],
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
    const {
        storeName = 'Невідома точка',
        items,
        submittedAt = new Date(),
        summary
    } = batchData || {};

    const resolvedItems = ensureArray(items);
    if (resolvedItems.length === 0) {
        throw new Error('Немає товарів для формування звіту');
    }

    const pdfDoc = await PDFDocument.create();
    const fontBytes = await loadFontBytes();

    const fonts = {
        regular: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    };

    const totalAmount = resolvedItems.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
    const metadata = {
        storeName,
        submittedAt: new Date(submittedAt).toLocaleString('uk-UA'),
        itemsCount: resolvedItems.length,
        totalAmount: formatMoney(totalAmount),
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

    const safeStoreName = sanitizeFileName(storeName);
    const timestamp = new Date(submittedAt).toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeStoreName || 'unloading'}-${timestamp}.pdf`;

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
