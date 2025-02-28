import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, ListGroup } from 'react-bootstrap';
import { FaStar } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import apiClient from '../api/client';
import PatientInterventionPopUp from './PatientInterventionPopUp';
import '../assets/styles/RecommendationList.css';

interface Recommendation {
  intervention_id: string;
  intervention_title: string;
  description: string;
  frequency: string;
  recommendation_date: string;
  completion_dates: string[];
  not_completed_dates: string[];
  feedback: { date: string; comment: string; rating: string }[];
  content_type: string;
  link?: string;
  media_url?: string;
  preview_img?: string;
}

const RecommendationList: React.FC = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [markedAsUsed, setMarkedAsUsed] = useState<{ [key: string]: boolean }>({});
  const [userRating, setUserRating] = useState<{ [key: string]: number }>({});
  const [selectedItem, setSelectedItem] = useState<Recommendation | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    try {
      const response = await apiClient.get(`patients/${localStorage.getItem('id')}/today`);
      const data = response.data || [];

      setRecommendations(data);
      const initialMarkedAsUsed: { [key: string]: boolean } = {};

      data.forEach((rec) => {
        initialMarkedAsUsed[rec.intervention_id] = isTodayCompleted(rec.completion_dates);
        if (rec.feedback.length > 0) {
          setUserRating((prev) => ({
            ...prev,
            [rec.intervention_id]: parseInt(rec.feedback[rec.feedback.length - 1].rating, 10),
          }));
        }
      });

      setMarkedAsUsed(initialMarkedAsUsed);
    } catch (error) {
      console.error('Error fetching patient data', error);
    }
  };

  const handleMarkAsUsed = async (id: string) => {
    try {
      await apiClient.post('recommendations/mark-done/', {
        patient_id: localStorage.getItem('id'),
        intervention_id: id,
      });

      setMarkedAsUsed((prev) => ({ ...prev, [id]: true }));
      setRecommendations((prevData) =>
        prevData.map((rec) =>
          rec.intervention_id === id
            ? { ...rec, completion_dates: [...rec.completion_dates, new Date().toISOString()] }
            : rec
        )
      );
    } catch (error) {
      console.error('Error marking recommendation as done:', error);
    }
  };

  const handleFeedbackSubmit = async (id: string, rating: number, comment: string) => {
    try {
      await apiClient.post(`patients/${localStorage.getItem('id')}/feedback/${id}/`, {
        comment: comment,
        rating: rating,
      });

      setUserRating((prev) => ({ ...prev, [id]: rating }));
      setMarkedAsUsed((prev) => ({ ...prev, [id]: true }));
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const isTodayCompleted = (completionDates: string[]) => {
    const today = new Date().toISOString().split('T')[0];
    return completionDates.some((date) => date.startsWith(today));
  };

  return (
    <div className="recommendation-list">
      <h2 className="text-center mb-5">{t('Recommendations for Today')}</h2>

      {recommendations.length > 0 ? (
        <div className="scrollable-container">
          {recommendations.map((rec) => (
            <Card
              key={rec.intervention_id}
              className="mb-4 recommendation-card shadow-sm border-0"
              onClick={() => setSelectedItem(rec)}
              style={{ cursor: 'pointer' }}
            >
              <div className="row no-gutters">
                <div className="col-md-8">
                  <Card.Body className="text-left p-4">
                    <Card.Title className="headline mb-2">{rec.intervention_title}</Card.Title>
                    <Card.Text className="body-text text-muted">{rec.description}</Card.Text>
                  </Card.Body>
                </div>

                <div className="col-md-4 d-flex align-items-center justify-content-center p-3">
                  <ListGroup variant="flush">
                    {rec.preview_img && (
                      <ListGroup.Item>
                        <img src={rec.preview_img} alt="Content Preview" style={{ width: '100%' }} />
                      </ListGroup.Item>
                    )}
                  </ListGroup>
                </div>
              </div>

              <div className="row no-gutters align-items-center justify-content-between bg-light p-3">
                <div className="col-md-8 d-flex align-items-center">
                  {markedAsUsed[rec.intervention_id] ? (
                    <Badge pill bg="success" className="mark-as-used-badge">
                      {t('Done')}
                    </Badge>
                  ) : (
                    <Button
                      variant="outline-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsUsed(rec.intervention_id);
                      }}
                      className="mark-as-used-button mr-3"
                    >
                      {t('I did it!')}
                    </Button>
                  )}

                  {markedAsUsed[rec.intervention_id] && (
                    <div className="feedback-stars d-flex align-items-center">
                      <strong className="mr-2">{t('Your Rating:')}</strong>
                      {Array.from({ length: 5 }, (_, i) => (
                        <FaStar
                          key={i}
                          size={20}
                          color={i < (userRating[rec.intervention_id] || 0) ? 'gold' : 'gray'}
                          style={{ marginRight: '5px', cursor: userRating[rec.intervention_id] ? 'default' : 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            !userRating[rec.intervention_id] && handleFeedbackSubmit(rec.intervention_id, i + 1, 'Your comment');
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center mt-5">
          <p>{t('No recommendations for today. Please check back tomorrow or contact your therapist.')}</p>
        </div>
      )}

      {/* Patient Intervention Popup */}
      {selectedItem && (
        <PatientInterventionPopUp show={true} item={selectedItem} handleClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
};

export default RecommendationList;
