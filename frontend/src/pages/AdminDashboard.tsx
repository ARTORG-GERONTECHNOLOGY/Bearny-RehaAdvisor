import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Table, Button } from 'react-bootstrap';
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

  // Authentication and data fetching
  useEffect(() => {
    const checkAccessAndLoad = async () => {
      await authStore.checkAuthentication();
      if (!authStore.isAuthenticated || authStore.userType !== 'Admin') {
        navigate('/unauthorized');
      } else {
        try {
          await adminStore.fetchPendingEntries();
        } catch (error) {
          console.error('Error fetching pending entries:', error);
          setLoading(false);
          setError('Failed to fetch pending entries. Please try again later.');
        }
        setLoading(false);
      }
    };
    checkAccessAndLoad();
  }, [navigate]);

  const handleAccept = (entryId: string) => {
    adminStore.acceptEntry(entryId);
    if (adminStore.error) {
      console.error('Error accepting entry:', adminStore.error);
      setError(t('Failed to accept entry. Please try again later.'));
    }
  };

  const handleDecline = (entryId: string) => {
    if (window.confirm(t('Are you sure you want to decline this therapist?'))) {
      adminStore.declineEntry(entryId);
      if (adminStore.error) {
        console.error('Error declining entry:', adminStore.error);
        setError(t('Failed to decline entry. Please try again later.'));
      }
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
            onClose={() => {
              setError('');
            }}
          />
        )}
        {adminStore.pendingEntries.length === 0 ? (
          <p className="text-center text-muted">{t('No pending entries')}</p>
        ) : (
          <Table striped bordered hover>
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
                  <td>{entry.role}</td>
                  <td>
                    <Button
                      variant="success"
                      onClick={() => handleAccept(entry.id)}
                      className="me-2"
                    >
                      {t('Accept')}
                    </Button>
                    <Button variant="danger" onClick={() => handleDecline(entry.id)}>
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
