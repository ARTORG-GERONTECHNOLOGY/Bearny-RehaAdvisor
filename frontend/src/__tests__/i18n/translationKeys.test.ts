import fs from 'fs';
import path from 'path';

import en from '@/assets/lang/en.json';
import de from '@/assets/lang/de.json';
import fr from '@/assets/lang/fr.json';
import itLang from '@/assets/lang/it.json';
import pt from '@/assets/lang/pt.json';
import nl from '@/assets/lang/nl.json';

const files: Record<string, any> = { en, de, fr, it: itLang, pt, nl };
const langs = Object.keys(files);

const SRC_DIR = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', '__mocks__']);
const SOURCE_FILE_RE = /\.(tsx?|jsx?)$/;

// Matches t('literal') / t("literal") calls with a plain string first argument,
// including member-access calls like i18n.t('literal') or this.t('literal').
// Dynamic keys (template literals, variables, non-literal expressions) are
// intentionally skipped since they can't be resolved statically.
const T_CALL_RE = /(?<![a-zA-Z0-9_$])t\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (SOURCE_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collectUsedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const file of collectSourceFiles(SRC_DIR)) {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    while ((match = T_CALL_RE.exec(content))) {
      const key = match[2];
      if (!keys.has(key)) {
        keys.set(key, path.relative(SRC_DIR, file));
      }
    }
  }
  return keys;
}

describe('t() keys used in the app exist in every language file', () => {
  const usedKeys = collectUsedKeys();

  it('finds at least one t() call (sanity check for the scanner)', () => {
    expect(usedKeys.size).toBeGreaterThan(0);
  });

  it.each(langs)('%s has every key referenced by a t() call', (lang) => {
    const translations = files[lang];
    const missing = [...usedKeys.entries()]
      .filter(([key]) => !(key in translations))
      .map(([key, file]) => `"${key}" (first used in ${file})`);
    expect(missing).toHaveLength(0);
  });
});
