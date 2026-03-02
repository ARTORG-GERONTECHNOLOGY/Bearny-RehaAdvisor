/* eslint-disable */
import React, { useEffect, useMemo } from 'react';
import { Button, Col, Form, Row, Spinner, Tabs, Tab, Badge, Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import { observer } from 'mobx-react-lite';
import { FaEdit, FaTrash, FaUndo, FaDownload, FaCloudDownloadAlt, FaSyncAlt, FaKey } from 'react-icons/fa';

import config from '../../config/config.json';
import { PatientType } from '../../types';
import ErrorAlert from '../common/ErrorAlert';

import StandardModal from '../common/StandardModal';
import ConfirmModal from '../common/ConfirmModal';
import { PatientPopupStore, toDateInput, toDisplayDate } from '../../stores/patientPopupStore';

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
    if (show) {
      store.fetchPatientData(t);
      store.fetchThresholds(t); // new
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, store]);

  const onClose = () => {
    handleClose();
  };

  const handleDelete = async () => {
    const ok = await store.deletePatient(t);
    if (!ok) return;
    store.setShowConfirmDelete(false);
    handleClose();
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    store.setField(id, value);
  };

  const SourceBadge = ({ fieldKey }: { fieldKey: string }) => {
    const src = store.getValueSource(fieldKey);
    if (src === 'manual')
      return (
        <Badge bg="success" className="ms-2">
          {t('Manual')}
        </Badge>
      );
    if (src === 'redcap')
      return (
        <Badge bg="info" className="ms-2">
          {t('REDCap')}
        </Badge>
      );
    return (
      <Badge bg="secondary" className="ms-2">
        {t('Empty')}
      </Badge>
    );
  };

  const renderField = (field: any) => {
    const key = field.be_name;

    // In edit mode: edit manual data
    const manualValue = store.formData[key];

    // In view mode: show manual-or-redcap fallback
    const displayValue = store.getDisplayValue(key);

    const isDisabled = !store.isEditing || key === 'access_word';

    if (field.type === 'multi-select') {
      const currentValues: string[] = (
        store.isEditing ? manualValue || [] : displayValue || []
      ) as any;

      const options =
        key === 'diagnosis' && store.formData.function?.length
          ? store.formData.function.flatMap((spec: string) =>
              (store.specialityDiagnosisMap[spec] || []).map((diag: string) => ({
                value: diag,
                label: t(diag),
              }))
            )
          : (field.options || []).map((opt: string) => ({ value: opt, label: t(opt) }));

      return (
        <Select
          inputId={key}
          isMulti
          isDisabled={isDisabled}
          options={options}
          value={(currentValues || []).map((val: string) => ({ value: val, label: t(val) }))}
          onChange={(selected) => store.setMultiSelect(key, selected as any)}
          aria-label={t(field.label)}
        />
      );
    }

    if (field.type === 'dropdown') {
      const v = store.isEditing ? manualValue || '' : displayValue || '';

      return (
        <Form.Select
          id={key}
          value={v}
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
      const v = store.isEditing ? manualValue : displayValue;

      return (
        <Form.Control
          id={key}
          type="date"
          value={toDateInput(v)}
          onChange={handleChange}
          disabled={isDisabled}
          aria-label={t(field.label)}
        />
      );
    }

    const commonMaxLength = field.type === 'text' || !field.type ? 500 : undefined;
    const v = store.isEditing ? manualValue || '' : displayValue || '';

    return (
      <Form.Control
        id={key}
        type={field.type}
        value={v}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label={t(field.label)}
        maxLength={commonMaxLength}
      />
    );
  };

  const title = `${store.formData.first_name || store.manualData.first_name || ''} ${
    store.formData.name || store.manualData.name || t('Patient')
  }`.trim();

  const hasRedcap = (store.redcapRows?.length || 0) > 0;

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
              <Button
                variant="secondary"
                onClick={() => store.setEditing(false)}
                disabled={store.saving}
              >
                <FaUndo className="me-2" />
                {t('Cancel')}
              </Button>

              {hasRedcap && (
                <Button
                  variant="outline-info"
                  onClick={() => store.copyRedcapIntoManual()}
                  disabled={store.saving}
                  title={t('Copy missing fields from REDCap into the manual form')}
                >
                  <FaCloudDownloadAlt className="me-2" />
                  {t('Copy from REDCap')}
                </Button>
              )}

              <Button
                variant="success"
                onClick={() => store.saveAll(t)} // new wrapper
                disabled={store.saving}
              >
                <FaDownload className="me-2" />
                {store.saving ? t('Saving...') : t('SaveChanges')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="warning"
                onClick={() => store.setEditing(true)}
                disabled={store.loading || store.saving}
              >
                <FaEdit className="me-2" />
                {t('Edit')}
              </Button>

              <Button
                variant="outline-secondary"
                onClick={() => store.fetchRedcapIfPossible(t)}
                disabled={store.loading || store.redcapLoading}
                title={t('Refresh REDCap data')}
              >
                <FaSyncAlt className="me-2" />
                {store.redcapLoading ? t('Loading...') : t('Refresh REDCap')}
              </Button>

              <Button
                variant="danger"
                onClick={() => store.setShowConfirmDelete(true)}
                aria-label={t('DeletePatient')}
                disabled={store.loading || store.saving}
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

            {store.redcapError && (
              <div className="mb-3">
                <ErrorAlert
                  message={store.redcapError}
                  onClose={() => (store.redcapError = null)}
                />
              </div>
            )}

            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <div className="text-muted">
                {t('Data mode')}:&nbsp;
                {store.hasManualInfo ? (
                  <Badge bg="success">{t('Manual preferred')}</Badge>
                ) : (
                  <Badge bg="info">{t('REDCap fallback')}</Badge>
                )}
              </div>

              {store.redcapProject && (
                <div className="text-muted">
                  {t('REDCap Project')}: <Badge bg="info">{store.redcapProject}</Badge>
                </div>
              )}
            </div>

            {(store.redcapIdentifier ||
              store.redcapRecordId ||
              store.redcapPatId ||
              store.redcapDag) && (
              <div className="text-muted mb-3">
                {store.redcapIdentifier && (
                  <span className="me-3">
                    {t('Identifier')}: <Badge bg="secondary">{store.redcapIdentifier}</Badge>
                  </span>
                )}
                {store.redcapRecordId && (
                  <span className="me-3">
                    {t('Record ID')}: <Badge bg="secondary">{store.redcapRecordId}</Badge>
                  </span>
                )}
                {store.redcapPatId && (
                  <span className="me-3">
                    {t('pat_id')}: <Badge bg="secondary">{store.redcapPatId}</Badge>
                  </span>
                )}
                {store.redcapDag && (
                  <span className="me-3">
                    {t('DAG')}: <Badge bg="secondary">{store.redcapDag}</Badge>
                  </span>
                )}
              </div>
            )}

            <Tabs
              id="patient-details-tabs"
              activeKey={store.activeTab}
              onSelect={(k) => store.setActiveTab(((k as any) || 'profile') as any)}
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
                          value={toDisplayDate(store.getDisplayValue('last_online_contact')) || '—'}
                        />
                      </Form.Group>
                    </Col>

                    <Col xs={12} md={6}>
                      <Form.Group controlId="last_clinic_visit">
                        <Form.Label>
                          {t('Last clinic visit')} <SourceBadge fieldKey="last_clinic_visit" />
                        </Form.Label>
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
                            value={toDisplayDate(store.getDisplayValue('last_clinic_visit')) || '—'}
                          />
                        )}
                      </Form.Group>
                    </Col>

                    <Col xs={12}>
                      <Form.Group controlId="clinic">
                        <Form.Label>
                          {t('Clinics')} <SourceBadge fieldKey="clinic" />
                        </Form.Label>
                        <Form.Control
                          id="clinic"
                          type="text"
                          value={
                            store.isEditing
                              ? store.formData.clinic || ''
                              : store.getDisplayValue('clinic') || ''
                          }
                          onChange={handleChange}
                          disabled={!store.isEditing}
                          placeholder={t('e.g. Inselspital Bern')}
                          maxLength={200}
                        />
                      </Form.Group>
                    </Col>

                    <Col xs={12} md={6}>
                      <Form.Group controlId="reha_end_date">
                        <Form.Label>
                          {t('Rehabilitation end date')} <SourceBadge fieldKey="reha_end_date" />
                        </Form.Label>
                        {store.isEditing ? (
                          <Form.Control
                            id="reha_end_date"
                            type="date"
                            value={toDateInput(store.formData.reha_end_date)}
                            onChange={handleChange}
                          />
                        ) : (
                          <Form.Control
                            plaintext
                            readOnly
                            value={toDisplayDate(store.getDisplayValue('reha_end_date')) || '—'}
                          />
                        )}
                      </Form.Group>
                    </Col>
                  </Row>
                </div>

                {(config as any).PatientForm.map((section: any, idx: number) => (
                  <div key={idx} className="mb-4">
                    <h5 className="mb-3">{t(section.title)}</h5>
                    <Row className="g-3">
                      {section.fields
                        .filter((f: any) => !['password', 'repeatPassword'].includes(f.name))
                        .map((field: any, index: number) => (
                          <Col xs={12} md={6} key={`${section.title}-${field.be_name}-${index}`}>
                            <Form.Group controlId={field.be_name}>
                              <Form.Label>
                                {t(field.label)}
                                <SourceBadge fieldKey={field.be_name} />
                              </Form.Label>
                              {renderField(field)}
                            </Form.Group>
                          </Col>
                        ))}
                    </Row>
                  </div>
                ))}

                {/* ── Password reset section ───────────────────────────── */}
                <div className="mb-2">
                  <hr />
                  <Button
                    variant={store.showPasswordReset ? 'outline-secondary' : 'outline-warning'}
                    size="sm"
                    onClick={() => store.setShowPasswordReset(!store.showPasswordReset)}
                    aria-expanded={store.showPasswordReset}
                  >
                    <FaKey className="me-2" />
                    {store.showPasswordReset ? t('CancelPasswordReset') : t('ResetPassword')}
                  </Button>

                  {store.showPasswordReset && (
                    <div className="mt-3">
                      {store.passwordError && (
                        <div className="alert alert-danger py-2 px-3 mb-2" role="alert">
                          {store.passwordError}
                        </div>
                      )}
                      {store.passwordSuccess && (
                        <div className="alert alert-success py-2 px-3 mb-2" role="alert">
                          {t('PasswordResetSuccess')}
                        </div>
                      )}
                      <Row className="g-2 align-items-end">
                        <Col xs={12} md={4}>
                          <Form.Group controlId="pw-reset-new">
                            <Form.Label className="small mb-1">{t('NewPassword')}</Form.Label>
                            <Form.Control
                              type="password"
                              value={store.passwordNew}
                              onChange={(e) => store.setPasswordNew(e.target.value)}
                              placeholder="••••••••"
                              autoComplete="new-password"
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                          <Form.Group controlId="pw-reset-confirm">
                            <Form.Label className="small mb-1">{t('ConfirmPassword')}</Form.Label>
                            <Form.Control
                              type="password"
                              value={store.passwordConfirm}
                              onChange={(e) => store.setPasswordConfirm(e.target.value)}
                              placeholder="••••••••"
                              autoComplete="new-password"
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={12} md={4}>
                          <Button
                            variant="warning"
                            disabled={store.passwordSaving}
                            onClick={() => store.resetPassword(t)}
                            className="w-100"
                          >
                            <FaKey className="me-2" />
                            {store.passwordSaving ? t('Saving...') : t('SetNewPassword')}
                          </Button>
                        </Col>
                      </Row>
                      <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                        {t('PasswordStrengthHint')}
                      </div>
                    </div>
                  )}
                </div>
              </Tab>

              <Tab eventKey="characteristics" title={t('Characteristics')}>
                <Row className="g-3">
                  <Col xs={12} md={6}>
                    <Form.Group controlId="level_of_education">
                      <Form.Label>
                        {t('Level of education')} <SourceBadge fieldKey="level_of_education" />
                      </Form.Label>
                      <Form.Control
                        id="level_of_education"
                        type="text"
                        value={
                          store.isEditing
                            ? store.formData.level_of_education || ''
                            : store.getDisplayValue('level_of_education') || ''
                        }
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="professional_status">
                      <Form.Label>
                        {t('Professional status')} <SourceBadge fieldKey="professional_status" />
                      </Form.Label>
                      <Form.Control
                        id="professional_status"
                        type="text"
                        value={
                          store.isEditing
                            ? store.formData.professional_status || ''
                            : store.getDisplayValue('professional_status') || ''
                        }
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="marital_status">
                      <Form.Label>
                        {t('Marital status')} <SourceBadge fieldKey="marital_status" />
                      </Form.Label>
                      <Form.Control
                        id="marital_status"
                        type="text"
                        value={
                          store.isEditing
                            ? store.formData.marital_status || ''
                            : store.getDisplayValue('marital_status') || ''
                        }
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="lifestyle">
                      <Form.Label>
                        {t('Lifestyle (comma separated)')} <SourceBadge fieldKey="lifestyle" />
                      </Form.Label>
                      <Form.Control
                        id="lifestyle"
                        type="text"
                        value={
                          store.isEditing
                            ? store.arrayToDisplay(store.formData.lifestyle)
                            : store.arrayToDisplay(store.getDisplayValue('lifestyle'))
                        }
                        onChange={(e) => store.setCommaSeparated('lifestyle', e.target.value)}
                        disabled={!store.isEditing}
                        placeholder={t('e.g. Non-smoker, Active, Vegetarian')}
                        maxLength={1000}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="personal_goals">
                      <Form.Label>
                        {t('Personal goals (comma separated)')}{' '}
                        <SourceBadge fieldKey="personal_goals" />
                      </Form.Label>
                      <Form.Control
                        id="personal_goals"
                        type="text"
                        value={
                          store.isEditing
                            ? store.arrayToDisplay(store.formData.personal_goals)
                            : store.arrayToDisplay(store.getDisplayValue('personal_goals'))
                        }
                        onChange={(e) => store.setCommaSeparated('personal_goals', e.target.value)}
                        disabled={!store.isEditing}
                        placeholder={t('e.g. Walk 30 min daily, Return to work')}
                        maxLength={1000}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={6}>
                    <Form.Group controlId="social_support">
                      <Form.Label>
                        {t('Social support (comma separated)')}{' '}
                        <SourceBadge fieldKey="social_support" />
                      </Form.Label>
                      <Form.Control
                        id="social_support"
                        type="text"
                        value={
                          store.isEditing
                            ? store.arrayToDisplay(store.formData.social_support)
                            : store.arrayToDisplay(store.getDisplayValue('social_support'))
                        }
                        onChange={(e) => store.setCommaSeparated('social_support', e.target.value)}
                        disabled={!store.isEditing}
                        placeholder={t('e.g. Family, Friends, Community group')}
                        maxLength={1000}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12}>
                    <Form.Group controlId="restrictions">
                      <Form.Label>
                        {t('Restrictions')} <SourceBadge fieldKey="restrictions" />
                      </Form.Label>
                      <Form.Control
                        id="restrictions"
                        as="textarea"
                        rows={3}
                        value={
                          store.isEditing
                            ? store.formData.restrictions || ''
                            : store.getDisplayValue('restrictions') || ''
                        }
                        onChange={handleChange}
                        disabled={!store.isEditing}
                        maxLength={2000}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Tab>
              <Tab eventKey="thresholds" title={t('Goals & thresholds')}>
                <div className="mb-3 text-muted">
                  {t(
                    'These goals affect how health charts are colored and how progress is interpreted.'
                  )}
                </div>

                {/* CURRENT THRESHOLDS */}
                <div className="mb-4">
                  <h5 className="mb-3">{t('Current thresholds')}</h5>

                  {!store.thresholds ? (
                    <div className="text-muted">{t('No thresholds loaded.')}</div>
                  ) : (
                    <Row className="g-3">
                      {/* Steps */}
                      <Col xs={12} md={6}>
                        <Form.Group controlId="steps_goal">
                          <Form.Label className="fw-semibold">{t('Steps goal')}</Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.steps_goal ?? store.thresholds.steps_goal ?? 0
                            }
                            onChange={(e) =>
                              store.setThresholdField('steps_goal', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={0}
                            max={200000}
                          />
                        </Form.Group>
                      </Col>

                      {/* Active minutes */}
                      <Col xs={12} md={6}>
                        <Form.Group controlId="active_minutes_green">
                          <Form.Label className="fw-semibold">
                            {t('Active minutes (green)')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.active_minutes_green ??
                              store.thresholds.active_minutes_green ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField(
                                'active_minutes_green',
                                Number(e.target.value)
                              )
                            }
                            disabled={!store.isEditing}
                            min={0}
                            max={1440}
                          />
                        </Form.Group>
                      </Col>

                      <Col xs={12} md={6}>
                        <Form.Group controlId="active_minutes_yellow">
                          <Form.Label className="fw-semibold">
                            {t('Active minutes (yellow)')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.active_minutes_yellow ??
                              store.thresholds.active_minutes_yellow ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField(
                                'active_minutes_yellow',
                                Number(e.target.value)
                              )
                            }
                            disabled={!store.isEditing}
                            min={0}
                            max={1440}
                          />
                          <div className="text-muted small mt-1">
                            {t('Green should be ≥ yellow')}
                          </div>
                        </Form.Group>
                      </Col>

                      {/* Sleep */}
                      <Col xs={12} md={6}>
                        <Form.Group controlId="sleep_green_min">
                          <Form.Label className="fw-semibold">
                            {t('Sleep min (green, minutes)')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.sleep_green_min ??
                              store.thresholds.sleep_green_min ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField('sleep_green_min', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={0}
                            max={1440}
                          />
                        </Form.Group>
                      </Col>

                      <Col xs={12} md={6}>
                        <Form.Group controlId="sleep_yellow_min">
                          <Form.Label className="fw-semibold">
                            {t('Sleep min (yellow, minutes)')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.sleep_yellow_min ??
                              store.thresholds.sleep_yellow_min ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField('sleep_yellow_min', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={0}
                            max={1440}
                          />
                          <div className="text-muted small mt-1">
                            {t('Green should be ≥ yellow')}
                          </div>
                        </Form.Group>
                      </Col>

                      {/* BP */}
                      <Col xs={12} md={6}>
                        <Form.Group controlId="bp_sys_green_max">
                          <Form.Label className="fw-semibold">
                            {t('BP systolic green max')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.bp_sys_green_max ??
                              store.thresholds.bp_sys_green_max ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField('bp_sys_green_max', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={50}
                            max={250}
                          />
                        </Form.Group>
                      </Col>

                      <Col xs={12} md={6}>
                        <Form.Group controlId="bp_sys_yellow_max">
                          <Form.Label className="fw-semibold">
                            {t('BP systolic yellow max')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.bp_sys_yellow_max ??
                              store.thresholds.bp_sys_yellow_max ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField('bp_sys_yellow_max', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={50}
                            max={250}
                          />
                          <div className="text-muted small mt-1">
                            {t('Green max should be ≤ yellow max')}
                          </div>
                        </Form.Group>
                      </Col>

                      <Col xs={12} md={6}>
                        <Form.Group controlId="bp_dia_green_max">
                          <Form.Label className="fw-semibold">
                            {t('BP diastolic green max')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.bp_dia_green_max ??
                              store.thresholds.bp_dia_green_max ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField('bp_dia_green_max', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={30}
                            max={180}
                          />
                        </Form.Group>
                      </Col>

                      <Col xs={12} md={6}>
                        <Form.Group controlId="bp_dia_yellow_max">
                          <Form.Label className="fw-semibold">
                            {t('BP diastolic yellow max')}
                          </Form.Label>
                          <Form.Control
                            type="number"
                            value={
                              store.thresholdDraft.bp_dia_yellow_max ??
                              store.thresholds.bp_dia_yellow_max ??
                              0
                            }
                            onChange={(e) =>
                              store.setThresholdField('bp_dia_yellow_max', Number(e.target.value))
                            }
                            disabled={!store.isEditing}
                            min={30}
                            max={180}
                          />
                          <div className="text-muted small mt-1">
                            {t('Green max should be ≤ yellow max')}
                          </div>
                        </Form.Group>
                      </Col>
                    </Row>
                  )}

                  {/* Effective date + reason (edit mode only) */}
                  {store.isEditing && (
                    <Row className="g-3 mt-2">
                      <Col xs={12} md={6}>
                        <Form.Group controlId="thresholdEffectiveFrom">
                          <Form.Label className="fw-semibold">
                            {t('Effective from (optional)')}
                          </Form.Label>
                          <Form.Control
                            type="datetime-local"
                            value={store.thresholdEffectiveFromLocal}
                            onChange={(e) => store.setThresholdEffectiveFromLocal(e.target.value)}
                          />
                          <div className="text-muted small mt-1">
                            {t('Leave empty to apply immediately.')}
                          </div>
                        </Form.Group>
                      </Col>

                      <Col xs={12} md={6}>
                        <Form.Group controlId="thresholdReason">
                          <Form.Label className="fw-semibold">{t('Reason (optional)')}</Form.Label>
                          <Form.Control
                            type="text"
                            value={store.thresholdReason}
                            onChange={(e) => store.setThresholdReason(e.target.value)}
                            maxLength={500}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  )}
                </div>

                {/* HISTORY */}
                <div>
                  <h5 className="mb-2">{t('Change history')}</h5>
                  <div className="text-muted small mb-2">
                    {t('Older thresholds are saved automatically when you update goals.')}
                  </div>

                  {(store.thresholdsHistory || []).length === 0 ? (
                    <div className="text-muted">{t('No history yet.')}</div>
                  ) : (
                    <Table striped bordered hover responsive size="sm">
                      <thead>
                        <tr>
                          <th style={{ width: 220 }}>{t('Effective from')}</th>
                          <th style={{ width: 180 }}>{t('Changed by')}</th>
                          <th>{t('Reason')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {store.thresholdsHistory.map((h, idx) => (
                          <tr key={idx}>
                            <td>
                              {h.effective_from ? new Date(h.effective_from).toLocaleString() : '—'}
                            </td>
                            <td>{h.changed_by || '—'}</td>
                            <td style={{ whiteSpace: 'pre-wrap' }}>{h.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </div>
              </Tab>

              <Tab eventKey="redcap" title={t('REDCap')}>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="text-muted">
                    {store.redcapProject ? (
                      <>
                        {t('Project')}: <Badge bg="info">{store.redcapProject}</Badge>{' '}
                        <span className="ms-2">
                          {t('Records')}: {store.redcapRows?.length || 0}
                        </span>
                      </>
                    ) : (
                      <span>{t('No project selected')}</span>
                    )}
                  </div>

                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => store.fetchRedcapIfPossible(t)}
                    disabled={store.redcapLoading}
                  >
                    <FaSyncAlt className="me-2" />
                    {store.redcapLoading ? t('Loading...') : t('Refresh')}
                  </Button>
                </div>

                {store.redcapLoading ? (
                  <div className="text-center my-4">
                    <Spinner animation="border" role="status" aria-label={t('Loading')} />
                    <p className="mt-3">{t('Loading')}...</p>
                  </div>
                ) : !hasRedcap ? (
                  <p className="text-muted mb-0">
                    {t('No REDCap data available for this patient.')}
                  </p>
                ) : (
                  <>
                    <p className="text-muted">
                      {t(
                        'This data is fetched live from REDCap and is not stored in the platform database.'
                      )}
                    </p>

                    <Table striped bordered hover responsive size="sm">
                      <thead>
                        <tr>
                          <th style={{ width: 280 }}>{t('Field')}</th>
                          <th>{t('Value')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(store.redcapFlat || {}).map(([k, v]) => (
                          <tr key={k}>
                            <td>
                              <code>{k}</code>
                            </td>
                            <td style={{ whiteSpace: 'pre-wrap' }}>
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </>
                )}
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
        isConfirmDisabled={store.saving}
      />
    </>
  );
});

export default PatientPopup;
