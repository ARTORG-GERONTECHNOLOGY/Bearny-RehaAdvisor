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
import HealthPageContent from '@/components/Health/HealthPageContent';
import RehabilitationPlanContent from '@/components/RehaTablePage/RehabilitationPlanContent';
import QuestionnairesContent from '@/components/RehaTablePage/QuestionnairesContent';
import PatientInfoContent from '@/components/TherapistPatientPage/PatientInfoContent';

const TABS: {
  value: string;
  icon: LucideIcon;
  label: string;
  Component: React.ComponentType<{ patientId: string }>;
}[] = [
  {
    value: 'outcomes',
    icon: ChartColumn,
    label: 'Outcomes Dashboard',
    Component: HealthPageContent,
  },
  {
    value: 'rehabilitationplan',
    icon: Calendar,
    label: 'Rehabilitation Plan',
    Component: RehabilitationPlanContent,
  },
  {
    value: 'questionnaires',
    icon: FileQuestion,
    label: 'Questionnaires',
    Component: QuestionnairesContent,
  },
  {
    value: 'information',
    icon: BookUser,
    label: 'Information',
    Component: PatientInfoContent,
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
        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value}>
            <Component patientId={patientId} />
          </TabsContent>
        ))}
      </Tabs>
    </Layout>
  );
});

export default TherapistPatientDetail;
