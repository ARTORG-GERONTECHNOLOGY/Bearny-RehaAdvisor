import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '@/stores/authStore';
import Layout from '@/components/Layout';

const PatientProcess: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
    </Layout>
  );
});

export default PatientProcess;
