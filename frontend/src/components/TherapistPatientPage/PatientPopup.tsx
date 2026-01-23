/* eslint-disable */
import React, { useEffect, useMemo } from 'react';
import { Button, Col, Form, Row, Spinner, Tabs, Tab } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import { observer } from 'mobx-react-lite';
import { FaEdit, FaTrash, FaUndo, FaDownload } from 'react-icons/fa';

import config from '../../config/config.json';
import { PatientType } from '../../types';
import ErrorAlert from '../common/ErrorAlert';

import StandardModal from '../common/StandardModal';
import ConfirmModal from '../common/ConfirmModal';
import { PatientPopupStore, toDateInput, toDisplayDate, SelectOption } from '../../stores/patientPopupStore';

interface PatientPopupProps {
  patient_id: PatientType;
  show: boolean;
  handleClose: () => void;
}

const PatientPopup: React.FC<PatientPopupProps> = observer(({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();

  const store = useMemo(() => new PatientPopupStore(String((patient_id as any)._id)), [patient_id]);

  useEffect(() => {
    if (!show) return;
    store.fetchPatientData(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, store]);

  const onClose = () => {
    // if you want: prevent closing while editing / or if dirty later
    handleClose();
  };

  const handleDelete = async () => {
    const ok = await store.deletePatient(t);
    if (!ok) return;
    store.setShowConfirmDelete(false);
    handleClose();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    store.setField(id, value);
  };

  const renderField = (field: any) => {
    const key = field.be_name;
    const fieldValue = store.formData[key];
    const isDisabled = !store.isEditing || key === 'access_word';

    if (field.type === 'multi-select') {
      const options =
        key === 'diagnosis' && store.formData.function?.length
          ? store.formData.function.flatMap((spec: string) =>
              (store.specialityDiagnosisMap[spec] || []).map((diag) => ({ value: diag, label: t(diag) }))
            )
          : (field.options || []).map((opt: string) => ({ value: opt, label: t(opt) }));

      return (
        <Select
          inputId={key}
          isMulti
          isDisabled={isDisabled}
          options={options}
          value={(fieldValue || []).map((val: string) => ({ value: val, label: t(val) }))}
          onChange={(selected) => store.setMultiSelect(key, selected as any)}
          aria-label={t(field.label)}
        />
      );
    }

    if (field.type === 'dropdown') {
      return (
        <Form.Select
          id={key}
          value={fieldValue || ''}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        >
          <option value="">{t('Select an option')}</option>
          {(field.options || []).map((opt: string) => (
            <option key={opt} value={opt}>
              {t(opt)}
            </option>
          ))}
        </Form.Select>
      );
    }

    if (field.type === 'date') {
      return (
        <Form.Control
          id={key}
          type="date"
          value={toDateInput(fieldValue)}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        />
      );
    }

    const commonMaxLength = field.type === 'text' || !field.type ? 500 : undefined;

    return (
      <Form.Control
        id={key}
        type={field.type}
        value={fieldValue || ''}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label={t(field.label)}
        maxLength={commonMaxLength}
      />
    );
  };

  const title = `${store.formData.first_name || ''} ${store.formData.name || t('Patient')}`.trim();

  return (
    <>
      <StandardModal
        show={show}
        onHide={onClose}
        title={title}
        size="lg"
        backdrop="static"
        keyboard={false}
        footer={
          store.isEditing ? (
            <>
              <Button variant="secondary" onClick={() => store.setEditing(false)}>
                <FaUndo className="me-2" />
                {t('Cancel')}
              </Button>
              <Button variant="success" onClick={() => store.save(t)} disabled={store.loading}>
                <FaDownload className="me-2" />
                {t('SaveChanges')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="warning" onClick={() => store.setEditing(true)} disabled={store.loading}>
                <FaEdit className="me-2" />
                {t('Edit')}
              </Button>
              <Button
                variant="danger"
                onClick={() => store.setShowConfirmDelete(true)}
                aria-label={t('DeletePatient')}
                disabled={store.loading}
              >
                <FaTrash className="me-2" />
                {t('DeletePatient')}
              </Button>
            </>
          )
        }
      >
        {store.loading ? (
          <div className="text-center my-4">
            <Spinner animation="border" role="status" aria-label={t('Loading')} />
            <p className="mt-3">{t('Loading')}...</p>
          </div>
        ) : (
          <>
            {store.error && <ErrorAlert message={store.error} onClose={() => store.setError('')} />}

            <Tabs
              id="patient-details-tabs"
              activeKey={store.activeTab}
              onSelect={(k) => store.setActiveTab((k as any) || 'profile')}
              className="mb-3"
            >
              <Tab eventKey="profile" title={t('Profile')}>
                <div className="mb-4">
                  <h5 className="mb-3">{t('Contacts')}</h5>
                  <Row className="g-3">
                    <Col xs={12} md={6}>
                      <Form.Group controlId="last_online_contact">
                        <Form.Label>{t('Last online visit')}</Form.Label>
                        <Form.Control
                          plaintext
                          readOnly
                          value={toDisplayDate(store.formData.last_online_contact) || '—'}
                        />
                      </Form.Group>
                    </Col>

                    <Col xs={12} md={6}>
                      <Form.Group controlId="last_clinic_visit">
                        <Form.Label>{t('Last clinic visit')}</Form.Label>
                        {store.isEditing ? (
                          <Form.Control
                            id="last_clinic_visit"
                            type="date"
                            value={toDateInput(store.formData.last_clinic_visit)}
                            onChange={handleChange}
                          />
                        ) : (
                          <Form.Control
                            plaintext
                            readOnly
                            value={toDisplayDate(store.formData.last_clinic_visit) || '—'}
                          />
                        )}
                      </Form.Group>
                    </Col>

                    <Col xs={12}>
                      <Form.Group controlId="clinic">
                        <Form.Label>{t('Clinics')}</Form.Label>
                        <Form.Control
                          id="clinic"
                          type="text"
                          value={store.formData.clinic || ''}
                          onChange={handleChange}
                          disabled={!store.isEditing}
                          placeholder={t('e.g. Inselspital Bern')}
                          maxLength={200}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </div>

                {(config as any).PatientForm.map((section: any, idx: number) => (
                  <div key={idx} className="mb-4">
                    <h5 className="mb-3">{t(section.title)}</h5>
                    <Row className="g-3">
                      {section.fields
                        .filter((f: any) => !['password', 'repeatPassword'].includes(f.type))
                        .map((field: any, index: number) => (
                          <Col xs={12} md={6} key={`${section.title}-${field.be_name}-${index}`}>
                            <Form.Group controlId={field.be_name}>
                              <Form.Label>{t(field.label)}</Form.Label>
                              {renderField(field)}
                            </Form.Group>
                          </Col>
                        ))}
                    </Row>
                  </div>
                ))}
              </Tab>

              <Tab eventKey="characteristics" title={t('Characteristics')}>
                <Row className="g-3">
                  <Col xs={12} md={6}>
                    <Form.Group controlId="level_of_education">
                      <Form.Label>{t('Level of education')}</Form.Label>
                      <Form.Control
                        id="level_of_education"
                        type="text"
                        value={store.formData.level_of_education || ''}
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="professional_status">
                      <Form.Label>{t('Professional status')}</Form.Label>
                      <Form.Control
                        id="professional_status"
                        type="text"
                        value={store.formData.professional_status || ''}
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="marital_status">
                      <Form.Label>{t('Marital status')}</Form.Label>
                      <Form.Control
                        id="marital_status"
                        type="text"
                        value={store.formData.marital_status || ''}
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="lifestyle">
                      <Form.Label>{t('Lifestyle (comma separated)')}</Form.Label>
                      <Form.Control
                        id="lifestyle"
                        type="text"
                        value={store.arrayToDisplay(store.formData.lifestyle)}
                        onChange={(e) => store.setCommaSeparated('lifestyle', e.target.value)}
                        disabled={!store.isEditing}
                        placeholder={t('e.g. Non-smoker, Active, Vegetarian')}
                        maxLength={1000}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="personal_goals">
                      <Form.Label>{t('Personal goals (comma separated)')}</Form.Label>
                      <Form.Control
                        id="personal_goals"
                        type="text"
                        value={store.arrayToDisplay(store.formData.personal_goals)}
                        onChange={(e) => store.setCommaSeparated('personal_goals', e.target.value)}
                        disabled={!store.isEditing}
                        placeholder={t('e.g. Walk 30 min daily, Return to work')}
                        maxLength={1000}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="social_support">
                      <Form.Label>{t('Social support (comma separated)')}</Form.Label>
                      <Form.Control
                        id="social_support"
                        type="text"
                        value={store.arrayToDisplay(store.formData.social_support)}
                        onChange={(e) => store.setCommaSeparated('social_support', e.target.value)}
                        disabled={!store.isEditing}
                        placeholder={t('e.g. Family, Friends, Community group')}
                        maxLength={1000}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12}>
                    <Form.Group controlId="restrictions">
                      <Form.Label>{t('Restrictions')}</Form.Label>
                      <Form.Control
                        id="restrictions"
                        as="textarea"
                        rows={3}
                        value={store.formData.restrictions || ''}
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={2000}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Tab>
            </Tabs>
          </>
        )}
      </StandardModal>

      <ConfirmModal
        show={store.showConfirmDelete}
        onHide={() => store.setShowConfirmDelete(false)}
        title={t('ConfirmDeletion')}
        body={<p className="mb-0">{t('DeleteConfirPAt')}</p>}
        cancelText={t('Cancel')}
        confirmText={t('Delete')}
        onConfirm={handleDelete}
        isConfirmDisabled={store.loading}
      />
    </>
  );
});

export default PatientPopup;
