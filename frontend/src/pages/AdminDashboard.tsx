import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Table, Button, Modal } from 'react-bootstrap';
import adminStore from '../stores/adminStore';
import authStore from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer'; // MobX store for admin actions

const AdminDashboard: React.FC = observer(() => {
  const navigate = useNavigate(); // used for navigation
  const [loading, setLoading] = React.useState(true); // Loading state for auth check

  // Example hardcoded data for testing
  useEffect(() => {
    // Simulating the fetching of pending entries
    adminStore.pendingEntries = [
      { id: 1, name: 'Therapist John Doe', email: 'john@doe.com', type: 'Therapist' },
      { id: 2, name: 'Researcher Jane Doe', email: 'jane@doe.com', type: 'Researcher' },
      { id: 3, name: 'New Video Content', email: 'admin@content.com', type: 'Content' },
    ];
  }, []);

  // Authentication and authorization check for admin
  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Admin') {
      navigate('/unauthorized'); // Redirect to UnauthorizedAccess if not an admin
    } else {
      setLoading(false); // Set loading to false once authentication is confirmed
    }
  }, [navigate]);

  const handleEdit = (entry: any) => {
    adminStore.setEditingEntry(entry); // Set the entry in the store for editing
    adminStore.setShowEditModal(true);
  };

  const handleAccept = (entryId: number, entryType: string) => {
    adminStore.acceptEntry(entryId, entryType);
  };

  const handleDecline = (entryId: number, entryType: string) => {
    adminStore.declineEntry(entryId, entryType);
  };

  // Show a loading message while checking authentication
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <Header isLoggedIn />
      <h1>Admin Dashboard</h1>
      <h3>Pending Therapists, Researchers, and Content</h3>

      <Table striped bordered hover>
        <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Type</th>
          <th>Actions</th>
        </tr>
        </thead>
        <tbody>
        {adminStore.pendingEntries.map((entry) => (
          <tr key={entry.id}>
            <td>{entry.name}</td>
            <td>{entry.email}</td>
            <td>{entry.type}</td>
            <td>
              <Button variant="primary" onClick={() => handleEdit(entry)}>Edit</Button>{' '}
              <Button variant="success" onClick={() => handleAccept(entry.id, entry.type)}>Accept</Button>{' '}
              <Button variant="danger" onClick={() => handleDecline(entry.id, entry.type)}>Decline</Button>
            </td>
          </tr>
        ))}
        </tbody>
      </Table>

      {/* Edit Modal */}
      <Modal show={adminStore.showEditModal} onHide={() => adminStore.setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Entry</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Create a form to edit the entry fields */}
          <form>
            <div className="mb-3">
              <label htmlFor="name" className="form-label">Name</label>
              <input
                type="text"
                className="form-control"
                id="name"
                value={adminStore.editingEntry?.name || ''}
                onChange={(e) => adminStore.updateEditingEntry('name', e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                id="email"
                value={adminStore.editingEntry?.email || ''}
                onChange={(e) => adminStore.updateEditingEntry('email', e.target.value)}
              />
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => adminStore.setShowEditModal(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={() => adminStore.saveEditedEntry()}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>

      <Footer />
    </div>
  );
});

export default AdminDashboard;
