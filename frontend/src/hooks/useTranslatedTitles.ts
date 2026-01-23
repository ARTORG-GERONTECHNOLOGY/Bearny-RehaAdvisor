// src/pages/patient-library/hooks/useTranslatedTitles.ts
import { useEffect, useState } from 'react';
import { translateText } from '../utils/translate';
import type { InterventionTypeTh } from '../types';

export type TitleMap = Record<string, { title: string; lang: string | null }>;

export function useTranslatedTitles(items: InterventionTypeTh[], lang: string) {
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!items.length) {
        if (!cancelled) setTranslatedTitles({});
        return;
      }

      const targetLang = (lang || 'en').slice(0, 2);

      const pairs = await Promise.all(
        items.map(async (rec) => {
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rec.title, targetLang);
            return [
              rec._id,
              { title: translatedText || rec.title, lang: detectedSourceLanguage || null },
            ] as const;
          } catch {
            return [rec._id, { title: rec.title, lang: null }] as const;
          }
        })
      );

      if (!cancelled) setTranslatedTitles(Object.fromEntries(pairs));
    })();

    return () => {
      cancelled = true;
    };
  }, [items, lang]);

  return translatedTitles;
}
