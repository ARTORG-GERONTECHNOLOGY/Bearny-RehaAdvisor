import React, { useEffect, useState } from 'react';
import { Modal, Button, ListGroup, Spinner } from 'react-bootstrap';
import apiClient from '../api/client';

interface AddRecommendationModalProps {
  show: boolean;
  onHide: () => void;
  onAdd: (recommendationId: number) => void;
  patientFunction: string;
  existingRecommendations: number[]; // IDs of recommendations that the patient already has
}

const AddRecommendationModal: React.FC<AddRecommendationModalProps> = ({
                                                                         show,
                                                                         onHide,
                                                                         onAdd,
                                                                         patientFunction,
                                                                         existingRecommendations,
                                                                       }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    if (show) {
      fetchRecommendations();
    }
  }, [show]);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`recommendations?function=${patientFunction}`);
      setRecommendations(response.data);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    }
    setLoading(false);
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Add Recommendation</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <Spinner animation="border" variant="primary" />
        ) : (
          <ListGroup>
            {recommendations.map((rec) => {
              const alreadyAdded = existingRecommendations.includes(rec._id);

              return (
                <ListGroup.Item
                  key={rec.inter_id}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <h5>{rec.title}</h5>
                    <p>{rec.description}</p>
                  </div>
                  {!alreadyAdded && (
                    <Button variant="success" onClick={() => onAdd(rec._id)}>
                      Add
                    </Button>
                  )}
                  {alreadyAdded && <span className="text-muted">Already Added</span>}
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default AddRecommendationModal;
