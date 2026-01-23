import React, { useEffect, useMemo, useCallback } from 'react';
import {
  Button,
  Col,
  Container,
  Form,
  Row,
  Card,
  Table,
  Collapse,
  Badge,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import PatientPopup from '../components/TherapistPatientPage/PatientPopup';
import AddPatientPopup from '../components/AddPatient/AddPatientPopUp';

import authStore from '../stores/authStore';
import config from '../config/config.json';

import { PatientType } from '../types';
import { TherapistPatientsStore, SortKey } from '../stores/therapistPatientsStore';

const Therapist: React.FC = observer(() => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const store = useMemo(() => new TherapistPatientsStore(), []);

  const durationOptions = (config as any).RehaInfo;

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    store.fetchPatients(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, store]);

  // re-fetch after closing add patient popup
  const handleCloseAdd = useCallback(async () => {
    store.closeAddPatient();
    await store.fetchPatients(t);
  }, [store, t]);

  const handleRehabButton = (id: string, name: string) => {
    localStorage.setItem('selectedPatient', id);
    localStorage.setItem('selectedPatientName', name);
    navigate('/rehabtable');
  };

  const handleProgressButton = (id: string, name: string) => {
    localStorage.setItem('selectedPatient', id);
    localStorage.setItem('selectedPatientName', name);
    navigate('/health');
  };

  // helpers for display
  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };

  const fmtDateTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const daysSince = (iso?: string) => {
    if (!iso) return Number.POSITIVE_INFINITY;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  // ===== Ampel helpers =====
  type Traffic = 'good' | 'warn' | 'bad' | 'unknown';
  const chipClass = (level: Traffic) => {
    switch (level) {
      case 'good':
        return 'bg-success';
      case 'warn':
        return 'bg-warning text-dark';
      case 'bad':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  };
  const levelToNum = (lvl: Traffic) => (lvl === 'bad' ? 3 : lvl === 'warn' ? 2 : lvl === 'unknown' ? 1 : 0);
  const levelRankSmallBadFirst = (lvl: Traffic) => (lvl === 'bad' ? 0 : lvl === 'warn' ? 1 : lvl === 'good' ? 2 : 0.5);

  const healthScore = (p: any) => {
    const bio = (p as any).biomarker || (p as any).fitbitData || {};
    const sleep = typeof bio.sleep_avg_h === 'number' ? bio.sleep_avg_h : null;
    const steps = typeof bio.steps_avg === 'number' ? bio.steps_avg : null;
    const act = typeof bio.activity_min === 'number' ? bio.activity_min : null;
    let score = 0;
    let n = 0;

    if (sleep !== null) {
      n++;
      if (sleep >= 7 && sleep <= 9) score += 2;
      else if (sleep >= 6 && sleep < 7) score += 1;
    }
    if (steps !== null) {
      n++;
      if (steps >= 6000) score += 2;
      else if (steps >= 3000) score += 1;
    }
    if (act !== null) {
      n++;
      if (act >= 150) score += 2;
      else if (act >= 60) score += 1;
    }
    return n ? score / n : -1; // 0..2; -1 unknown
  };

  const healthLevelAndTip = (p: any): { level: Traffic; tip: string } => {
    const bio = (p as any).biomarker || (p as any).fitbitData || {};
    const sleep = typeof bio.sleep_avg_h === 'number' ? bio.sleep_avg_h : undefined;
    const steps = typeof bio.steps_avg === 'number' ? bio.steps_avg : undefined;
    const act = typeof bio.activity_min === 'number' ? bio.activity_min : undefined;

    const score = healthScore(p);
    let level: Traffic = 'unknown';
    if (score >= 1.6) level = 'good';
    else if (score >= 0.8) level = 'warn';
    else if (score >= 0) level = 'bad';

    const parts: string[] = [];
    if (typeof sleep === 'number') parts.push(`${t('Sleep')}: ${sleep.toFixed(1)}h ${t('avg (7d)')}`);
    if (typeof steps === 'number') parts.push(`${t('Steps')}: ${Math.round(steps).toLocaleString()} ${t('avg (7d)')}`);
    if (typeof act === 'number') parts.push(`${t('Activity')}: ${Math.round(act)} ${t('min avg (7d)')}`);

    return { level, tip: parts.length ? parts.join(' • ') : t('No recent health data') };
  };

  const loginLevelAndTip = (p: any): { level: Traffic; tip: string } => {
    const last = (p as any).last_online || (p as any).user_last_login || (p as any).last_login || '';
    const d = daysSince(last);
    let level: Traffic = 'unknown';
    if (d === Number.POSITIVE_INFINITY) level = 'unknown';
    else if (d <= 3) level = 'good';
    else if (d <= 7) level = 'warn';
    else level = 'bad';
    return {
      level,
      tip: last ? `${t('Last login')}: ${fmtDateTime(last)} (${d} ${t('days ago')})` : t('Never logged in'),
    };
  };

  const adherenceLevelAndTip = (p: any): { level: Traffic; tip: string } => {
    const rate = (p as any).adherence_rate as number | undefined;
    let level: Traffic = 'unknown';
    if (typeof rate === 'number') {
      if (rate >= 80) level = 'good';
      else if (rate >= 50) level = 'warn';
      else level = 'bad';
    }
    return {
      level,
      tip: typeof rate === 'number' ? `${t('Completed in last 7d')}: ${rate}%` : t('No adherence data'),
    };
  };

  const feedbackLevelAndTip = (p: any): { level: Traffic; tip: string } => {
    const qs: any[] = Array.isArray((p as any).questionnaires) ? (p as any).questionnaires : [];

    if (qs.length === 0) {
      const last = (p as any).last_feedback_at || '';
      const d = daysSince(last);
      let level: Traffic = 'unknown';
      if (!last || d === Number.POSITIVE_INFINITY) level = 'warn';
      else if (d <= 14) level = 'good';
      else if (d <= 30) level = 'warn';
      else level = 'bad';
      const tip = last ? `${t('Last feedback')}: ${fmtDateTime(last)} (${d} ${t('days ago')})` : t('No recent feedback');
      return { level, tip };
    }

    let worst: Traffic = 'good';
    const ord = (lvl: Traffic) => (lvl === 'bad' ? 3 : lvl === 'warn' ? 2 : lvl === 'unknown' ? 1 : 0);
    const lines: string[] = [];

    qs.forEach((q) => {
      const title = q.title || q.key || t('Questionnaire');
      const lastISO: string | null = q.last_answered_at || null;

      const lastScore =
        typeof q.last_score === 'number' ? q.last_score : typeof q.last_score === 'string' ? Number(q.last_score) : null;
      const prevScore =
        typeof q.prev_score === 'number' ? q.prev_score : typeof q.prev_score === 'string' ? Number(q.prev_score) : null;

      let delta =
        typeof q.delta_score === 'number' ? q.delta_score : typeof q.delta_score === 'string' ? Number(q.delta_score) : null;

      if (delta === null && lastScore != null && prevScore != null) delta = lastScore - prevScore;

      const adh7 =
        typeof q.adherence_7 === 'number' ? q.adherence_7 : typeof q.adherence_7 === 'string' ? Number(q.adherence_7) : undefined;
      const answered7 =
        typeof q.answered_7 === 'number' ? q.answered_7 : typeof q.answered_7 === 'string' ? Number(q.answered_7) : undefined;
      const expected7 =
        typeof q.expected_7 === 'number' ? q.expected_7 : typeof q.expected_7 === 'string' ? Number(q.expected_7) : undefined;

      const low = q.low_score === true;
      const days = daysSince(lastISO || undefined);

      let lvl: Traffic = 'good';
      if (low) lvl = 'bad';
      else if (!lastISO) lvl = 'warn';
      else if (days > 30) lvl = 'bad';
      else if (days > 14) lvl = 'warn';
      if (typeof adh7 === 'number' && adh7 < 50) lvl = lvl === 'bad' ? 'bad' : 'warn';

      if (ord(lvl) > ord(worst)) worst = lvl;

      const parts: string[] = [];
      parts.push(title);
      parts.push(lastISO ? fmtDate(lastISO) : t('No answers yet'));
      if (lastScore != null) parts.push(`${t('Score')}: ${lastScore}`);
      if (delta != null && delta !== 0) {
        const arrow = delta < 0 ? '↓' : '↑';
        parts.push(`${arrow} ${Math.abs(delta)}`);
      }
      if (typeof answered7 === 'number' && typeof expected7 === 'number') parts.push(`${t('7d')}: ${answered7}/${expected7}`);
      else if (typeof adh7 === 'number') parts.push(`${t('7d adh')}: ${adh7}%`);

      lines.push(parts.join(' • '));
    });

    return { level: worst || 'unknown', tip: lines.join('\n') || t('No recent feedback') };
  };

  const ampelComposite = (p: any) => {
    const l = loginLevelAndTip(p);
    const a = adherenceLevelAndTip(p);
    const h = healthLevelAndTip(p);
    const f = feedbackLevelAndTip(p);

    const base = levelToNum(l.level) + levelToNum(a.level) + levelToNum(h.level) + levelToNum(f.level);

    const dLogin = daysSince((p as any).last_online || (p as any).user_last_login || (p as any).last_login || '');
    const adh = typeof (p as any).adherence_rate === 'number' ? (p as any).adherence_rate : -1;
    const hScore = healthScore(p);

    const lastFbISO =
      (Array.isArray((p as any).questionnaires) &&
        (p as any).questionnaires
          .map((q: any) => q.last_answered_at)
          .filter(Boolean)
          .sort()
          .slice(-1)[0]) ||
      (p as any).last_feedback_at ||
      '';
    const dFb = daysSince(lastFbISO);

    const tweak =
      (isFinite(dLogin) ? dLogin / 50 : 0) +
      (adh >= 0 ? (100 - adh) / 100 : 0.5) +
      (hScore >= 0 ? (2 - hScore) / 2 : 0.5) +
      (isFinite(dFb) ? dFb / 100 : 0.25);

    return base + tweak;
  };

  const renderStatusChips = (p: any) => {
    const login = loginLevelAndTip(p);
    const adh = adherenceLevelAndTip(p);
    const health = healthLevelAndTip(p);
    const fb = feedbackLevelAndTip(p);

    const Chip = ({ label, level, tip }: { label: string; level: Traffic; tip: string }) => (
      <OverlayTrigger
        placement="top"
        overlay={
          <Tooltip>
            <div style={{ whiteSpace: 'pre-line' }}>{tip}</div>
          </Tooltip>
        }
      >
        <span className={`status-chip ${chipClass(level)}`} role="img" aria-label={`${label} ${level}`}>
          {label}
        </span>
      </OverlayTrigger>
    );

    return (
      <div className="status-stack">
        <Chip label={t('Login')} level={login.level} tip={login.tip} />
        <Chip label={t('Adherence')} level={adh.level} tip={adh.tip} />
        <Chip label={t('Health')} level={health.level} tip={health.tip} />
        <Chip label={t('Feedback')} level={fb.level} tip={fb.tip} />
      </div>
    );
  };

  // ===== Sorting (includes ampel) =====
  const sortedFiltered = useMemo(() => {
    const arr = [...store.filteredPatients];

    const getHealth = (p: any) => healthScore(p);
    const getLogin = (p: any) =>
      daysSince((p as any).last_online || (p as any).user_last_login || (p as any).last_login || '');
    const getAdh = (p: any) => (typeof (p as any).adherence_rate === 'number' ? (p as any).adherence_rate : -1);
    const getFb = (p: any) => levelRankSmallBadFirst(feedbackLevelAndTip(p).level);

    arr.sort((a: any, b: any) => {
      switch (store.sortBy) {
        case 'ampel':
          return ampelComposite(b) - ampelComposite(a);
        case 'last_login':
          return getLogin(a) - getLogin(b);
        case 'adherence':
          return getAdh(b) - getAdh(a);
        case 'health':
          return getHealth(a) - getHealth(b);
        case 'feedback':
          return getFb(a) - getFb(b);
        case 'created':
        default: {
          const da = new Date((a as any).created_at ?? 0).getTime();
          const db = new Date((b as any).created_at ?? 0).getTime();
          return db - da;
        }
      }
    });

    return arr;
  }, [store.filteredPatients, store.sortBy]);

  const { active: activePatients, completed: completedPatients } = useMemo(
    () => store.splitCompleted(sortedFiltered),
    [store, sortedFiltered]
  );

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <Container className="main-content mt-4">
        <WelcomeArea user="Therapist" />

        {store.error && (
          <Row className="mb-3">
            <Col>
              <div className="alert alert-danger d-flex justify-content-between align-items-start">
                <div>
                  <div>{store.error}</div>
                  {store.showErrorDetails && store.errorDetails && (
                    <pre className="bg-light p-2 mt-2 border rounded small" style={{ whiteSpace: 'pre-wrap' }}>
                      {store.errorDetails}
                    </pre>
                  )}
                </div>
                <div className="ms-3 d-flex flex-column gap-2 align-items-end">
                  {store.errorDetails && (
                    <Button size="sm" variant="outline-light" onClick={store.toggleErrorDetails}>
                      {store.showErrorDetails ? t('Hide details') : t('Show details')}
                    </Button>
                  )}
                  <Button size="sm" variant="light" onClick={() => store.fetchPatients(t)} disabled={store.loading}>
                    {store.loading ? t('Loading...') : t('Retry')}
                  </Button>
                </div>
              </div>
            </Col>
          </Row>
        )}

        <Row className="mb-3">
          <Col>
            <Button onClick={store.openAddPatient} disabled={store.loading}>
              {t('Add a New Patient')}
            </Button>
          </Col>
        </Row>

        <Card className="mb-3">
          <Card.Body>
            <Row className="g-3">
              <Col xs={12} md={3}>
                <Form.Control
                  type="text"
                  placeholder={t('Search by name, ID or username')}
                  value={store.searchTerm}
                  onChange={(e) => store.setSearchTerm(e.target.value)}
                />
              </Col>

              <Col xs={12} md={3}>
                <Form.Control
                  type="date"
                  value={store.birthdateFilter}
                  onChange={(e) => store.setBirthdateFilter(e.target.value)}
                  aria-label={t('Filter by Birth Date')}
                />
              </Col>

              <Col xs={12} md={3}>
                <Form.Select value={store.sexFilter} onChange={(e) => store.setSexFilter(e.target.value)}>
                  <option value="">{t('Filter by Sex')}</option>
                  {(config as any).patientInfo.sex.map((sex: string) => (
                    <option key={sex} value={sex}>
                      {t(sex)}
                    </option>
                  ))}
                </Form.Select>
              </Col>

              <Col xs={12} md={3}>
                <Form.Select value={store.durationFilter} onChange={(e) => store.setDurationFilter(e.target.value)}>
                  <option value="">{t('Filter by Duration')}</option>
                  {durationOptions.map((duration: string) => (
                    <option key={duration} value={duration}>
                      {t(duration)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            <Row className="mt-3 align-items-center">
              <Col xs={12} md={3}>
                <Form.Select value={store.diseaseFilter} onChange={(e) => store.setDiseaseFilter(e.target.value)}>
                  <option value="">{t('Filter by Disease')}</option>
                  {store.diseaseOptions.map((d) => (
                    <option key={d} value={d}>
                      {t(d)}
                    </option>
                  ))}
                </Form.Select>
              </Col>

              <Col xs={12} md={6}>
                <Form.Label className="me-2">{t('Sort by')}</Form.Label>
                <Form.Select
                  aria-label="Sort by"
                  value={store.sortBy}
                  onChange={(e) => store.setSortBy(e.target.value as SortKey)}
                  style={{ maxWidth: 320, display: 'inline-block' }}
                >
                  <option value="ampel">{t('Performance')}</option>
                  <option value="created">{t('Newest created')}</option>
                  <option value="last_login">{t('Last login (recent first)')}</option>
                  <option value="adherence">{t('Adherence (high → low)')}</option>
                  <option value="health">{t('Health (best → worst)')}</option>
                  <option value="feedback">{t('Feedback (worst → best)')}</option>
                </Form.Select>
              </Col>

              <Col className="d-flex flex-wrap gap-3 justify-content-end">
                <Button variant="outline-secondary" onClick={store.resetFilters}>
                  {t('Reset filters')}
                </Button>
              </Col>

              <Col className="d-flex flex-wrap gap-3 justify-content-end">
                <Form.Check
                  type="switch"
                  id="toggle-completed"
                  label={t('Show completed')}
                  checked={store.showCompleted}
                  onChange={(e) => store.setShowCompleted(e.currentTarget.checked)}
                />
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <h5 className="mb-2">
          {t('Active patients')} ({activePatients.length})
        </h5>

        <Table responsive hover className="align-middle">
          <thead>
            <tr>
              <th>{t('Patient ID')}</th>
              <th>{t('Full Name')}</th>
              <th>{t('Birth Date')}</th>
              <th>{t('Sex')}</th>
              <th>{t('Diagnosis_patient_list')}</th>
              <th>{t('Status')}</th>
              <th className="text-end">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {activePatients.map((p) => {
              const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
              const diagnosis = Array.isArray(p.diagnosis) ? p.diagnosis.join(', ') : String(p.diagnosis || '');
              const patientId =
                (p as any).patient_code || (p as any).username || (String((p as any)._id || '').slice(-8) || '—');

              return (
                <tr key={(p as any)._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{patientId}</td>
                  <td>{fullName}</td>
                  <td>{fmtDate(String((p as any).age))}</td>
                  <td>{t(p.sex)}</td>
                  <td style={{ minWidth: 200 }}>{diagnosis}</td>
                  <td style={{ minWidth: 220 }}>{renderStatusChips(p)}</td>
                  <td className="text-end">
                    <div className="d-flex justify-content-end gap-2 flex-wrap">
                      <Button size="sm" variant="success" onClick={() => store.openPatient(p)}>
                        {t('Info')}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleRehabButton((p as any)._id as any, fullName)}
                      >
                        {t('Rehabilitation Plan')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => handleProgressButton((p as any)._id as any, fullName)}
                      >
                        {t('Outcomes Dashboard')}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {activePatients.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  {store.loading ? t('Loading patients...') : t('No active patients')}
                </td>
              </tr>
            )}
          </tbody>
        </Table>

        <Collapse in={store.showCompleted}>
          <div>
            <h5 className="mt-4 mb-2">
              {t('Completed')} ({completedPatients.length})
            </h5>

            <Table responsive hover className="align-middle">
              <thead>
                <tr>
                  <th>{t('Patient ID')}</th>
                  <th>{t('Full Name')}</th>
                  <th>{t('Birth Date')}</th>
                  <th>{t('Sex')}</th>
                  <th>{t('Diagnosis')}</th>
                  <th>{t('Status')}</th>
                  <th className="text-end">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {completedPatients.map((p) => {
                  const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
                  const diagnosis = Array.isArray(p.diagnosis) ? p.diagnosis.join(', ') : String(p.diagnosis || '');
                  const endDate = (p as any).rehab_end_date;
                  const patientId =
                    (p as any).patient_code || (p as any).username || (String((p as any)._id || '').slice(-8) || '—');

                  return (
                    <tr key={(p as any)._id} className="completed-row">
                      <td style={{ whiteSpace: 'nowrap' }}>{patientId}</td>
                      <td>
                        {fullName}{' '}
                        <Badge bg="success" className="ms-2">
                          {t('Completed')}
                        </Badge>
                        {endDate && (
                          <small className="text-muted ms-2">
                            {t('Discharged')}: {fmtDate(endDate as any)}
                          </small>
                        )}
                      </td>
                      <td>{fmtDate(String((p as any).age))}</td>
                      <td>{t(p.sex)}</td>
                      <td style={{ minWidth: 200 }}>{diagnosis}</td>
                      <td style={{ minWidth: 220 }}>{renderStatusChips(p)}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-2 flex-wrap">
                          <Button size="sm" variant="outline-secondary" onClick={() => store.openPatient(p)}>
                            {t('Info')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => handleProgressButton((p as any)._id as any, fullName)}
                          >
                            {t('Outcomes Dashboard')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {completedPatients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      {t('No completed patients')}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Collapse>
      </Container>

      {store.selectedPatient && (
        <PatientPopup patient_id={store.selectedPatient} show={store.showPatientPopup} handleClose={store.closePatient} />
      )}

      <AddPatientPopup show={store.showAddPatientPopup} handleClose={handleCloseAdd} />

      <Footer />

      <style>{`
        .status-stack { display: flex; flex-direction: column; gap: 6px; }
        .status-chip {
          display: inline-block;
          padding: .25rem .5rem;
          border-radius: .5rem;
          font-size: .8rem;
          font-weight: 600;
          line-height: 1;
          width: fit-content;
        }
        .completed-row { opacity: .85; }
        .completed-row td:first-child { color: #555; }
      `}</style>
    </div>
  );
});

export default Therapist;
