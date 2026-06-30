import { useEffect } from 'react';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ChartColumn, Calendar, BookUser, FileQuestion, LucideIcon } from 'lucide-react';
import ArrowLeftIcon from '@/assets/icons/arrow-left-fill.svg?react';
import { useTherapistPatientDetail } from '@/hooks/useTherapistPatientDetail';
import { TherapistPatientDetailLoadingContent } from '@/components/skeletons/TherapistPatientDetailSkeleton';
import authStore from '@/stores/authStore';

const TABS: { value: string; icon: LucideIcon; label: string; content: string }[] = [
  {
    value: 'outcomes',
    icon: ChartColumn,
    label: 'Outcomes',
    content: 'Outcomes content goes here',
  },
  {
    value: 'rehabilitationplan',
    icon: Calendar,
    label: 'Rehabilitation Plan',
    content: 'Rehabilitation Plan content goes here',
  },
  {
    value: 'questionnaires',
    icon: FileQuestion,
    label: 'Questionnaires',
    content: 'Questionnaires content goes here',
  },
  {
    value: 'information',
    icon: BookUser,
    label: 'Information',
    content: 'Information content goes here',
  },
];

const TherapistPatientDetail: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { patientId = '' } = useParams<{ patientId: string }>();

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    }
  }, [navigate]);

  const { patient, loading, error } = useTherapistPatientDetail(patientId);
  const fullName = patient ? `${patient.first_name || ''} ${patient.name || ''}`.trim() : '';
  const infoItems = [
    patient?.age,
    patient?.sex && t(patient.sex),
    (patient?.diagnosis || []).map((d) => t(d)).join(', '),
  ].filter(Boolean);

  return (
    <Layout>
      <ArrowLeftIcon className="h-6 w-6 cursor-pointer mb-3" onClick={() => navigate(-1)} />

      {loading && <TherapistPatientDetailLoadingContent />}

      {!loading && error && <div className="text-nok text-sm py-2">{error}</div>}

      {!loading && !error && (
        <div className="flex flex-col gap-1">
          <div className="text-sm text-muted-foreground">{patient?.patient_code}</div>
          <PageHeader title={fullName || patientId} />
          <div className="flex gap-3 text-sm text-muted-foreground">
            {infoItems.map((item, index) => (
              <span key={index} className="flex gap-3">
                {index > 0 && <span>·</span>}
                <span>{item}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <Separator className="my-3" />

      <Tabs defaultValue="outcomes">
        <TabsList>
          {TABS.map(({ value, icon: Icon, label }) => (
            <TabsTrigger key={value} value={value}>
              <Icon />
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, content }) => (
          <TabsContent key={value} value={value}>
            <div>{t(content)}</div>
          </TabsContent>
        ))}
      </Tabs>
    </Layout>
  );
});

export default TherapistPatientDetail;
