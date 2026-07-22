import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { Badge } from 'react-bootstrap';
import { Alert } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ErrorAlert from '@/components/common/ErrorAlert';
import ConfirmModal from '@/components/common/ConfirmModal';
import RejectAccessRequestDialog from '@/components/AdminDashboard/RejectAccessRequestDialog';
import TherapistAccessDialog from '@/components/AdminDashboard/TherapistAccessDialog';
import EditQuestionnaireDialog from '@/components/AdminDashboard/EditQuestionnaireDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import adminStore from '@/stores/adminStore';
import authStore from '@/stores/authStore';
import { AdminDashboardStore } from '@/stores/adminDashboardStore';
import { useRoleAuthGate } from '@/hooks/useRoleAuthGate';
import apiClient from '@/api/client';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import LogoutFill from '@/assets/icons/logout-fill.svg?react';
import { toLocalYMD, formatLocaleDate, formatLocaleDateTime } from '@/utils/dateFormat';
import { getApiErrorMessage } from '@/utils/apiErrorMessages';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type AccessModalState = {
  open: boolean;
  therapistId: string;
  therapistName: string;
};

const AdminDashboard: React.FC = observer(() => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAllowed } = useRoleAuthGate('Admin', '/unauthorized');

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

  // -------------------------
  // Interventions tab
  // -------------------------
  type AdminIntervention = {
    _id: string;
    external_id: string;
    language: string;
    title: string;
    content_type: string;
    is_private: boolean;
  };

  const [interventions, setInterventions] = useState<AdminIntervention[]>([]);
  const [interventionSearch, setInterventionSearch] = useState('');
  const [interventionLoading, setInterventionLoading] = useState(false);
  const [interventionError, setInterventionError] = useState<string | null>(null);

  // -------------------------
  // Analytics tab
  // -------------------------
  type DeviceAnalytics = {
    by_device: Record<string, number>;
    by_role: Record<string, Record<string, number>>;
  };
  const [deviceAnalytics, setDeviceAnalytics] = useState<DeviceAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await apiClient.get('/admin/analytics/devices/');
      setDeviceAnalytics(res.data);
    } catch {
      /* silently ignore */
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    id: string;
    title: string;
  }>({ open: false, id: '', title: '' });
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const fetchInterventions = useCallback(async () => {
    setInterventionLoading(true);
    setInterventionError(null);
    try {
      const res = await apiClient.get('/admin/interventions/');
      setInterventions(Array.isArray(res.data?.interventions) ? res.data.interventions : []);
    } catch (e: any) {
      setInterventionError(getApiErrorMessage(e, 'Failed to load interventions.'));
    } finally {
      setInterventionLoading(false);
    }
  }, []);

  const confirmDelete = async () => {
    if (!deleteModal.id) return;
    setDeleteInProgress(true);
    try {
      await apiClient.delete(`/admin/interventions/${deleteModal.id}/`);
      setDeleteModal({ open: false, id: '', title: '' });
      await fetchInterventions();
    } catch (e: any) {
      setInterventionError(getApiErrorMessage(e, 'Failed to delete intervention.'));
      setDeleteModal({ open: false, id: '', title: '' });
    } finally {
      setDeleteInProgress(false);
    }
  };

  const filteredInterventions = useMemo(() => {
    const q = interventionSearch.trim().toLowerCase();
    if (!q) return interventions;
    return interventions.filter(
      (iv) => iv.external_id.toLowerCase().includes(q) || iv.title.toLowerCase().includes(q)
    );
  }, [interventions, interventionSearch]);

  // -------------------------
  // Questionnaires tab
  // -------------------------
  type AdminQuestionnaire = {
    _id: string;
    key: string;
    title: string;
    description: string;
    tags: string[];
    question_count: number;
    usage_count: number;
    created_by_name: string | null;
    version: number;
    updatedAt: string | null;
  };

  const [questionnaires, setQuestionnaires] = useState<AdminQuestionnaire[]>([]);
  const [questionnaireSearch, setQuestionnaireSearch] = useState('');
  const [questionnaireLoading, setQuestionnaireLoading] = useState(false);
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(null);
  const [qDeleteModal, setQDeleteModal] = useState<{
    open: boolean;
    id: string;
    title: string;
    usageCount: number;
  }>({ open: false, id: '', title: '', usageCount: 0 });
  const [qDeleteInProgress, setQDeleteInProgress] = useState(false);
  const [qEditModal, setQEditModal] = useState<{
    open: boolean;
    id: string;
    title: string;
    description: string;
    tags: string;
  }>({ open: false, id: '', title: '', description: '', tags: '' });
  const [qEditSaving, setQEditSaving] = useState(false);
  const [qEditError, setQEditError] = useState<string | null>(null);

  const fetchQuestionnaires = useCallback(async () => {
    setQuestionnaireLoading(true);
    setQuestionnaireError(null);
    try {
      const res = await apiClient.get('/admin/questionnaires/');
      setQuestionnaires(Array.isArray(res.data?.questionnaires) ? res.data.questionnaires : []);
    } catch (e: any) {
      setQuestionnaireError(getApiErrorMessage(e, 'Failed to load questionnaires.'));
    } finally {
      setQuestionnaireLoading(false);
    }
  }, []);

  const confirmDeleteQuestionnaire = async () => {
    if (!qDeleteModal.id) return;
    setQDeleteInProgress(true);
    try {
      await apiClient.delete(`/admin/questionnaires/${qDeleteModal.id}/`);
      setQDeleteModal({ open: false, id: '', title: '', usageCount: 0 });
      await fetchQuestionnaires();
    } catch (e: any) {
      setQuestionnaireError(getApiErrorMessage(e, 'Failed to delete questionnaire.'));
      setQDeleteModal({ open: false, id: '', title: '', usageCount: 0 });
    } finally {
      setQDeleteInProgress(false);
    }
  };

  const openQEditModal = (q: AdminQuestionnaire) => {
    setQEditError(null);
    setQEditModal({
      open: true,
      id: q._id,
      title: q.title,
      description: q.description || '',
      tags: (q.tags || []).join(', '),
    });
  };

  const saveQEdit = async () => {
    setQEditSaving(true);
    setQEditError(null);
    try {
      const tags = qEditModal.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await apiClient.put(`/admin/questionnaires/${qEditModal.id}/`, {
        title: qEditModal.title,
        description: qEditModal.description,
        tags,
      });
      setQEditModal({ open: false, id: '', title: '', description: '', tags: '' });
      await fetchQuestionnaires();
    } catch (e: any) {
      setQEditError(getApiErrorMessage(e, 'Failed to save.'));
    } finally {
      setQEditSaving(false);
    }
  };

  const filteredQuestionnaires = useMemo(() => {
    const q = questionnaireSearch.trim().toLowerCase();
    if (!q) return questionnaires;
    return questionnaires.filter(
      (qn) =>
        qn.title.toLowerCase().includes(q) ||
        qn.key.toLowerCase().includes(q) ||
        (qn.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  }, [questionnaires, questionnaireSearch]);

  // -------------------------
  // Access change requests tab
  // -------------------------
  type AccessChangeRequest = {
    id: string;
    therapistId: string;
    therapistName: string;
    therapistEmail: string;
    currentClinics: string[];
    currentProjects: string[];
    requestedClinics: string[];
    requestedProjects: string[];
    status: string;
    createdAt: string;
    note: string;
  };

  const [changeRequests, setChangeRequests] = useState<AccessChangeRequest[]>([]);
  const [changeReqLoading, setChangeReqLoading] = useState(false);
  const [changeReqError, setChangeReqError] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; requestId: string }>({
    open: false,
    requestId: '',
  });
  const [rejectNote, setRejectNote] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const fetchChangeRequests = useCallback(async () => {
    setChangeReqLoading(true);
    setChangeReqError(null);
    try {
      const res = await apiClient.get('/admin/access-change-requests/');
      setChangeRequests(Array.isArray(res.data?.requests) ? res.data.requests : []);
    } catch (e: any) {
      setChangeReqError(getApiErrorMessage(e, 'Failed to load requests.'));
    } finally {
      setChangeReqLoading(false);
    }
  }, []);

  const approveRequest = async (requestId: string) => {
    try {
      await apiClient.put(`/admin/access-change-requests/${requestId}/`, { action: 'approve' });
      await fetchChangeRequests();
    } catch (e: any) {
      setChangeReqError(getApiErrorMessage(e, 'Failed to approve.'));
    }
  };

  const openRejectModal = (requestId: string) => {
    setRejectNote('');
    setRejectModal({ open: true, requestId });
  };

  const submitReject = async () => {
    setRejectSubmitting(true);
    try {
      await apiClient.put(`/admin/access-change-requests/${rejectModal.requestId}/`, {
        action: 'reject',
        note: rejectNote,
      });
      setRejectModal({ open: false, requestId: '' });
      await fetchChangeRequests();
    } catch (e: any) {
      setChangeReqError(getApiErrorMessage(e, 'Failed to reject.'));
    } finally {
      setRejectSubmitting(false);
    }
  };

  // -------------------------
  // Export tab
  // -------------------------
  const [exportClinics, setExportClinics] = useState<string[]>([]);
  const [exportClinicsLoading, setExportClinicsLoading] = useState(false);
  const [exportClinicsError, setExportClinicsError] = useState<string | null>(null);
  const [selectedExportClinics, setSelectedExportClinics] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchExportClinics = useCallback(async () => {
    setExportClinicsLoading(true);
    setExportClinicsError(null);
    try {
      const res = await apiClient.get('/admin/export/clinics/');
      const clinics = Array.isArray(res.data?.clinics) ? res.data.clinics : [];
      setExportClinics(clinics);
      setSelectedExportClinics(clinics);
    } catch (e: any) {
      setExportClinicsError(getApiErrorMessage(e, 'Failed to load clinics.'));
    } finally {
      setExportClinicsLoading(false);
    }
  }, []);

  const toggleExportClinic = (clinic: string) => {
    setSelectedExportClinics((prev) =>
      prev.includes(clinic) ? prev.filter((c) => c !== clinic) : [...prev, clinic]
    );
  };

  const selectAllExportClinics = () => setSelectedExportClinics([...exportClinics]);
  const deselectAllExportClinics = () => setSelectedExportClinics([]);

  const downloadExport = async (clinicFilter: 'all' | 'selected') => {
    setExporting(true);
    setExportError(null);
    try {
      const params =
        clinicFilter === 'all'
          ? 'clinics=all'
          : `clinics=${encodeURIComponent(selectedExportClinics.join(','))}`;

      const res = await apiClient.get(`/admin/export/patients/?${params}`, {
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const a = document.createElement('a');
      const today = toLocalYMD(new Date());
      a.href = url;
      a.download = `export_${today}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError(getApiErrorMessage(e, 'Export failed.'));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;

    store.init(t);
    fetchChangeRequests();
    fetchInterventions();
    fetchQuestionnaires();
    fetchExportClinics();
  }, [isAllowed, store, t]);

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
        setAccessError(getApiErrorMessage(e, 'Failed to load access.'));
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
      setAccessError(getApiErrorMessage(e, 'Failed to save access.'));
    } finally {
      setAccessLoading(false);
    }
  };

  const handleLogout = async () => {
    await authStore.logout();
    navigate('/');
  };

  return (
    <Layout>
      <div className="flex flex-wrap justify-between items-center mb-4">
        <PageHeader title={t('Admin Dashboard')} />
        <Button size="dashboard" variant="secondary" onClick={handleLogout}>
          {t('Logout')}
          <LogoutFill />
        </Button>
      </div>

      {store.error && <ErrorAlert message={store.error} onClose={() => store.setError(null)} />}

      <Tabs defaultValue="pending">
        <TabsList className="mb-3">
          <TabsTrigger value="pending">
            {t('Pending registrations')}
            {adminStore.pendingEntries.length > 0 && (
              <Badge bg="danger">{adminStore.pendingEntries.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="access-requests">
            {t('Access change requests')}
            {changeRequests.length > 0 && (
              <Badge bg="warning" text="dark">
                {changeRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interventions">{t('Interventions')}</TabsTrigger>
          <TabsTrigger value="questionnaires">{t('Questionnaires')}</TabsTrigger>
          <TabsTrigger value="export">{t('Export')}</TabsTrigger>
          <TabsTrigger value="analytics" onClick={fetchAnalytics}>
            {t('Analytics')}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: pending registrations ── */}
        <TabsContent value="pending">
          {store.loading ? (
            <div className="text-center my-5">
              <Spinner />
              <div>{t('Loading')}...</div>
            </div>
          ) : adminStore.pendingEntries.length === 0 ? (
            <p className="text-center text-muted">{t('No pending entries')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Email')}</TableHead>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead>{t('Clinics')}</TableHead>
                  <TableHead>{t('Projects')}</TableHead>
                  <TableHead>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminStore.pendingEntries.map((entry: any) => {
                  const role = String(entry.role || '').toLowerCase();
                  const isTherapist = role === 'therapist';
                  const clinics: string[] = Array.isArray(entry?.clinics) ? entry.clinics : [];
                  const projects: string[] = Array.isArray(entry?.projects) ? entry.projects : [];
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.name || '—'}</TableCell>
                      <TableCell>{entry.email || '—'}</TableCell>
                      <TableCell>{t(entry.role)}</TableCell>
                      <TableCell>
                        {isTherapist ? (
                          renderBadges(clinics, 'info')
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isTherapist ? (
                          renderBadges(projects, 'secondary')
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell className="d-flex gap-2 flex-wrap">
                        {isTherapist && (
                          <Button
                            size="dashboard"
                            variant="secondary"
                            onClick={() => openAccessModal(entry)}
                          >
                            {t('Edit access')}
                          </Button>
                        )}
                        <Button size="dashboard" onClick={() => store.accept(entry.id, t)}>
                          {t('Accept')}
                        </Button>
                        <Button
                          size="dashboard"
                          className="bg-nok hover:bg-nok/90"
                          onClick={() => store.openDeclineConfirm(entry.id)}
                        >
                          {t('Decline')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Tab 2: access change requests ── */}
        <TabsContent value="access-requests">
          {changeReqError && (
            <Alert
              variant="destructive"
              onClose={() => setChangeReqError(null)}
              closeLabel="Close alert"
            >
              {changeReqError}
            </Alert>
          )}

          {changeReqLoading ? (
            <div className="text-center my-5">
              <Spinner />
              <div>{t('Loading')}...</div>
            </div>
          ) : changeRequests.length === 0 ? (
            <p className="text-center text-muted">{t('No pending access change requests')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Therapist')}</TableHead>
                  <TableHead>{t('Email')}</TableHead>
                  <TableHead>{t('Current clinics')}</TableHead>
                  <TableHead>{t('Current projects')}</TableHead>
                  <TableHead>{t('Requested clinics')}</TableHead>
                  <TableHead>{t('Requested projects')}</TableHead>
                  <TableHead>{t('Submitted')}</TableHead>
                  <TableHead style={{ minWidth: 200 }}>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changeRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>{req.therapistName || '—'}</TableCell>
                    <TableCell>{req.therapistEmail || '—'}</TableCell>
                    <TableCell>{renderBadges(req.currentClinics, 'info')}</TableCell>
                    <TableCell>{renderBadges(req.currentProjects, 'secondary')}</TableCell>
                    <TableCell>{renderBadges(req.requestedClinics, 'primary')}</TableCell>
                    <TableCell>{renderBadges(req.requestedProjects, 'dark')}</TableCell>
                    <TableCell>
                      <small>{req.createdAt ? formatLocaleDate(req.createdAt) : '—'}</small>
                    </TableCell>
                    <TableCell className="d-flex gap-2 flex-wrap">
                      <Button size="dashboard" onClick={() => approveRequest(req.id)}>
                        {t('Approve')}
                      </Button>
                      <Button
                        size="dashboard"
                        className="bg-nok hover:bg-nok/90"
                        onClick={() => openRejectModal(req.id)}
                      >
                        {t('Decline')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Tab 3: interventions ── */}
        <TabsContent value="interventions">
          {interventionError && (
            <Alert
              variant="destructive"
              onClose={() => setInterventionError(null)}
              closeLabel="Close alert"
            >
              {interventionError}
            </Alert>
          )}

          <div className="d-flex gap-2 mb-3">
            <Input
              type="search"
              placeholder={t('Search by title or ID…')}
              value={interventionSearch}
              onChange={(e) => setInterventionSearch(e.target.value)}
              style={{ maxWidth: 320 }}
              className="bg-white"
            />
            <Button
              size="dashboard"
              variant="secondary"
              onClick={fetchInterventions}
              disabled={interventionLoading}
            >
              {interventionLoading ? <Spinner /> : t('Refresh')}
            </Button>
          </div>

          {interventionLoading ? (
            <div className="text-center my-5">
              <Spinner />
              <div>{t('Loading')}...</div>
            </div>
          ) : filteredInterventions.length === 0 ? (
            <p className="text-center text-muted">{t('No interventions found')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ID')}</TableHead>
                  <TableHead>{t('Title')}</TableHead>
                  <TableHead>{t('Language')}</TableHead>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead>{t('Private')}</TableHead>
                  <TableHead style={{ minWidth: 100 }}>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInterventions.map((iv) => (
                  <TableRow key={iv._id}>
                    <TableCell>
                      <code>{iv.external_id}</code>
                    </TableCell>
                    <TableCell>{iv.title}</TableCell>
                    <TableCell>
                      <Badge bg="secondary">{iv.language}</Badge>
                    </TableCell>
                    <TableCell>{iv.content_type}</TableCell>
                    <TableCell>
                      {iv.is_private ? (
                        <Badge bg="warning" text="dark">
                          {t('Private')}
                        </Badge>
                      ) : (
                        <Badge bg="success">{t('Public')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="dashboard"
                        className="bg-nok hover:bg-nok/90"
                        onClick={() => setDeleteModal({ open: true, id: iv._id, title: iv.title })}
                      >
                        {t('Delete')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Tab 4: questionnaires ── */}
        <TabsContent value="questionnaires">
          {questionnaireError && (
            <Alert
              variant="destructive"
              onClose={() => setQuestionnaireError(null)}
              closeLabel="Close alert"
            >
              {questionnaireError}
            </Alert>
          )}

          <div className="d-flex gap-2 mb-3">
            <Input
              type="search"
              placeholder={t('Search by title, key or tag…')}
              value={questionnaireSearch}
              onChange={(e) => setQuestionnaireSearch(e.target.value)}
              style={{ maxWidth: 320 }}
              className="bg-white"
            />
            <Button
              size="dashboard"
              variant="secondary"
              onClick={fetchQuestionnaires}
              disabled={questionnaireLoading}
            >
              {questionnaireLoading ? <Spinner /> : t('Refresh')}
            </Button>
          </div>

          {questionnaireLoading ? (
            <div className="text-center my-5">
              <Spinner />
              <div>{t('Loading')}...</div>
            </div>
          ) : filteredQuestionnaires.length === 0 ? (
            <p className="text-center text-muted">{t('No questionnaires found')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Key')}</TableHead>
                  <TableHead>{t('Title')}</TableHead>
                  <TableHead>{t('Tags')}</TableHead>
                  <TableHead>{t('Questions')}</TableHead>
                  <TableHead>{t('Used in plans')}</TableHead>
                  <TableHead
                    title={t('Increments each time an admin edits title, description or tags')}
                  >
                    {t('Version')}
                  </TableHead>
                  <TableHead>{t('Created by')}</TableHead>
                  <TableHead style={{ minWidth: 140 }}>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuestionnaires.map((qn) => (
                  <TableRow key={qn._id}>
                    <TableCell>
                      <code>{qn.key}</code>
                    </TableCell>
                    <TableCell>{qn.title}</TableCell>
                    <TableCell>
                      {qn.tags?.length ? (
                        <div className="d-flex flex-wrap gap-1">
                          {qn.tags.map((tag) => (
                            <Badge key={tag} bg="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{qn.question_count}</TableCell>
                    <TableCell className="text-center">
                      {qn.usage_count > 0 ? (
                        <Badge bg="warning" text="dark">
                          {qn.usage_count}
                        </Badge>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-center"
                      title={
                        qn.updatedAt
                          ? `${t('Last edited')}: ${formatLocaleDateTime(qn.updatedAt)}`
                          : t('Never edited')
                      }
                    >
                      <Badge bg={qn.version > 1 ? 'info' : 'light'} text="dark">
                        v{qn.version ?? 1}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {qn.created_by_name || <span className="text-muted">—</span>}
                    </TableCell>
                    <TableCell className="d-flex gap-1">
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => openQEditModal(qn)}
                      >
                        {t('Edit')}
                      </Button>
                      <Button
                        size="dashboard"
                        className="bg-nok hover:bg-nok/90"
                        onClick={() =>
                          setQDeleteModal({
                            open: true,
                            id: qn._id,
                            title: qn.title,
                            usageCount: qn.usage_count,
                          })
                        }
                      >
                        {t('Delete')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ── Tab 5: export ── */}
        <TabsContent value="export">
          {exportClinicsError && (
            <Alert
              variant="destructive"
              onClose={() => setExportClinicsError(null)}
              closeLabel="Close alert"
            >
              {exportClinicsError}
            </Alert>
          )}
          {exportError && (
            <Alert
              variant="destructive"
              onClose={() => setExportError(null)}
              closeLabel="Close alert"
            >
              {exportError}
            </Alert>
          )}

          {exportClinicsLoading ? (
            <div className="text-center my-5">
              <Spinner />
              <div>{t('Loading')}...</div>
            </div>
          ) : (
            <>
              <p className="text-muted mb-1">{t('Select clinics to include in the export:')}</p>

              {exportClinics.length === 0 ? (
                <Alert variant="info">{t('No clinics found in the database.')}</Alert>
              ) : (
                <>
                  <div className="flex gap-2 mb-2">
                    <Button
                      size="dashboard"
                      variant="secondary"
                      onClick={selectAllExportClinics}
                      disabled={selectedExportClinics.length === exportClinics.length}
                    >
                      {t('Select all')}
                    </Button>
                    <Button
                      size="dashboard"
                      variant="secondary"
                      onClick={deselectAllExportClinics}
                      disabled={selectedExportClinics.length === 0}
                    >
                      {t('Deselect all')}
                    </Button>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-3">
                    {exportClinics.map((clinic) => {
                      const id = `export_clinic_${clinic}`;
                      return (
                        <div key={clinic} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={selectedExportClinics.includes(clinic)}
                            onCheckedChange={() => toggleExportClinic(clinic)}
                          />
                          <Label htmlFor={id} className="cursor-pointer">
                            {clinic}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <p className="text-muted small mb-2">
                {t('The export is a ZIP archive containing:')}{' '}
                {t(
                  'patients, rehab calendar, intervention logs, feedback, health vitals, Fitbit data, questionnaire answers, thresholds, threshold history, activity logs.'
                )}
              </p>

              <div className="flex gap-2 flex-wrap">
                <Button size="dashboard" onClick={() => downloadExport('all')} disabled={exporting}>
                  {exporting ? (
                    <>
                      <Spinner />
                      {t('Exporting...')}
                    </>
                  ) : (
                    t('Export all patients (ZIP)')
                  )}
                </Button>
                <Button
                  size="dashboard"
                  variant="secondary"
                  onClick={() => downloadExport('selected')}
                  disabled={exporting || selectedExportClinics.length === 0}
                  title={
                    selectedExportClinics.length === 0 ? t('Select at least one clinic') : undefined
                  }
                >
                  {t('Export selected clinics')} ({selectedExportClinics.length})
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Tab 6: analytics ── */}
        <TabsContent value="analytics">
          {analyticsLoading ? (
            <div className="text-center my-5">
              <Spinner />
            </div>
          ) : deviceAnalytics ? (
            <div className="my-4">
              <h5 className="mb-3">{t('Login device types')}</h5>
              <div className="flex flex-wrap gap-4 mb-6">
                {['Mobile', 'Desktop', 'Tablet', 'Unknown'].map((device) => {
                  const count = deviceAnalytics.by_device[device] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div
                      key={device}
                      className="rounded-xl border bg-zinc-50 px-8 py-6 text-center min-w-[120px]"
                    >
                      <div className="text-3xl font-bold">{count}</div>
                      <div className="text-sm text-muted-foreground mt-1">{t(device)}</div>
                    </div>
                  );
                })}
              </div>
              {Object.keys(deviceAnalytics.by_role).length > 0 && (
                <div className="max-w-[480px]">
                  <h6 className="mb-2">{t('By user role')}</h6>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Role')}</TableHead>
                        <TableHead>Mobile</TableHead>
                        <TableHead>Desktop</TableHead>
                        <TableHead>Tablet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(deviceAnalytics.by_role).map(([role, counts]) => (
                        <TableRow key={role}>
                          <TableCell>{role}</TableCell>
                          <TableCell>{counts['Mobile'] ?? 0}</TableCell>
                          <TableCell>{counts['Desktop'] ?? 0}</TableCell>
                          <TableCell>{counts['Tablet'] ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-muted">{t('Click the Analytics tab to load data.')}</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Reject access request modal */}
      <RejectAccessRequestDialog
        open={rejectModal.open}
        note={rejectNote}
        submitting={rejectSubmitting}
        onNoteChange={setRejectNote}
        onCancel={() => setRejectModal({ open: false, requestId: '' })}
        onSubmit={submitReject}
      />

      {/* Decline confirm */}
      <ConfirmModal
        show={store.showDeclineConfirm}
        onHide={store.closeDeclineConfirm}
        title={t('ConfirmDeletion')}
        body={<p className="mb-0">{t('Are you sure you want to decline this therapist?')}</p>}
        cancelText={t('Cancel')}
        confirmText={t('Decline')}
        onConfirm={() => store.declineConfirmed(t)}
      />

      {/* Access Modal */}
      <TherapistAccessDialog
        open={accessModal.open}
        therapistName={accessModal.therapistName}
        loading={accessLoading}
        error={accessError}
        success={accessSuccess}
        availableProjects={availableProjects}
        allowedClinics={allowedClinicsForSelectedProjects}
        selectedProjects={selectedProjects}
        selectedClinics={selectedClinics}
        onToggleProject={toggleProject}
        onToggleClinic={toggleClinic}
        onClose={closeAccessModal}
        onSave={saveAccess}
        onDismissError={() => setAccessError(null)}
        onDismissSuccess={() => setAccessSuccess(null)}
      />

      {/* Delete intervention confirm */}
      <ConfirmModal
        show={deleteModal.open}
        onHide={() => setDeleteModal({ open: false, id: '', title: '' })}
        title={t('Delete intervention')}
        body={
          <p className="mb-0">
            {t('Are you sure you want to permanently delete')} <strong>{deleteModal.title}</strong>?{' '}
            {t('This will also remove all associated logs and plan assignments.')}
          </p>
        }
        cancelText={t('Cancel')}
        confirmText={deleteInProgress ? t('Deleting...') : t('Delete')}
        onConfirm={confirmDelete}
      />

      {/* Delete questionnaire confirm */}
      <ConfirmModal
        show={qDeleteModal.open}
        onHide={() => setQDeleteModal({ open: false, id: '', title: '', usageCount: 0 })}
        title={t('Delete questionnaire')}
        body={
          <div>
            <p className="mb-2">
              {t('Are you sure you want to permanently delete')}{' '}
              <strong>{qDeleteModal.title}</strong>?
            </p>
            {qDeleteModal.usageCount > 0 && (
              <Alert variant="warning" className="mb-2 py-2">
                {t('This questionnaire is currently assigned to')}{' '}
                <strong>{qDeleteModal.usageCount}</strong>{' '}
                {t(
                  "rehabilitation plan(s). Deleting it will remove those assignments — the questionnaire will no longer appear in those patients' future schedules and cannot be assigned to new patients."
                )}
              </Alert>
            )}
            <Alert variant="info" className="mb-0 py-2">
              <strong>{t('Answers are preserved.')}</strong>{' '}
              {t(
                'Any responses already submitted by patients for this questionnaire are not deleted and remain accessible to therapists in patient records.'
              )}
            </Alert>
          </div>
        }
        cancelText={t('Cancel')}
        confirmText={qDeleteInProgress ? t('Deleting...') : t('Delete')}
        onConfirm={confirmDeleteQuestionnaire}
      />

      {/* Edit questionnaire modal */}
      <EditQuestionnaireDialog
        open={qEditModal.open}
        title={qEditModal.title}
        description={qEditModal.description}
        tags={qEditModal.tags}
        error={qEditError}
        saving={qEditSaving}
        onTitleChange={(title) => setQEditModal((s) => ({ ...s, title }))}
        onDescriptionChange={(description) => setQEditModal((s) => ({ ...s, description }))}
        onTagsChange={(tags) => setQEditModal((s) => ({ ...s, tags }))}
        onDismissError={() => setQEditError(null)}
        onCancel={() =>
          setQEditModal({ open: false, id: '', title: '', description: '', tags: '' })
        }
        onSave={saveQEdit}
      />
    </Layout>
  );
});

export default AdminDashboard;
