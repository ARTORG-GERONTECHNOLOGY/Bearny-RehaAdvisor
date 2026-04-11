import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, MoreVertical, Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

type Platform = 'ios' | 'android' | 'desktop';
type Browser = 'Chrome' | 'Firefox' | 'Edge' | 'Safari' | 'Opera' | 'Samsung Internet' | 'Browser';

function getPlatform(): Platform {
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}

function getBrowserName(): Browser {
  const userAgent = navigator.userAgent;
  if (/CriOS|Chrome/.test(userAgent) && !/Edg/.test(userAgent)) return 'Chrome';
  if (/FxiOS|Firefox/.test(userAgent)) return 'Firefox';
  if (/EdgiOS|Edg/.test(userAgent)) return 'Edge';
  if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) return 'Safari';
  if (/Opera|OPR/.test(userAgent)) return 'Opera';
  if (/SamsungBrowser/.test(userAgent)) return 'Samsung Internet';
  return 'Browser';
}

export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(() => {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => setStandalone(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return standalone;
}

interface PwaInstallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PwaInstallSheet({ open, onOpenChange }: PwaInstallSheetProps) {
  const { t } = useTranslation();

  const platform = getPlatform();
  const browser = getBrowserName();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('pwa.title')}</SheetTitle>
          <SheetDescription>{t('pwa.description')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mb-3">
          {platform === 'ios' && <IosInstructions browser={browser} />}
          {platform === 'android' && <AndroidInstructions browser={browser} />}
          {platform === 'desktop' && <DesktopInstructions browser={browser} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2 items-start">
      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-white text-xs font-bold">
        {number}
      </span>
      <span className="text-sm text-zinc-600 leading-relaxed">{children}</span>
    </li>
  );
}

function InlineIcon({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center align-text-bottom mx-0.5">{children}</span>;
}

function IosInstructions({ browser }: { browser: Browser }) {
  const { t } = useTranslation();

  const isSafari = browser === 'Safari';

  return (
    <section>
      {!isSafari && <p className="text-xs text-zinc-400 mb-2">{t('pwa.ios.note')}</p>}
      <ol className="space-y-3 list-none pl-0">
        <Step number={1}>
          {t('pwa.ios.step1')}
          <InlineIcon>
            <Share className="h-4 w-4 text-blue-500" />
          </InlineIcon>
        </Step>
        <Step number={2}>{t('pwa.ios.step2')}</Step>
        <Step number={3}>
          {t('pwa.ios.step3')}
          <InlineIcon>
            <Plus className="h-4 w-4 text-blue-500" />
          </InlineIcon>
        </Step>
        <Step number={4}>{t('pwa.ios.step4')}</Step>
      </ol>
    </section>
  );
}

function AndroidInstructions({ browser }: { browser: Browser }) {
  const { t } = useTranslation();

  const isChrome = browser === 'Chrome';
  const isFirefox = browser === 'Firefox';
  const isSamsung = browser === 'Samsung Internet';

  return (
    <section>
      <ol className="space-y-3 list-none pl-0">
        {isChrome && (
          <>
            <Step number={1}>
              {t('pwa.android.chrome.step1')}
              <InlineIcon>
                <MoreVertical className="h-4 w-4 text-zinc-500" />
              </InlineIcon>
            </Step>
            <Step number={2}>{t('pwa.android.chrome.step2')}</Step>
            <Step number={3}>{t('pwa.android.chrome.step3')}</Step>
          </>
        )}
        {isFirefox && (
          <>
            <Step number={1}>
              {t('pwa.android.firefox.step1')}
              <InlineIcon>
                <MoreVertical className="h-4 w-4 text-zinc-500" />
              </InlineIcon>
            </Step>
            <Step number={2}>{t('pwa.android.firefox.step2')}</Step>
            <Step number={3}>{t('pwa.android.firefox.step3')}</Step>
          </>
        )}
        {isSamsung && (
          <>
            <Step number={1}>{t('pwa.android.samsung.step1')}</Step>
            <Step number={2}>{t('pwa.android.samsung.step2')}</Step>
            <Step number={3}>{t('pwa.android.samsung.step3')}</Step>
          </>
        )}
        {!isChrome && !isFirefox && !isSamsung && (
          <>
            <Step number={1}>
              {t('pwa.android.generic.step1')}
              <InlineIcon>
                <MoreVertical className="h-4 w-4 text-zinc-500" />
              </InlineIcon>
            </Step>
            <Step number={2}>{t('pwa.android.generic.step2')}</Step>
            <Step number={3}>{t('pwa.android.generic.step3')}</Step>
          </>
        )}
      </ol>
    </section>
  );
}

function DesktopInstructions({ browser }: { browser: Browser }) {
  const { t } = useTranslation();

  const isChrome = browser === 'Chrome';
  const isEdge = browser === 'Edge';
  const isFirefox = browser === 'Firefox';
  const isSafari = browser === 'Safari';

  return (
    <section>
      <ol className="space-y-3 list-none pl-0">
        {(isChrome || isEdge) && (
          <>
            <Step number={1}>{t('pwa.desktop.chromium.step1')}</Step>
            <Step number={2}>{t('pwa.desktop.chromium.step2')}</Step>
            <Step number={3}>{t('pwa.desktop.chromium.step3')}</Step>
          </>
        )}
        {isSafari && (
          <>
            <Step number={1}>{t('pwa.desktop.safari.step1')}</Step>
            <Step number={2}>{t('pwa.desktop.safari.step2')}</Step>
            <Step number={3}>{t('pwa.desktop.safari.step3')}</Step>
          </>
        )}
        {isFirefox && <Step number={1}>{t('pwa.desktop.firefox.step1')}</Step>}
        {!isChrome && !isEdge && !isSafari && !isFirefox && (
          <>
            <Step number={1}>{t('pwa.desktop.generic.step1')}</Step>
            <Step number={2}>{t('pwa.desktop.generic.step2')}</Step>
          </>
        )}
      </ol>
    </section>
  );
}
