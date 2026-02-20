import fs from 'fs';
import path from 'path';

const requiredIconSizes = [
  '48x48',
  '72x72',
  '96x96',
  '128x128',
  '144x144',
  '152x152',
  '256x256',
  '192x192',
  '384x384',
  '512x512',
];

describe('PWA Configuration', () => {
  describe('Icon Resources', () => {
    const publicIconsPath = path.resolve(__dirname, '../../public/icons');

    requiredIconSizes.forEach((size) => {
      it(`should have pwa-${size}.png icon`, () => {
        const iconPath = path.join(publicIconsPath, `pwa-${size}.png`);
        expect(fs.existsSync(iconPath)).toBe(true);
      });
    });

    it('should have favicon.ico', () => {
      const faviconPath = path.join(publicIconsPath, 'favicon.ico');
      expect(fs.existsSync(faviconPath)).toBe(true);
    });

    it('should have apple-touch-icon.png', () => {
      const appleTouchIconPath = path.join(publicIconsPath, 'apple-touch-icon.png');
      expect(fs.existsSync(appleTouchIconPath)).toBe(true);
    });

    it('should have mask-icon.svg', () => {
      const maskIconPath = path.join(publicIconsPath, 'mask-icon.svg');
      expect(fs.existsSync(maskIconPath)).toBe(true);
    });
  });

  describe('Screenshot Resources', () => {
    const publicScreenshotsPath = path.resolve(__dirname, '../../public/screenshots');

    it('should have screenshot-desktop.png for wide form factor', () => {
      const screenshotPath = path.join(publicScreenshotsPath, 'screenshot-desktop.png');
      expect(fs.existsSync(screenshotPath)).toBe(true);
    });

    it('should have screenshot-mobile.png for narrow form factor', () => {
      const screenshotPath = path.join(publicScreenshotsPath, 'screenshot-mobile.png');
      expect(fs.existsSync(screenshotPath)).toBe(true);
    });
  });

  describe('HTML Meta Tags', () => {
    const indexPath = path.resolve(__dirname, '../../index.html');
    let indexContent: string;

    beforeAll(() => {
      indexContent = fs.readFileSync(indexPath, 'utf-8');
    });

    it('should have favicon link in index.html', () => {
      expect(indexContent).toContain('rel="icon"');
      expect(indexContent).toContain('/icons/favicon.ico');
    });

    it('should have apple-touch-icon link in index.html', () => {
      expect(indexContent).toContain('rel="apple-touch-icon"');
      expect(indexContent).toContain('/icons/apple-touch-icon.png');
    });

    it('should have mask-icon link in index.html', () => {
      expect(indexContent).toContain('rel="mask-icon"');
      expect(indexContent).toContain('/icons/mask-icon.svg');
    });

    it('should have viewport meta tag for mobile responsiveness', () => {
      expect(indexContent).toContain('name="viewport"');
      expect(indexContent).toContain('width=device-width');
    });

    it('should have app description meta tag', () => {
      expect(indexContent).toContain('name="description"');
    });
  });

  describe('Vite PWA Configuration', () => {
    const viteConfigPath = path.resolve(__dirname, '../../vite.config.js');
    let viteConfigContent: string;

    beforeAll(() => {
      viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');
    });

    it('should import VitePWA plugin', () => {
      expect(viteConfigContent).toContain("import { VitePWA } from 'vite-plugin-pwa'");
    });

    it('should configure VitePWA with autoUpdate', () => {
      expect(viteConfigContent).toContain("registerType: 'autoUpdate'");
    });

    it('should configure manifest with standalone display mode', () => {
      expect(viteConfigContent).toContain('manifest:');
      expect(viteConfigContent).toContain("display: 'standalone'");
    });

    it('should have unique id in manifest', () => {
      expect(viteConfigContent).toContain("id: '/'");
    });

    it('should have start_url defined in manifest', () => {
      expect(viteConfigContent).toContain("start_url: '/'");
    });

    it('should configure all required icon sizes', () => {
      requiredIconSizes.forEach((size) => {
        expect(viteConfigContent).toContain(`sizes: '${size}'`);
      });
    });

    it('should configure screenshots for app store', () => {
      expect(viteConfigContent).toContain('screenshots:');
      expect(viteConfigContent).toContain('screenshot-desktop.png');
      expect(viteConfigContent).toContain('screenshot-mobile.png');
      expect(viteConfigContent).toContain("form_factor: 'wide'");
      expect(viteConfigContent).toContain("form_factor: 'narrow'");
    });
  });

  describe('Build Output (Post-build)', () => {
    // These tests check if the build artifacts are created
    // They will pass after running `npm run build`

    it('should generate service worker after build', () => {
      const swPath = path.resolve(__dirname, '../../dist/sw.js');
      // Only check if dist directory exists (build may not have run)
      const distPath = path.resolve(__dirname, '../../dist');
      if (fs.existsSync(distPath)) {
        expect(fs.existsSync(swPath)).toBe(true);
      } else {
        // Skip this test if build hasn't run
        console.log('Skipping: dist/ not found. Run `npm run build` first.');
      }
    });

    it('should generate manifest.webmanifest after build', () => {
      const manifestPath = path.resolve(__dirname, '../../dist/manifest.webmanifest');
      const distPath = path.resolve(__dirname, '../../dist');
      if (fs.existsSync(distPath)) {
        expect(fs.existsSync(manifestPath)).toBe(true);
      } else {
        console.log('Skipping: dist/ not found. Run `npm run build` first.');
      }
    });

    it('should copy all icon files to dist after build', () => {
      const distPath = path.resolve(__dirname, '../../dist');
      if (fs.existsSync(distPath)) {
        requiredIconSizes.forEach((size) => {
          const iconPath = path.join(distPath, 'icons', `pwa-${size}.png`);
          expect(fs.existsSync(iconPath)).toBe(true);
        });
      } else {
        console.log('Skipping: dist/ not found. Run `npm run build` first.');
      }
    });
  });
});

describe('PWA Package Dependencies', () => {
  const packageJsonPath = path.resolve(__dirname, '../../package.json');
  let packageJson: any;

  beforeAll(() => {
    const packageContent = fs.readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(packageContent);
  });

  it('should have vite-plugin-pwa as a dependency', () => {
    const hasDependency =
      (packageJson.dependencies && packageJson.dependencies['vite-plugin-pwa']) ||
      (packageJson.devDependencies && packageJson.devDependencies['vite-plugin-pwa']);
    expect(hasDependency).toBeTruthy();
  });
});
