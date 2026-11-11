import en from '@/assets/lang/en.json';
import de from '@/assets/lang/de.json';
import fr from '@/assets/lang/fr.json';
import itLang from '@/assets/lang/it.json';
import pt from '@/assets/lang/pt.json';
import nl from '@/assets/lang/nl.json';
import fs from 'fs';
import path from 'path';

const files: Record<string, any> = { en, de, fr, it: itLang, pt, nl };
const langs = Object.keys(files);
const referenceKeys = new Set(Object.keys(en));

// Case-insensitive, then uppercase first, so "Group" and "group" sit next to each other.
const compareKeys = (a: string, b: string) => {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

// JSON.parse keeps only the last of duplicate keys, so read the top-level keys from the raw text.
const rawTopLevelKeys = (lang: string): string[] => {
  const raw = fs.readFileSync(path.resolve(__dirname, `../../assets/lang/${lang}.json`), 'utf-8');
  return [...raw.matchAll(/^ {2}("(?:[^"\\]|\\.)*")\s*:/gm)].map((m) => JSON.parse(m[1]));
};

describe('i18n lang files are in sync', () => {
  it('all files have the same number of keys', () => {
    const counts = Object.fromEntries(langs.map((l) => [l, Object.keys(files[l]).length]));
    const unique = new Set(Object.values(counts));
    expect(unique.size).toBe(1); // fails with counts object in snapshot if not 1
    if (unique.size !== 1) throw new Error(`Key counts differ: ${JSON.stringify(counts)}`);
  });

  it.each(langs.filter((l) => l !== 'en'))('%s has no keys missing from en', (lang) => {
    const missing = [...referenceKeys].filter((k) => !(k in files[lang]));
    expect(missing).toHaveLength(0);
  });

  it.each(langs.filter((l) => l !== 'en'))('%s has no extra keys not in en', (lang) => {
    const extra = Object.keys(files[lang]).filter((k) => !referenceKeys.has(k));
    expect(extra).toHaveLength(0);
  });

  it.each(langs)('%s has no duplicate keys', (lang) => {
    const keys = rawTopLevelKeys(lang);
    expect(keys.length).toBeGreaterThanOrEqual(Object.keys(files[lang]).length);
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(duplicates).toEqual([]);
  });

  it.each(langs)('%s keys are sorted', (lang) => {
    const keys = rawTopLevelKeys(lang);
    const firstOutOfOrder = keys.findIndex((k, i) => i > 0 && compareKeys(keys[i - 1], k) > 0);
    expect(
      firstOutOfOrder === -1
        ? null
        : `"${keys[firstOutOfOrder]}" should come before "${keys[firstOutOfOrder - 1]}"`
    ).toBeNull();
  });

  it('no translation values are empty strings', () => {
    const empty: string[] = [];
    for (const [lang, translations] of Object.entries(files)) {
      for (const [key, value] of Object.entries(translations)) {
        if (value === '') empty.push(`${lang}["${key}"]`);
      }
    }
    expect(empty).toHaveLength(0);
  });
});
