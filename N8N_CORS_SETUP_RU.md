# Настройка CORS для n8n Webhook

## Проблема

При отправке данных на webhook возникает ошибка:
```
Access to fetch at 'https://n8n.dmytrotovstytskyi.online/webhook/deliverygb'
from origin 'http://localhost:3000' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Причина

Сервер n8n не возвращает правильные CORS заголовки, которые необходимы для кросс-доменных запросов из браузера.

---

## Решение 1: Настроить CORS в n8n Webhook (Рекомендуется)

### Вариант A: Используя "Respond to Webhook" node

1. Откройте ваш workflow в n8n
2. Найдите узел **Webhook** (начало workflow)
3. Добавьте узел **"Respond to Webhook"** в конце workflow
4. В настройках **"Respond to Webhook"**:
   - **Response Code**: 200
   - **Response Headers**: Добавьте следующие заголовки:

```json
{
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
}
```

5. **ВАЖНО**: Добавьте обработку preflight запроса (OPTIONS)

Структура workflow:
```
Webhook (Trigger)
    ↓
IF Node (проверка метода)
    ↓
├─ Если OPTIONS → Respond to Webhook (пустой ответ с CORS headers)
└─ Если POST → Ваша логика → Respond to Webhook (данные + CORS headers)
```

### Конфигурация IF Node:

```javascript
// Условие 1: OPTIONS запрос
{{ $json.headers['request-method'] === 'OPTIONS' }}

// или

{{ $httpMethod === 'OPTIONS' }}
```

### Конфигурация Respond to Webhook для OPTIONS:

```json
{
  "statusCode": 204,
  "headers": {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  },
  "body": ""
}
```

### Конфигурация Respond to Webhook для POST:

```json
{
  "statusCode": 200,
  "headers": {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  },
  "body": {
    "success": true,
    "message": "Дані отримано успішно"
  }
}
```

---

### Вариант B: Настроить CORS на уровне сервера n8n

Если у вас есть доступ к конфигурации n8n сервера, добавьте переменные окружения:

```bash
# В файле .env или docker-compose.yml
N8N_CORS_ORIGIN=*
N8N_CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
N8N_CORS_CREDENTIALS=true
```

Или через docker-compose:

```yaml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - N8N_CORS_ORIGIN=*
      - N8N_CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
      - N8N_CORS_CREDENTIALS=true
```

После изменений перезапустите n8n:
```bash
docker-compose restart n8n
```

---

## Решение 2: Использовать прокси на фронтенде (Временное решение)

Если нет доступа к серверу n8n, можно создать прокси на вашем сервере:

### Создать файл `/api/proxy.js` (если используете Vercel/Next.js):

```javascript
export default async function handler(req, res) {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    // Проксируем запрос к n8n
    const response = await fetch('https://n8n.dmytrotovstytskyi.online/webhook/deliverygb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

Затем в `src/config.js` измените URL:

```javascript
N8N_WEBHOOK_URL: 'http://localhost:3000/api/proxy' // или ваш домен
```

---

## Решение 3: Использовать CORS Proxy (Не рекомендуется для продакшена)

Можно использовать публичный CORS proxy для тестирования:

```javascript
// В src/network.js временно добавьте прокси:
const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
const actualUrl = config.N8N_WEBHOOK_URL;
const response = await fetch(proxyUrl + actualUrl, { /* ... */ });
```

**⚠️ Внимание**: Это только для разработки! Не используйте в продакшене!

---

## Проверка работы CORS

После настройки можете проверить CORS заголовки:

### Через curl:

```bash
# Проверка OPTIONS (preflight)
curl -X OPTIONS \
  https://n8n.dmytrotovstytskyi.online/webhook/deliverygb \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Должно вернуть:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: POST, OPTIONS
# Access-Control-Allow-Headers: Content-Type
```

### Через JavaScript в консоли браузера:

```javascript
fetch('https://n8n.dmytrotovstytskyi.online/webhook/deliverygb', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ test: true })
})
.then(res => res.json())
.then(data => console.log('✅ CORS работает!', data))
.catch(err => console.error('❌ CORS не работает', err));
```

---

## Рекомендуемая конфигурация для продакшена

Для безопасности, вместо `*` укажите конкретные домены:

```json
{
  "Access-Control-Allow-Origin": "https://yourdomain.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400"
}
```

Если несколько доменов, можно проверять Origin динамически в n8n:

```javascript
// В n8n Function node:
const allowedOrigins = [
  'http://localhost:3000',
  'https://yourdomain.com',
  'https://app.yourdomain.com'
];

const origin = $json.headers.origin;

if (allowedOrigins.includes(origin)) {
  return {
    json: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  };
}
```

---

## Дополнительные ресурсы

- [n8n Webhook Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [n8n CORS Configuration](https://docs.n8n.io/hosting/configuration/environment-variables/)
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## Что делать сейчас?

**Выберите один из вариантов:**

1. ✅ **Вариант A** (Рекомендуется): Настройте workflow в n8n с "Respond to Webhook" и CORS headers
2. ✅ **Вариант B**: Добавьте переменные окружения на сервер n8n
3. ⚠️ **Вариант 2**: Создайте прокси API на своем сервере
4. ❌ **Вариант 3**: Используйте публичный CORS proxy (только для тестов!)

После настройки проверьте, что ошибка CORS исчезла.
