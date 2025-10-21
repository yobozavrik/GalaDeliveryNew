# 🔐 Security Setup Instructions

## ⚠️ IMPORTANT: API Key Security

### Local Development

1. **Create `.env` file** from template:
   ```bash
   cp .env.example .env
   ```

2. **Get Gemini API Key**:
   - Visit: https://makersuite.google.com/app/apikey
   - Create new API key
   - Copy the key

3. **Add to `.env`**:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```

4. **Verify `.gitignore`** contains:
   ```
   .env
   node_modules/
   ```

### Vercel Deployment

1. **Go to Vercel Dashboard**:
   - Open your project
   - Go to Settings → Environment Variables

2. **Add Environment Variable**:
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API key
   - Environments: Production, Preview, Development

3. **Redeploy** after adding environment variable

### Security Checklist

- [ ] `.env` file created and added to `.gitignore`
- [ ] API key added to `.env` (local)
- [ ] API key added to Vercel environment variables (production)
- [ ] Verified `.env` is **NOT** committed to git
- [ ] Old commits with exposed keys - consider rotating the key

### How It Works

**Before** (❌ Insecure):
```
Client → Gemini API (with exposed key)
```

**After** (✅ Secure):
```
Client → /api/gemini (Vercel Function) → Gemini API
```

The API key is now stored server-side and never exposed to the client.

### Troubleshooting

**Error: "Service configuration error"**
- Check if GEMINI_API_KEY is set in Vercel environment variables
- Verify you've redeployed after adding the variable

**Error: "Gemini API not configured"**
- Check if `/api/gemini` endpoint is accessible
- Verify the Vercel function is deployed correctly

### Additional Security Recommendations

1. **Rotate API Keys** regularly (every 90 days)
2. **Set API Quotas** in Google Cloud Console
3. **Monitor Usage** in Gemini API dashboard
4. **Implement Rate Limiting** (already done in `/api/gemini.ts`)
5. **Enable Audit Logging** for API calls

---

## 📊 Rate Limiting

Current rate limits:
- **Receipt Scanning**: Unlimited (but recommend implementing Redis-based rate limiting)
- **Server-side**: To be implemented with Redis or similar

### Recommended Rate Limits

```
Per User:
- 10 requests per minute
- 100 requests per hour
- 500 requests per day

Per IP:
- 20 requests per minute
- 200 requests per hour
```

---

## 🔄 API Key Rotation

If you need to rotate your API key:

1. Generate new key in Google Cloud Console
2. Update `.env` (local) and Vercel environment variables
3. Deploy changes
4. Monitor for errors
5. Delete old key after 24 hours

---

## 📝 Audit Log

All Gemini API calls are logged server-side in `/api/gemini.ts` for security monitoring.
