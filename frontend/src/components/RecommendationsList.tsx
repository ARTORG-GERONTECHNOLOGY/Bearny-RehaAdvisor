import React, { useEffect, useState } from 'react';
import { Badge, Button, Card, ListGroup } from 'react-bootstrap';
import { FaStar } from 'react-icons/fa';
import '../assets/styles/RecommendationList.css';
import { useTranslation } from 'react-i18next';
import apiClient from '../api/client';

//import Microlink from '@microlink/react';

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
}

const RecommendationList: React.FC = () => {
  const [recommendationsData, setRecommendationsData] = useState<Recommendation[]>([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [selectedRecommendationIndex, setSelectedRecommendationIndex] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [markedAsUsed, setMarkedAsUsed] = useState<{ [key: number]: boolean }>({});
  const [userRating, setUserRating] = useState<{ [key: number]: number }>({});
  const { t } = useTranslation();

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    try {
      const response = await apiClient.get(`patient/${localStorage.getItem('id')}/today`);
      const data = response.data || [];

      setRecommendationsData(data);

      const initialMarkedAsUsed: { [key: number]: boolean } = {};
      // @ts-ignore
      data.forEach((rec, index) => {
        initialMarkedAsUsed[index] = isTodayCompleted(rec.completion_dates);
        if (rec.feedback.length > 0) {
          const latestFeedback = rec.feedback[rec.feedback.length - 1];
          setUserRating((prev) => ({ ...prev, [index]: parseInt(latestFeedback.rating, 10) }));
        }
      });
      setMarkedAsUsed(initialMarkedAsUsed);
    } catch (error) {
      console.error('Error fetching patient data', error);
    }
  };

  const handleShow = (recommendation: Recommendation, index: number) => {
    setSelectedRecommendation(recommendation);
    setSelectedRecommendationIndex(index);
    setShowPopup(true);
  };

  const getFileType = (url: string) => {
    // @ts-ignore
    const extension = url.split('.').pop().toLowerCase();
    if (['mp4', 'mov', 'avi'].includes(extension)) {
      return 'video';
    } else if (['mp3', 'wav', 'aac'].includes(extension)) {
      return 'audio';
    } else if (['pdf'].includes(extension)) {
      return 'pdf';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
      return 'image';
    }
    return 'unknown';
  };

  const handleClose = () => {
    setShowPopup(false);
    setSelectedRecommendation(null);
    setSelectedRecommendationIndex(null);
  };

  const handleMarkAsUsed = async (index: number) => {
    try {
      await apiClient.post('markdone', {
        patient_id: localStorage.getItem('id'),
        intervention_id: recommendationsData[index].intervention_id,
      });

      setMarkedAsUsed((prevState) => ({
        ...prevState,
        [index]: true,
      }));
      setRecommendationsData((prevData) =>
        prevData.map((rec, i) =>
          i === index
            ? { ...rec, completion_dates: [...rec.completion_dates, new Date().toISOString()] }
            : rec
        )
      );
    } catch (error) {
      console.error('Error marking recommendation as done:', error);
    }
  };

  const handleFeedbackSubmit = async (index: number, rating: number, comment: string) => {
    try {
      await apiClient.post(`patient/${localStorage.getItem('id')}/feedback/${recommendationsData[index].intervention_id}`, {
        comment: comment,
        rating: rating,
      });
      setUserRating((prevRating) => ({
        ...prevRating,
        [index]: rating,
      }));
      setMarkedAsUsed((prevState) => ({
        ...prevState,
        [index]: true,
      }));

    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const isTodayCompleted = (completionDates: string[]) => {
    const today = new Date().toISOString().split('T')[0];
    return completionDates.some(date => date.startsWith(today));
  };

  return (
    <div className="recommendation-list">
      <h2 className="text-center mb-5">Recommendations for Today</h2>

      {recommendationsData.length > 0 ? (
        <div className="scrollable-container">
          {recommendationsData.map((rec, index) => (
            <Card key={index} className="mb-4 recommendation-card shadow-sm border-0">
              <div className="row no-gutters">
                <div className="col-md-8">
                  <Card.Body className="text-left p-4">
                    <Card.Title className="headline mb-2">{rec.intervention_title}</Card.Title>
                    <Card.Text className="body-text text-muted">{rec.description}</Card.Text>
                  </Card.Body>
                </div>

                <div className="col-md-4 d-flex align-items-center justify-content-center p-3">
                  <ListGroup variant="flush">
                    {rec.link && (
                      <ListGroup.Item>
                        <a href={rec.link} target="_blank" rel="noopener noreferrer">View Article</a>
                      </ListGroup.Item>
                    )}

                    {rec.media_url && (() => {
                      const fileType = getFileType(rec.media_url);
                      switch (fileType) {
                        case 'video':
                          return (
                            <ListGroup.Item>
                              <video width="100%" controls>
                                <source src={rec.media_url} type="video/mp4" />
                                Your browser does not support the video tag.
                              </video>
                            </ListGroup.Item>
                          );
                        case 'audio':
                          return (
                            <ListGroup.Item>
                              <audio controls>
                                <source src={rec.media_url} type="audio/mpeg" />
                                Your browser does not support the audio element.
                              </audio>
                            </ListGroup.Item>
                          );
                        case 'pdf':
                          return (
                            <ListGroup.Item>
                              <a href={rec.media_url} target="_blank" rel="noopener noreferrer">View PDF</a>
                            </ListGroup.Item>
                          );
                        case 'image':
                          return (
                            <ListGroup.Item>
                              <img src={rec.media_url} alt="Content Image" style={{ width: '100%' }} />
                            </ListGroup.Item>
                          );
                        default:
                          return <p>No valid media available</p>;
                      }
                    })()}
                  </ListGroup>
                </div>
              </div>

              <div className="row no-gutters align-items-center justify-content-between bg-light p-3">
                <div className="col-md-8 d-flex align-items-center">
                  {markedAsUsed[index] ? (
                    <Badge pill bg="success" className="mark-as-used-badge">
                      Done
                    </Badge>
                  ) : (
                    <Button
                      variant="outline-primary"
                      onClick={() => handleMarkAsUsed(index)}
                      className="mark-as-used-button mr-3"
                    >
                      {t('I did it!')}
                    </Button>
                  )}
                  {markedAsUsed[index] && (
                    <div className="feedback-stars d-flex align-items-center">
                      <strong className="mr-2">Your Rating:</strong>
                      {Array.from({ length: 5 }, (_, i) => (
                        <FaStar
                          key={i}
                          size={20}
                          color={i < (userRating[index] || 0) ? 'gold' : 'gray'}
                          style={{ marginRight: '5px', cursor: userRating[index] ? 'default' : 'pointer' }}
                          onClick={() => !userRating[index] && handleFeedbackSubmit(index, i + 1, 'Your comment')}
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
          <p>No recommendations for today. Please check back tomorrow or contact your therapist.</p>
        </div>
      )}
    </div>
  );
};

export default RecommendationList;
