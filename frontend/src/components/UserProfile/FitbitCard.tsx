import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import FitbitConnectButton from '@/components/PatientPage/FitbitStatus';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import { observer } from 'mobx-react-lite';

const FitbitCard = observer(() => {
  const { t } = useTranslation();
  const { connected } = patientFitbitStore;

  return (
    <div
      className={`p-4 rounded-3xl flex gap-1 justify-between items-center ${connected === false ? 'bg-zinc-100' : 'border border-accent'}`}
    >
      {connected === true ? (
        <div className="flex flex-col">
          <div className="font-medium text-sm text-zinc-500">{t('Fitness Tracker')}</div>
          <div className="font-bold text-lg text-zinc-800">{t('Fitbit Connected')}</div>
        </div>
      ) : connected === false ? (
        <>
          <div className="flex flex-col">
            <div className="font-bold text-lg text-zinc-800">{t('Fitbit')}</div>
            <div className="font-medium text-sm text-zinc-500">{t('Fitness Tracker')}</div>
          </div>
          <FitbitConnectButton />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-32" />
        </div>
      )}
    </div>
  );
});

export default FitbitCard;
