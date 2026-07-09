import i18next from 'i18next';

type TranslateResult = {
  translatedText: string;
  detectedSourceLanguage: string;
};

// Many components independently ask to translate the same list of titles
// (on mount, on tab switch, on language change, ...). Without a cache every
// one of those re-fires two HTTP calls (detect + translate) per string, which
// can pile up into dozens/hundreds of concurrent pending requests and starve
// the browser's per-host connection pool, blocking unrelated API calls.
const MAX_CACHE_ENTRIES = 2000;
// Matches LibreTranslate's own default gunicorn worker count (LT_THREADS,
// unset in both docker-compose.dev.yml and the prod compose file, so it
// falls back to LibreTranslate's default of 4). Keep these in sync if
// LT_THREADS is ever overridden.
const MAX_CONCURRENT_REQUESTS = 4;

const resultCache = new Map<string, TranslateResult>();
const inFlight = new Map<string, Promise<TranslateResult>>();

let activeRequests = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function releaseSlot() {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    activeRequests--;
  }
}

function cacheResult(key: string, result: TranslateResult) {
  if (result.detectedSourceLanguage === 'error') return;
  resultCache.set(key, result);
  if (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey !== undefined) resultCache.delete(oldestKey);
  }
}

async function performTranslate(text: string, target: string): Promise<TranslateResult> {
  await acquireSlot();

  try {
    // First: detect source language
    const detectRes = await fetch('/translate/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });

    const detected = await detectRes.json();
    const detectedSourceLanguage = detected?.[0]?.language || 'unknown';

    // If detected language equals target, return original
    if (detectedSourceLanguage === target) {
      return {
        translatedText: text,
        detectedSourceLanguage,
      };
    }

    // Else: proceed to translate
    const translateRes = await fetch('/translate/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: detectedSourceLanguage,
        target,
        format: 'text',
      }),
    });

    if (!translateRes.ok) {
      throw new Error(`Translation failed with status ${translateRes.status}`);
    }

    const data = await translateRes.json();

    return {
      translatedText: data.translatedText,
      detectedSourceLanguage,
    };
  } catch (err) {
    console.error('[translateText] Error:', err);
    return {
      translatedText: text,
      detectedSourceLanguage: 'error',
    };
  } finally {
    releaseSlot();
  }
}

export async function translateText(text: string): Promise<TranslateResult> {
  // LibreTranslate only knows bare language codes (e.g. "en", "de"); the
  // browser/i18next locale can be a full BCP47 tag (e.g. "en-US", "de-CH"),
  // which LibreTranslate rejects with a 400.
  const target = (i18next.language || 'en').slice(0, 2);

  if (!text) {
    return { translatedText: text, detectedSourceLanguage: 'unknown' };
  }

  const key = `${target}:${text}`;

  const cached = resultCache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = performTranslate(text, target);
  inFlight.set(key, promise);

  promise.then((result) => cacheResult(key, result)).finally(() => inFlight.delete(key));

  return promise;
}
