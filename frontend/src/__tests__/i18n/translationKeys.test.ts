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

interface KeyUsage {
  file: string;
  withCount: boolean; // some call site passes count, e.g. t('key', { count: n })
  withoutCount: boolean; // some call site doesn't
}

const COUNT_OPTION_RE = /^\s*,\s*\{[^}]*\bcount\s*:/;

function collectUsedKeys(): Map<string, KeyUsage> {
  const keys = new Map<string, KeyUsage>();
  for (const file of collectSourceFiles(SRC_DIR)) {
    const content = fs.readFileSync(file, 'utf-8');
    let match;
    T_CALL_RE.lastIndex = 0;
    while ((match = T_CALL_RE.exec(content))) {
      const key = match[2];
      const tail = content.slice(T_CALL_RE.lastIndex, T_CALL_RE.lastIndex + 300);
      const withCount = COUNT_OPTION_RE.test(tail);
      const existing = keys.get(key);
      if (!existing) {
        keys.set(key, { file: path.relative(SRC_DIR, file), withCount, withoutCount: !withCount });
      } else {
        if (withCount) existing.withCount = true;
        else existing.withoutCount = true;
      }
    }
  }
  return keys;
}

// A non-count call only ever looks up the bare key — no `key_one`/`key_other`
// fallback applies there — so it always needs the bare key, even if some
// other call site for the same key does pass count.
function hasKey(translations: Record<string, unknown>, key: string, usage: KeyUsage): boolean {
  if (key in translations) return true;
  if (usage.withoutCount) return false;
  return `${key}_one` in translations && `${key}_other` in translations;
}

describe('t() keys used in the app exist in every language file', () => {
  const usedKeys = collectUsedKeys();

  it('finds at least one t() call (sanity check for the scanner)', () => {
    expect(usedKeys.size).toBeGreaterThan(0);
  });

  it.each(langs)('%s has every key referenced by a t() call', (lang) => {
    const translations = files[lang];
    const missing = [...usedKeys.entries()]
      .filter(([key, usage]) => !hasKey(translations, key, usage))
      .map(([key, { file }]) => `"${key}" (first used in ${file})`);
    expect(missing).toHaveLength(0);
  });
});
