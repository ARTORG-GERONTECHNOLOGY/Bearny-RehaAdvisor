import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '@/stores/authStore';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';

type ProcessFilter = 'week' | 'month';

const PatientProcess: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [processFilter, setProcessFilter] = React.useState<ProcessFilter>('week');

  const filterOptions: { value: ProcessFilter; label: string }[] = [
    { value: 'week', label: t('Last Week') },
    { value: 'month', label: t('Last Month') },
  ];

  useEffect(() => {
    let alive = true;

    const checkAuth = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;
      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
      }
    };

    checkAuth();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <Layout>
      <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">{t('Process')}</h1>

      <div
        className="mt-8 flex gap-1 no-scrollbar overflow-y-auto"
        role="group"
        aria-label={t('Filter by time period')}
      >
        {filterOptions.map(({ value, label }) => (
          <Badge
            key={value}
            onClick={() => setProcessFilter(value)}
            className={`font-medium rounded-full py-[10px] px-4 border-none shadow-none text-nowrap ${
              processFilter === value ? 'bg-white text-zinc-800' : 'bg-zinc-50 text-zinc-400'
            }`}
            role="button"
            aria-pressed={processFilter === value}
            aria-label={processFilter === 'week' ? t('Show last week') : t('Show last month')}
          >
            {label}
          </Badge>
        ))}
      </div>

      <div className="flex flex-col gap-2 mt-6">
        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          TODO: show history of {processFilter === 'week' ? t('last week') : t('last month')} here...
        </div>
      </div>
    </Layout>
  );
});

export default PatientProcess;
