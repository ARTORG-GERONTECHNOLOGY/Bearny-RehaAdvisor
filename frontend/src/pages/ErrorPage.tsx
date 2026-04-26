import React from 'react';
import * as Sentry from '@sentry/react';
import { useTranslation } from 'react-i18next';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import Card from '@/components/Card';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import authStore from '@/stores/authStore';

type FeedbackFormHandle = {
  appendToDom: () => void;
  open: () => void;
  removeFromDom: () => void;
};

const ErrorPage: React.FC = () => {
  const { t } = useTranslation();
  const error = useRouteError();
  const feedbackFormRef = React.useRef<FeedbackFormHandle | null>(null);
  const [eventId, setEventId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (error instanceof Error) {
      const id = Sentry.captureException(error);
      setEventId(id);
    }
    return () => {
      feedbackFormRef.current?.removeFromDom();
    };
  }, [error]);

  const handleReportBug = async () => {
    const feedback = Sentry.getFeedback();

    if (!feedback) {
      console.warn('Sentry feedback integration is not available.');
      return;
    }

    Sentry.setUser({
      email: authStore.email || undefined,
      username: authStore.firstName || undefined,
    });

    if (!feedbackFormRef.current) {
      feedbackFormRef.current = await feedback.createForm(
        eventId ? { tags: { error_event_id: eventId } } : undefined
      );
    }

    feedbackFormRef.current.appendToDom();
    feedbackFormRef.current.open();
  };

  let message = t('Something went wrong. Please try again later.');
  if (isRouteErrorResponse(error)) {
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <Layout>
      <Card className="bg-white max-w-lg mx-auto">
        <h1 className="font-bold text-nok" aria-label="Error">
          {t('Error')}
        </h1>
        <div>{message}</div>
        {Sentry.getFeedback() && (
          <Button onClick={handleReportBug} className="mt-3 bg-nok hover:bg-nok/90">
            {t('Report Bug')}
          </Button>
        )}
      </Card>
    </Layout>
  );
};

export default ErrorPage;
