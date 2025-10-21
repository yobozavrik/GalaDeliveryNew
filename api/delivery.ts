const N8N_URL =
  (process?.env?.N8N_WEBHOOK_URL as string) ||
  'https://n8n.dmytrotovstytskyi.online/webhook/deliverygb';

export const config = {
  api: {
    bodyParser: false,
  },
};

const readRawBody = (req: any): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err: Error) => reject(err));
  });

const ALLOWED_ORIGINS = ((process?.env?.CORS_ALLOWED_ORIGINS as string) || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export default async function handler(req: any, res: any) {
  const origin = req.headers.origin || '';
  const isAllowed = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin);
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const contentTypeHeaderRaw = req.headers['content-type'];
    const contentTypeHeader = Array.isArray(contentTypeHeaderRaw)
      ? contentTypeHeaderRaw.join(', ')
      : contentTypeHeaderRaw || '';
    const isJsonRequest =
      typeof contentTypeHeader === 'string' && contentTypeHeader.includes('application/json');

    let forwardBody: any = null;
    const forwardHeaders: Record<string, string> = {};

    if (isJsonRequest) {
      const bodyText = rawBody.toString('utf8');
      let bodyString = bodyText;
      try {
        const parsed = JSON.parse(bodyText || '{}');
        bodyString = JSON.stringify(parsed ?? {});
      } catch (error) {
        // If body is not valid JSON just forward as-is to keep compatibility.
        bodyString = bodyText;
      }
      forwardBody = bodyString;
      forwardHeaders['Content-Type'] = 'application/json';
      if (typeof req.headers.authorization === 'string') {
        forwardHeaders['Authorization'] = req.headers.authorization;
      }
    } else {
      forwardBody = rawBody;
      if (typeof contentTypeHeader === 'string' && contentTypeHeader) {
        forwardHeaders['Content-Type'] = contentTypeHeader;
      }
      const headerKeysToForward = ['authorization'];
      headerKeysToForward.forEach((key) => {
        const headerValue = req.headers[key];
        if (typeof headerValue === 'string') {
          const headerName = key === 'authorization' ? 'Authorization' : key;
          forwardHeaders[headerName] = headerValue;
        } else if (Array.isArray(headerValue)) {
          const headerName = key === 'authorization' ? 'Authorization' : key;
          forwardHeaders[headerName] = headerValue.join(',');
        }
      });
    }

    const response = await fetch(N8N_URL, {
      method: 'POST',
      headers: forwardHeaders,
      body: forwardBody,
    });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error: any) {
    res.status(502).json({ error: 'Bad gateway to n8n', detail: error?.message });
  }
}
