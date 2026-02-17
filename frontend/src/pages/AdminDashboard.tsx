import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { Table, Button, Spinner, Modal, Form, Badge, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ErrorAlert from '../components/common/ErrorAlert';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import ConfirmModal from '../components/common/ConfirmModal';

import adminStore from '../stores/adminStore';
import authStore from '../stores/authStore';
import { AdminDashboardStore } from '../stores/adminDashboardStore';
import apiClient from '../api/client';

type AccessModalState = {
  open: boolean;
  therapistId: string;
  therapistName: string;
};

const AdminDashboard: React.FC = observer(() => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const store = useMemo(() => new AdminDashboardStore(), []);

  // -------------------------
  // Access modal (clinics + projects)
  // -------------------------
  const [accessModal, setAccessModal] = useState<AccessModalState>({
    open: false,
    therapistId: '',
    therapistName: '',
  });

  const [availableClinics, setAvailableClinics] = useState<string[]>([]);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [clinicProjectsMap, setClinicProjectsMap] = useState<Record<string, string[]>>({});

  const [selectedClinics, setSelectedClinics] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSuccess, setAccessSuccess] = useState<string | null>(null);

  useEffect(() => {
    store.init(navigate, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, navigate, t]);

  const getTherapistIdFromEntry = (entry: any) => {
    return entry.therapistId || entry.therapist_id || entry.therapist || '';
  };

  const renderBadges = (items: string[], variant: string) => {
    if (!items?.length) return <span className="text-muted">—</span>;
    return (
      <div className="d-flex flex-wrap gap-1">
        {items.map((x) => (
          <Badge key={x} bg={variant as any}>
            {x}
          </Badge>
        ))}
      </div>
    );
  };

  // -----------------------------------------
  // Clinics allowed based on selected projects
  // -----------------------------------------
  const allowedClinicsForSelectedProjects = useMemo(() => {
    // if no project selected -> show none (per your request)
    if (!selectedProjects.length) return [];

    const selectedSet = new Set(selectedProjects);
    // A clinic is allowed if any of its projects intersect selectedProjects
    const allowed = availableClinics.filter((clinic) => {
      const projectsForClinic = clinicProjectsMap[clinic] || [];
      return projectsForClinic.some((p) => selectedSet.has(p));
    });

    return allowed;
  }, [availableClinics, clinicProjectsMap, selectedProjects]);

  // Prune clinics when projects change
  useEffect(() => {
    const allowedSet = new Set(allowedClinicsForSelectedProjects);
    const next = selectedClinics.filter((c) => allowedSet.has(c));
    if (next.length !== selectedClinics.length) setSelectedClinics(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedClinicsForSelectedProjects]);

  const openAccessModal = useCallback(
    async (entry: any) => {
      setAccessError(null);
      setAccessSuccess(null);

      const therapistId = getTherapistIdFromEntry(entry);
      if (!therapistId) {
        setAccessError(
          'Missing therapistId in pending users payload. Please update /admin/pending-users to include therapistId for therapist rows.'
        );
        return;
      }

      setAccessModal({
        open: true,
        therapistId,
        therapistName: entry?.name || entry?.username || t('Therapist'),
      });

      setAccessLoading(true);
      try {
        // ✅ new endpoint returning clinics+projects + config maps
        // NOTE: keep your final endpoint path consistent with apiClient baseURL
        const res = await apiClient.get('/admin/therapist/access/', { params: { therapistId } });

        const clinics = Array.isArray(res.data?.clinics) ? res.data.clinics : [];
        const projects = Array.isArray(res.data?.projects) ? res.data.projects : [];

        const availClinics = Array.isArray(res.data?.availableClinics)
          ? res.data.availableClinics
          : [];
        const availProjects = Array.isArray(res.data?.availableProjects)
          ? res.data.availableProjects
          : [];
        const cpm = res.data?.clinicProjects || {};

        setSelectedProjects(projects);
        setSelectedClinics(clinics);

        setAvailableClinics(availClinics);
        setAvailableProjects(availProjects);
        setClinicProjectsMap(typeof cpm === 'object' && cpm ? cpm : {});
      } catch (e: any) {
        const msg =
          e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to load access.';
        setAccessError(String(msg));
      } finally {
        setAccessLoading(false);
      }
    },
    [t]
  );

  const closeAccessModal = () => {
    setAccessModal({ open: false, therapistId: '', therapistName: '' });
    setAvailableClinics([]);
    setAvailableProjects([]);
    setClinicProjectsMap({});
    setSelectedClinics([]);
    setSelectedProjects([]);
    setAccessError(null);
    setAccessSuccess(null);
    setAccessLoading(false);
  };

  const toggleClinic = (c: string) => {
    setSelectedClinics((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const toggleProject = (p: string) => {
    setSelectedProjects((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const saveAccess = async () => {
    setAccessError(null);
    setAccessSuccess(null);
    setAccessLoading(true);

    try {
      await apiClient.put('/admin/therapist/access/', {
        therapistId: accessModal.therapistId,
        clinics: selectedClinics,
        projects: selectedProjects,
      });

      setAccessSuccess(t('Saved successfully.'));
      await adminStore.fetchPendingEntries();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        'Failed to save access.';
      setAccessError(String(msg));
    } finally {
      setAccessLoading(false);
    }
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <main className="container my-5 flex-grow-1">
        <h1 className="text-center">{t('Admin Dashboard')}</h1>
        <h3 className="text-center mb-4">{t('Pending Therapists, Researchers, and Content')}</h3>

        {store.error && <ErrorAlert message={store.error} onClose={() => store.setError(null)} />}

        {store.loading ? (
          <div className="text-center my-5">
            <Spinner animation="border" role="status" />
            <div>{t('Loading')}...</div>
          </div>
        ) : adminStore.pendingEntries.length === 0 ? (
          <p className="text-center text-muted">{t('No pending entries')}</p>
        ) : (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Email')}</th>
                <th>{t('Type')}</th>
                <th style={{ minWidth: 220 }}>{t('Clinics')}</th>
                <th style={{ minWidth: 220 }}>{t('Projects')}</th>
                <th style={{ minWidth: 260 }}>{t('Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {adminStore.pendingEntries.map((entry: any) => {
                const role = String(entry.role || '').toLowerCase();
                const isTherapist = role === 'therapist';

                const clinics: string[] = Array.isArray(entry?.clinics) ? entry.clinics : [];
                const projects: string[] = Array.isArray(entry?.projects) ? entry.projects : [];

                return (
                  <tr key={entry.id}>
                    <td>{entry.name || '—'}</td>
                    <td>{entry.email || '—'}</td>
                    <td>{t(entry.role)}</td>

                    <td>
                      {isTherapist ? (
                        renderBadges(clinics, 'info')
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {isTherapist ? (
                        renderBadges(projects, 'secondary')
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    <td className="d-flex gap-2 flex-wrap">
                      {isTherapist && (
                        <Button variant="outline-primary" onClick={() => openAccessModal(entry)}>
                          {t('Edit access')}
                        </Button>
                      )}
                      <Button variant="success" onClick={() => store.accept(entry.id, t)}>
                        {t('Accept')}
                      </Button>
                      <Button variant="danger" onClick={() => store.openDeclineConfirm(entry.id)}>
                        {t('Decline')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </main>

      {/* Decline confirm */}
      <ConfirmModal
        show={store.showDeclineConfirm}
        onHide={store.closeDeclineConfirm}
        title={t('ConfirmDeletion')}
        body={<p className="mb-0">{t('Are you sure you want to decline this therapist?')}</p>}
        cancelText={t('Cancel')}
        confirmText={t('Decline')}
        confirmVariant="danger"
        onConfirm={() => store.declineConfirmed(t)}
      />

      {/* Access Modal */}
      <Modal
        show={accessModal.open}
        onHide={closeAccessModal}
        centered
        size="lg"
        backdrop={accessLoading ? 'static' : true}
        keyboard={!accessLoading}
      >
        <Modal.Header closeButton={!accessLoading}>
          <Modal.Title>
            {t('Therapist access')} — {accessModal.therapistName}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {accessSuccess && (
            <Alert variant="success" dismissible onClose={() => setAccessSuccess(null)}>
              {accessSuccess}
            </Alert>
          )}

          {accessError && (
            <Alert variant="danger" dismissible onClose={() => setAccessError(null)}>
              {accessError}
            </Alert>
          )}

          {accessLoading ? (
            <div className="d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" />
              <div>{t('Loading')}...</div>
            </div>
          ) : (
            <>
              <p className="text-muted mb-2">{t('Projects')}</p>
              {availableProjects.length === 0 ? (
                <Alert variant="warning">{t('No projects configured on the server.')}</Alert>
              ) : (
                <Form className="mb-3">
                  <div className="d-flex flex-wrap gap-3">
                    {availableProjects.map((p) => (
                      <Form.Check
                        key={p}
                        type="checkbox"
                        id={`proj_${p}`}
                        label={p}
                        checked={selectedProjects.includes(p)}
                        onChange={() => toggleProject(p)}
                      />
                    ))}
                  </div>

                  <div className="mt-2">
                    <small className="text-muted">
                      {t('Selected')}: {selectedProjects.length ? selectedProjects.join(', ') : '—'}
                    </small>
                  </div>
                </Form>
              )}

              <p className="text-muted mb-2">{t('Clinics')}</p>
              {!selectedProjects.length ? (
                <Alert variant="info" className="mb-0">
                  {t('Select a project to see available clinics.')}
                </Alert>
              ) : allowedClinicsForSelectedProjects.length === 0 ? (
                <Alert variant="warning" className="mb-0">
                  {t('No clinics are configured for the selected project(s).')}
                </Alert>
              ) : (
                <Form>
                  <div className="d-flex flex-wrap gap-3">
                    {allowedClinicsForSelectedProjects.map((c) => (
                      <Form.Check
                        key={c}
                        type="checkbox"
                        id={`clinic_${c}`}
                        label={c}
                        checked={selectedClinics.includes(c)}
                        onChange={() => toggleClinic(c)}
                      />
                    ))}
                  </div>
                </Form>
              )}

              {selectedProjects.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {t('Clinics are filtered by selected projects.')}
                  </small>
                </div>
              )}
            </>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeAccessModal} disabled={accessLoading}>
            {t('Close')}
          </Button>
          <Button
            variant="primary"
            onClick={saveAccess}
            disabled={accessLoading || selectedProjects.length === 0}
            title={selectedProjects.length === 0 ? t('Select at least one project') : undefined}
          >
            {accessLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {t('Saving')}...
              </>
            ) : (
              t('Save')
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Footer />
    </div>
  );
});

export default AdminDashboard;
