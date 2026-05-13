import en from '@/assets/lang/en.json';
import de from '@/assets/lang/de.json';
import fr from '@/assets/lang/fr.json';
import itLang from '@/assets/lang/it.json';
import pt from '@/assets/lang/pt.json';
import nl from '@/assets/lang/nl.json';

const files: Record<string, any> = { en, de, fr, it: itLang, pt, nl };
const langs = Object.keys(files);
const referenceKeys = new Set(Object.keys(en));

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
