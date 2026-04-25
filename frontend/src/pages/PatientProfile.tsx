import { useEffect } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import Section from '@/components/Section';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Card from '@/components/Card';
import authStore from '@/stores/authStore';
import { observer } from 'mobx-react-lite';
import { Link, useNavigate } from 'react-router-dom';
import LogoutFill from '@/assets/icons/logout-fill.svg?react';
import Mail from '@/assets/icons/contact/mail.svg?react';
import Phone from '@/assets/icons/contact/phone.svg?react';
import config from '@/config/config.json';
import { patientFitbitStore } from '@/stores/patientFitbitStore';
import LanguageSelectorCard from '@/components/UserProfile/LanguageSelectorCard';
import NotificationsCard from '@/components/UserProfile/NotificationsCard';
import FitbitCard from '@/components/UserProfile/FitbitCard';

const PatientProfile: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const patientId = localStorage.getItem('id') || authStore.id || '';
  const displayName = authStore.firstName || t('Profile');

  const partnerLogos = [
    {
      src: '/artorg_unibern_logo.gif',
      alt: 'ARTORG Center for Biomedical Engineering Research',
      className: 'w-[80px]',
    },
    {
      src: '/insel_logo.svg',
      alt: 'Inselspital - Universitatsspital Bern',
      className: 'w-[160px]',
    },
    {
      src: '/brz_logo.png',
      alt: 'Berner Reha Zentrum',
      className: 'w-[160px]',
    },
  ];

  const handleLogout = async () => {
    await authStore.logout();
    navigate('/');
  };

  // Check authentication
  useEffect(() => {
    let alive = true;

    const checkAuth = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;
      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
      }

      if (patientId) {
        patientFitbitStore.fetchStatus(patientId);
      }
    };

    checkAuth();

    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <Layout>
      <PageHeader title={displayName} />
      <div className="mt-8 grid grid-cols-1 gap-2 lg:grid-cols-3 lg:items-start">
        <Section>
          <div className="p-2 pl-4 font-medium text-lg text-zinc-500">{t('Settings')}</div>

          <LanguageSelectorCard />
          <NotificationsCard />
          <FitbitCard />
        </Section>

        <Section>
          <div className="p-2 pl-4 font-medium text-lg text-zinc-500">{t('Contact')}</div>

          <Card className="flex flex-col items-start gap-2">
            <div className="font-bold text-lg leading-6 text-zinc-800">
              {t('Research Project Contact')}
            </div>
            {config.contact.email && (
              <Badge variant="card">
                <a
                  href={`mailto:${config.contact.email}`}
                  className="flex items-center gap-1 no-underline text-brand"
                >
                  <Mail className="w-4 h-4" />
                  <span>{config.contact.email}</span>
                </a>
              </Badge>
            )}
            {config.contact.phone && (
              <Badge variant="card">
                <a
                  href={`tel:${config.contact.phone}`}
                  className="flex items-center gap-1 no-underline text-brand"
                >
                  <Phone className="w-4 h-4" />
                  <span>{config.contact.phone}</span>
                </a>
              </Badge>
            )}
          </Card>
        </Section>

        <div className="flex flex-col items-center gap-6 mt-4 mb-12 lg:hidden">
          {partnerLogos.map((logo) => (
            <img key={logo.src} src={logo.src} alt={logo.alt} className={logo.className} />
          ))}
        </div>

        <Section>
          <Button variant="secondary" onClick={handleLogout}>
            {t('Logout')}
            <LogoutFill />
          </Button>
        </Section>
      </div>

      <div className="hidden lg:flex lg:items-end lg:justify-start lg:gap-6 lg:mt-16">
        {partnerLogos.map((logo) => (
          <img key={logo.src} src={logo.src} alt={logo.alt} className={logo.className} />
        ))}
      </div>

      <div className="flex flex-col gap-1 mt-16 text-sm text-zinc-500">
        <Link to="/terms">{t('Terms & Conditions')}</Link>
        <Link to="/privacypolicy">{t('Privacy Policy')}</Link>
        <div>
          &copy; {new Date().getFullYear()} {t('YourCompanyName')}. {t('Allrightsreserved')}
        </div>
      </div>
    </Layout>
  );
});

export default PatientProfile;
