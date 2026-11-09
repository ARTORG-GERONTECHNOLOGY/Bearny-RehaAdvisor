import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import GoogleHealthConnectButton from '@/components/PatientPage/GoogleHealthConnectButton';
import { patientFitbitStore } from '@/stores/patientFitbitStore';

const FitbitCard = observer(() => {
  const { t } = useTranslation();
  const { connected, wearableDevice } = patientFitbitStore;
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await patientFitbitStore.disconnect();
      setShowConfirm(false);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Don't render the card at all for omron/none patients
  if (wearableDevice === 'omron' || wearableDevice === 'none') return null;

  return (
    <>
      <div
        className={`p-4 rounded-3xl flex gap-1 justify-between items-center ${connected === false ? 'bg-zinc-100' : 'border border-accent'}`}
      >
        {connected === true ? (
          <>
            <div className="flex flex-col">
              <div className="font-medium text-sm text-zinc-500">{t('Fitness Tracker')}</div>
              <div className="font-bold text-lg text-zinc-800">{t('Google Health Connected')}</div>
            </div>
            <Button variant="secondary" onClick={() => setShowConfirm(true)}>
              {t('Disconnect')}
            </Button>
          </>
        ) : connected === false ? (
          <>
            <div className="flex flex-col">
              <div className="font-bold text-lg text-zinc-800">{t('Google Health')}</div>
              <div className="font-medium text-sm text-zinc-500">{t('Fitness Tracker')}</div>
            </div>
            <GoogleHealthConnectButton />
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-32" />
          </div>
        )}
      </div>

      <Sheet
        open={showConfirm}
        onOpenChange={(open) => !open && !isDisconnecting && setShowConfirm(false)}
      >
        <SheetContent
          side="bottom"
          className="flex flex-col max-w-lg mx-auto"
          onPointerDownOutside={(e) => isDisconnecting && e.preventDefault()}
          onEscapeKeyDown={(e) => isDisconnecting && e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{t('Disconnect Google Health')}</SheetTitle>
            <SheetDescription>{t('disconnectGoogleHealthConfirm')}</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button
              variant="secondary"
              onClick={() => setShowConfirm(false)}
              disabled={isDisconnecting}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className={isDisconnecting ? 'animate-pulse' : ''}
            >
              {isDisconnecting ? t('Disconnecting...') : t('Disconnect')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
});

export default FitbitCard;
