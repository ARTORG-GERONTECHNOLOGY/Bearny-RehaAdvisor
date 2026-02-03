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

type ProjectsModalState = {
  open: boolean;
  therapistId: string;
  therapistName: string;
};

const AdminDashboard: React.FC = observer(() => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const store = useMemo(() => new AdminDashboardStore(), []);

  // -------------------------
  // Projects modal local state
  // -------------------------
  const [projectsModal, setProjectsModal] = useState<ProjectsModalState>({
    open: false,
    therapistId: '',
    therapistName: '',
  });

  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsSuccess, setProjectsSuccess] = useState<string | null>(null);

  useEffect(() => {
    store.init(navigate, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, navigate, t]);

  const getTherapistIdFromEntry = (entry: any) => {
    return entry.therapistId || entry.therapist_id || entry.therapist || '';
  };

  const openProjectsModal = useCallback(
    async (entry: any) => {
      setProjectsError(null);
      setProjectsSuccess(null);

      const therapistId = getTherapistIdFromEntry(entry);
      if (!therapistId) {
        setProjectsError(
          'Missing therapistId in pending users payload. Please update /admin/pending-users to include therapistId for therapist rows.'
        );
        return;
      }

      setProjectsModal({
        open: true,
        therapistId,
        therapistName: entry?.name || entry?.username || t('Therapist'),
      });

      setProjectsLoading(true);
      try {
        // IMPORTANT: matches your adminStore pattern (no "/api" prefix)
        // Assumes apiClient has baseURL="/api"
        const res = await apiClient.get('/therapist/projects/', {
          params: { therapistId },
        });

        const projects = Array.isArray(res.data?.projects) ? res.data.projects : [];
        const available = Array.isArray(res.data?.availableProjects) ? res.data.availableProjects : [];

        setSelectedProjects(projects);
        setAvailableProjects(available);
      } catch (e: any) {
        const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Failed to load projects.';
        setProjectsError(String(msg));
      } finally {
        setProjectsLoading(false);
      }
    },
    [t]
  );

  const closeProjectsModal = () => {
    setProjectsModal({ open: false, therapistId: '', therapistName: '' });
    setAvailableProjects([]);
    setSelectedProjects([]);
    setProjectsError(null);
    setProjectsSuccess(null);
    setProjectsLoading(false);
  };

  const toggleProject = (p: string) => {
    setSelectedProjects((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const saveProjects = async () => {
    setProjectsError(null);
    setProjectsSuccess(null);
    setProjectsLoading(true);

    try {
      await apiClient.put('/therapist/projects/', {
        therapistId: projectsModal.therapistId,
        projects: selectedProjects,
      });

      setProjectsSuccess(t('Saved successfully.'));

      // Optional: refresh pending list so the badges update (if backend returns projects in pending list)
      await adminStore.fetchPendingEntries();
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Failed to save projects.';
      setProjectsError(String(msg));
    } finally {
      setProjectsLoading(false);
    }
  };

  const renderProjectsBadges = (entry: any) => {
    // Support both "projects" (recommended) and old "project"
    const projs: string[] = Array.isArray(entry?.projects)
      ? entry.projects
      : Array.isArray(entry?.project)
      ? entry.project
      : entry?.project
      ? [String(entry.project)]
      : [];

    if (!projs.length) return <span className="text-muted">—</span>;

    return (
      <div className="d-flex flex-wrap gap-1">
        {projs.map((p) => (
          <Badge key={p} bg="secondary">
            {p}
          </Badge>
        ))}
      </div>
    );
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
                <th style={{ minWidth: 160 }}>{t('Projects')}</th>
                <th style={{ minWidth: 240 }}>{t('Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {adminStore.pendingEntries.map((entry: any) => {
                const role = String(entry.role || '').toLowerCase();
                const isTherapist = role === 'therapist';

                return (
                  <tr key={entry.id}>
                    <td>{entry.name || '—'}</td>
                    <td>{entry.email || '—'}</td>
                    <td>{t(entry.role)}</td>

                    <td>
                      {isTherapist ? (
                        <>
                          {renderProjectsBadges(entry)}
                          <div className="mt-2">
                            <Button variant="outline-primary" size="sm" onClick={() => openProjectsModal(entry)}>
                              {t('Projects')}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    <td className="d-flex gap-2 flex-wrap">
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

      {/* Projects Modal */}
      <Modal
        show={projectsModal.open}
        onHide={closeProjectsModal}
        centered
        size="lg"
        backdrop={projectsLoading ? 'static' : true}
        keyboard={!projectsLoading}
      >
        <Modal.Header closeButton={!projectsLoading}>
          <Modal.Title>
            {t('Therapist Projects')} — {projectsModal.therapistName}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {projectsSuccess && (
            <Alert variant="success" dismissible onClose={() => setProjectsSuccess(null)}>
              {projectsSuccess}
            </Alert>
          )}

          {projectsError && (
            <Alert variant="danger" dismissible onClose={() => setProjectsError(null)}>
              {projectsError}
            </Alert>
          )}

          {projectsLoading ? (
            <div className="d-flex align-items-center gap-2">
              <Spinner animation="border" size="sm" />
              <div>{t('Loading')}...</div>
            </div>
          ) : availableProjects.length === 0 ? (
            <Alert variant="warning" className="mb-0">
              {t('No projects configured on the server.')}
            </Alert>
          ) : (
            <>
              <p className="text-muted mb-2">{t('Select which REDCap project(s) this therapist can access.')}</p>

              <Form>
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

                <div className="mt-3">
                  <small className="text-muted">
                    {t('Selected')}: {selectedProjects.length ? selectedProjects.join(', ') : '—'}
                  </small>
                </div>
              </Form>
            </>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeProjectsModal} disabled={projectsLoading}>
            {t('Close')}
          </Button>
          <Button variant="primary" onClick={saveProjects} disabled={projectsLoading}>
            {projectsLoading ? (
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
