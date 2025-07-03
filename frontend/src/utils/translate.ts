import i18next from 'i18next';

type TranslateResult = {
  translatedText: string;
  detectedSourceLanguage: string;
};

export async function translateText(text: string): Promise<TranslateResult> {
  const target = i18next.language || 'en';

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
  }
}
