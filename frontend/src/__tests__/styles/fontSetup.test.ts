import fs from 'fs';
import path from 'path';

describe('font setup', () => {
  const projectRoot = process.cwd();
  const indexHtmlPath = path.join(projectRoot, 'index.html');
  const customBootstrapPath = path.join(projectRoot, 'src/assets/styles/custom-bootstrap.scss');
  const fontsDir = path.join(projectRoot, 'public/fonts');

  const expectedFontFiles = [
    'ABCDiatypeRounded-Regular.woff',
    'ABCDiatypeRounded-Regular.woff2',
    'ABCDiatypeRounded-RegularItalic.woff',
    'ABCDiatypeRounded-RegularItalic.woff2',
    'ABCDiatypeRounded-Medium.woff',
    'ABCDiatypeRounded-Medium.woff2',
    'ABCDiatypeRounded-MediumItalic.woff',
    'ABCDiatypeRounded-MediumItalic.woff2',
    'ABCDiatypeRounded-Bold.woff',
    'ABCDiatypeRounded-Bold.woff2',
    'ABCDiatypeRounded-BoldItalic.woff',
    'ABCDiatypeRounded-BoldItalic.woff2',
  ];

  it('does not load Google Fonts from index.html', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    expect(indexHtml).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/i);
  });

  it('declares local ABCDiatypeRounded font-face rules', () => {
    const customBootstrap = fs.readFileSync(customBootstrapPath, 'utf8');

    expect(customBootstrap).toContain("font-family: 'ABCDiatypeRounded'");
    expect(customBootstrap).toContain('ABCDiatypeRounded-Regular.woff2');
    expect(customBootstrap).toContain('ABCDiatypeRounded-Medium.woff2');
    expect(customBootstrap).toContain('ABCDiatypeRounded-Bold.woff2');
  });

  it('includes all required local font files', () => {
    const missingFiles = expectedFontFiles.filter(
      (fileName) => !fs.existsSync(path.join(fontsDir, fileName))
    );

    expect(missingFiles).toEqual([]);
  });
});
