import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ChartColumn, Calendar, BookUser, FileQuestion } from 'lucide-react';

const TherapistPatientDetail: React.FC = observer(() => {
  const { t } = useTranslation();
  const { patientId = '' } = useParams<{ patientId: string }>();

  return (
    <Layout>
      <PageHeader title={patientId} />

      <Separator className="my-3" />

      <Tabs defaultValue="outcomes">
        <TabsList>
          <TabsTrigger value="outcomes">
            <ChartColumn />
            {t('Outcomes')}
          </TabsTrigger>
          <TabsTrigger value="rehabilitationplan">
            <Calendar />
            {t('Rehabilitation Plan')}
          </TabsTrigger>
          <TabsTrigger value="questionnaires">
            <FileQuestion />
            {t('Questionnaires')}
          </TabsTrigger>
          <TabsTrigger value="information">
            <BookUser />
            {t('Information')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="outcomes">
          <div className="p-4">{t('Outcomes content goes here')}</div>
        </TabsContent>
        <TabsContent value="rehabilitationplan">
          <div className="p-4">{t('Rehabilitation Plan content goes here')}</div>
        </TabsContent>
        <TabsContent value="questionnaires">
          <div className="p-4">{t('Questionnaires content goes here')}</div>
        </TabsContent>
        <TabsContent value="information">
          <div className="p-4">{t('Information content goes here')}</div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
});

export default TherapistPatientDetail;
