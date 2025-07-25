import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Table, Button, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../components/common/ErrorAlert';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import adminStore from '../stores/adminStore';
import authStore from '../stores/authStore';

const AdminDashboard: React.FC = observer(() => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAccessAndLoad = async () => {
      await authStore.checkAuthentication();
      if (!authStore.isAuthenticated || authStore.userType !== 'Admin') {
        navigate('/unauthorized');
        return;
      }

      try {
        await adminStore.fetchPendingEntries();
      } catch (err) {
        console.error('Error fetching pending entries:', err);
        setError(t('Failed to fetch pending entries. Please try again later.'));
      } finally {
        setLoading(false);
      }
    };

    checkAccessAndLoad();
  }, [navigate, t]);

  const handleAccept = async (entryId: string) => {
    try {
      await adminStore.acceptEntry(entryId);
    } catch (err) {
      console.error('Error accepting entry:', err);
      setError(t('Failed to accept entry. Please try again later.'));
    }
  };

  const handleDecline = async (entryId: string) => {
    const confirmed = window.confirm(t('Are you sure you want to decline this therapist?'));
    if (!confirmed) return;

    try {
      await adminStore.declineEntry(entryId);
    } catch (err) {
      console.error('Error declining entry:', err);
      setError(t('Failed to decline entry. Please try again later.'));
    }
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <main className="container my-5 flex-grow-1">
        <h1 className="text-center">{t('Admin Dashboard')}</h1>
        <h3 className="text-center mb-4">{t('Pending Therapists, Researchers, and Content')}</h3>

        {error && (
          <ErrorAlert
            message={error}
            onClose={() => setError('')}
          />
        )}

        {loading ? (
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
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {adminStore.pendingEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td>{entry.email}</td>
                  <td>{t(entry.role)}</td>
                  <td>
                    <Button
                      variant="success"
                      onClick={() => handleAccept(entry.id)}
                      className="me-2"
                    >
                      {t('Accept')}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDecline(entry.id)}
                    >
                      {t('Decline')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </main>

      <Footer />
    </div>
  );
});

export default AdminDashboard;
