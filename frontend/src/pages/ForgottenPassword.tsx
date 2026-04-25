import React, { useMemo } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '@/components/common/ErrorAlert';

import { ForgotPasswordStore } from '@/stores/forgotPasswordStore';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Container from '@/components/Container';
import PageHeader from '@/components/PageHeader';
import { FieldGroup } from '@/components/ui/field';
import InputField from '@/components/forms/input/InputField';
import Card from '@/components/Card';

const ForgotPassword: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useMemo(() => new ForgotPasswordStore(), []);

  return (
    <div className="min-h-screen bg-back py-16">
      <Container>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => navigate(-1)}
          className="bg-white mb-4"
        >
          <ArrowLeftIcon />
          <span className="sr-only">{t('Back')}</span>
        </Button>
        <PageHeader title={t('ForgottenPassword')} />
        <Card className="bg-white max-w-lg mt-2">
          {store.success && (
            <Alert variant="success" className="text-center">
              {t('Passwordresetlinksent.Pleasecheckyouremail.')}
            </Alert>
          )}

          {store.error && <ErrorAlert message={store.error} onClose={() => (store.error = null)} />}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              store.submit(t);
            }}
          >
            <FieldGroup>
              <InputField
                id="email"
                label={t('Emailaddress')}
                type="email"
                placeholder={t('Enteryouremail')}
                value={store.email}
                onChange={(e) => store.setEmail(e.target.value)}
                required
                disabled={store.loading}
                autoComplete="email"
              />

              <Button type="submit" disabled={store.loading}>
                {store.loading ? (
                  <>
                    <Spinner
                      size="sm"
                      className="me-2"
                      animation="border"
                      role="status"
                      aria-hidden="true"
                    />
                    {t('Loading...')}
                  </>
                ) : (
                  t('Submit')
                )}
              </Button>
            </FieldGroup>
          </form>
        </Card>
      </Container>
    </div>
  );
});

export default ForgotPassword;
