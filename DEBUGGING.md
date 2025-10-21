# 🔧 Debugging Instructions

## Problem: App stuck on loading screen

### Quick Fix - Reset Migration

If the app is stuck on "Завантаження...", follow these steps:

1. **Open Browser Console** (F12 or Ctrl+Shift+I)

2. **Run this command**:
   ```javascript
   localStorage.removeItem('migrated_to_indexeddb');
   location.reload();
   ```

3. **Alternative - Full Reset**:
   ```javascript
   // Clear all localStorage
   localStorage.clear();

   // Clear all IndexedDB
   indexedDB.deleteDatabase('GalaBaluvanaDB');

   // Reload
   location.reload();
   ```

---

## Checking Logs

### 1. Open Console (F12)

Look for these messages:

**✅ Success:**
```
🚀 App initializing...
✅ IndexedDB initialized
✅ IndexedDB ready
✅ App initialized successfully!
```

**❌ Error:**
```
❌ IndexedDB initialization failed: [error message]
```

### 2. Check IndexedDB Status

```javascript
// Check if IndexedDB is available
console.log('IndexedDB available:', !!window.indexedDB);

// Check if database is initialized
IndexedDBManager.isAvailable
```

### 3. Check Migration Status

```javascript
console.log('Migration status:', localStorage.getItem('migrated_to_indexeddb'));
```

---

## Common Issues

### Issue 1: IndexedDB Not Available
**Symptoms:** Error "IndexedDB not available"
**Cause:** Private browsing mode or browser doesn't support IndexedDB
**Fix:**
- Disable private browsing
- Use a modern browser (Chrome, Firefox, Edge)

### Issue 2: Migration Stuck
**Symptoms:** Loading screen never disappears
**Cause:** Migration taking too long or error during migration
**Fix:**
```javascript
localStorage.setItem('migrated_to_indexeddb', 'true');
location.reload();
```

### Issue 3: Quota Exceeded
**Symptoms:** Error about storage quota
**Cause:** Too much data in IndexedDB
**Fix:**
```javascript
// Check quota
navigator.storage.estimate().then(estimate => {
    console.log('Used:', estimate.usage, 'Available:', estimate.quota);
});

// Clear if needed
indexedDB.deleteDatabase('GalaBaluvanaDB');
```

---

## Performance Monitoring

### Check Database Size

```javascript
// Open IndexedDB in DevTools
// Application → Storage → IndexedDB → GalaBaluvanaDB

// Or programmatically:
navigator.storage.estimate().then(({usage, quota}) => {
    console.log(`Using ${(usage / 1024 / 1024).toFixed(2)} MB of ${(quota / 1024 / 1024).toFixed(2)} MB`);
});
```

### Monitor Transaction Performance

Look for these console logs:
```
Transaction history completed
Transaction drafts completed
```

If you don't see these, transactions might be hanging.

---

## Network Issues

### Check API Endpoints

```javascript
// Test Gemini API proxy
fetch('/api/gemini', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({contents: [{parts: [{text: 'test'}]}]})
})
.then(r => r.json())
.then(console.log);
```

### Check Webhook

```javascript
// Test webhook connection
fetch(config.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({test: true})
})
.then(r => console.log('Webhook status:', r.status));
```

---

## Development Mode

### Enable Verbose Logging

The app already logs extensively. Check console for:
- 🚀 Initialization steps
- ✅ Success messages
- ❌ Error messages
- 🔄 Migration progress

### Test Mode vs Production Mode

```javascript
// Check current mode
console.log('Mode:', config.isTestMode ? 'TEST' : 'PRODUCTION');

// Switch mode
config.toggleMode();
```

---

## Emergency Recovery

If nothing works:

```javascript
// NUCLEAR OPTION - Reset everything
(async function() {
    // Clear localStorage
    localStorage.clear();

    // Delete IndexedDB
    await indexedDB.deleteDatabase('GalaBaluvanaDB');

    // Clear Service Worker cache
    const caches = await window.caches.keys();
    await Promise.all(caches.map(c => window.caches.delete(c)));

    // Unregister Service Worker
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));

    // Reload
    location.reload();
})();
```

---

## Contact Support

If issues persist:
1. Copy console logs (F12 → Console → Right-click → Save as...)
2. Note browser version and OS
3. Describe steps to reproduce
4. Check GitHub Issues: [your-repo/issues]
