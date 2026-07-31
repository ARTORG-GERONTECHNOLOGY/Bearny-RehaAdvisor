import fs from 'fs';
import path from 'path';

describe('icon setup', () => {
  const projectRoot = process.cwd();
  const srcDir = path.join(projectRoot, 'src');
  const iconsDir = path.join(srcDir, 'assets/icons');

  const iconImportPattern = /['"]@\/assets\/icons\/([^'"]+\.svg)(?:\?react)?['"]/g;

  const sourceFiles: string[] = [];
  const collectSourceFiles = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectSourceFiles(entryPath);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        sourceFiles.push(entryPath);
      }
    }
  };
  collectSourceFiles(srcDir);

  const importedIcons = new Set<string>();
  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const match of content.matchAll(iconImportPattern)) {
      importedIcons.add(match[1]);
    }
  }

  it('finds icon imports to check', () => {
    expect(importedIcons.size).toBeGreaterThan(0);
  });

  it('resolves every imported icon to a file in assets/icons', () => {
    const missingIcons = Array.from(importedIcons).filter(
      (iconPath) => !fs.existsSync(path.join(iconsDir, iconPath))
    );

    expect(missingIcons).toEqual([]);
  });
});
