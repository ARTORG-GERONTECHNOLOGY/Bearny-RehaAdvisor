import React, { useEffect, useState } from 'react';
import { Button, Carousel, Form, ListGroup, Modal } from 'react-bootstrap';
import { FaStar } from 'react-icons/fa';
import { t } from 'i18next';
import apiClient from '../api/client';

// @ts-ignore
const InterventionPopup = ({ recommendation, show, handleClose, isDone, hasFeedback }) => {
  const { title } = recommendation;

  const [recommendationInfo, setInterventionInfo] = useState(null);
  const [feedbackList, setFeedbackList] = useState([]);
  const [userFeedback, setUserFeedback] = useState('');
  const [userStars, setUserStars] = useState(0);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    if (show) fetchInterventionData();
  }, [show]);

  const fetchInterventionData = async () => {
    try {
      const response = await apiClient.get(`interventions/${recommendation.intervention_id}`);
      setInterventionInfo(response.data.recommendation);
      setFeedbackList(response.data.feedback);
    } catch (error) {
      console.error('Error fetching recommendation data:', error);
    }
  };

  const handleFeedbackSubmit = async () => {
    try {
      await apiClient.post(`patient/${localStorage.getItem('id')}/feedback/${recommendation.intervention_id}`, {
        comment: userFeedback,
        rating: userStars,
      });
      // @ts-ignore
      setFeedbackList([...feedbackList, { comment: userFeedback, rating: userStars }]);
      setUserFeedback('');
      setUserStars(0);
      setFeedbackSubmitted(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const renderStars = () => (
    [...Array(5)].map((_, i) => (
      <FaStar
        key={i}
        size={24}
        color={i < userStars ? 'gold' : 'gray'}
        style={{ cursor: 'pointer', marginRight: '5px' }}
        onClick={() => setUserStars(i + 1)}
      />
    ))
  );

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{recommendation.intervention_title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Display Media or Link */}
        <ListGroup variant='flush'>
          {/* Link for article */}
          {recommendation.link && (
            <ListGroup.Item>
              {/* <a href={recommendation.link} target="_blank" rel="noopener noreferrer">View Article</a>*/}
              <iframe src={recommendation.link} title='Link to a recomendation'></iframe>
            </ListGroup.Item>
          )}

          {/* Video content */}
          {recommendation.media_url && recommendation.media_url.endsWith('.mp4') && (
            <ListGroup.Item>
              <video width='100%' controls>
                <source src={recommendation.media_url} type='video/mp4' />
                {t("Your browser does not support the video tag.")}
              </video>
            </ListGroup.Item>
          )}

          {/* Audio content */}
          {recommendation.media_url && recommendation.media_url.endsWith('.mp3') && (
            <ListGroup.Item>
              <audio controls>
                <source src={recommendation.media_url} type='audio/mp3' />
                {t("Your browser does not support the audio element.")}
              </audio>
            </ListGroup.Item>
          )}

          {/* PDF content */}
          {recommendation.media_url && recommendation.media_url.endsWith('.pdf') && (
            <ListGroup.Item>
              <a href={recommendation.media_url} target='_blank' rel='noopener noreferrer'>
                {t("View PDF")}
              </a>
            </ListGroup.Item>
          )}

          {/* Image content */}
          {recommendation.media_url &&
            (recommendation.media_url.endsWith('.jpg') ||
              recommendation.media_url.endsWith('.jpeg') ||
              recommendation.media_url.endsWith('.png')) && (
              <ListGroup.Item>
                <img src={recommendation.media_url} alt='Image content' width='100%' />
              </ListGroup.Item>
            )}

          {/* Message for unavailable media */}
          {!recommendation.link && !recommendation.media_url && <p>{t("No links or media available")}</p>}
        </ListGroup>

        {/* Intervention Info */}
        {recommendationInfo ? (
          <>
            <p>
              <strong>{t("Description:")}</strong>{' '}
              {
                // @ts-ignore
                recommendationInfo.description
              }
            </p>
            <p>
              <strong>{t("Type:")}</strong>{' '}
              {
                // @ts-ignore
                t(recommendationInfo.content_type)
              }
            </p>
          </>
        ) : (
          <p>{t("Loading recommendation details...")}</p>
        )}

        {/* Average Stars */}
        <div className='mt-3'>
          <strong>{t("Average Rating:")}</strong>{' '}
          {
            // @ts-ignore
            recommendationInfo?.stars || 0
          }{' '}
          / 5
        </div>

        {/* Feedback Carousel */}
        <h5 className='mt-4'>{t("Previous Feedback")}</h5>
        {feedbackList.length > 0 ? (
          <Carousel interval={5000}>
            {feedbackList.map((fb, index) => (
              <Carousel.Item key={index}>
                <div style={{ padding: '10px', background: '#f8f9fa', color: 'black' }}>
                  <p>
                    {
                      // @ts-ignore
                      fb.comment
                    }
                  </p>
                  <small>
                    {t("Rating:")}{' '}
                    {
                      // @ts-ignore
                      fb.rating
                    }{' '}
                    / 5
                  </small>
                </div>
              </Carousel.Item>
            ))}
          </Carousel>
        ) : (
          <p className='text-muted'>{t("No feedback available yet.")}</p>
        )}

        {/* Feedback Form - only if marked as done and not yet submitted */}
        {isDone && !feedbackSubmitted && !hasFeedback && (
          <div className='mt-4'>
            <h6>{t("Give Your Feedback")}</h6>

            {/* Star Rating */}
            <div className='d-flex align-items-center mb-3'>
              <span>{t("Rate:")}</span>
              <div className='ml-2'>{renderStars()}</div>
            </div>

            {/* Feedback Text Input */}
            <Form.Group>
              <Form.Control
                as='textarea'
                rows={3}
                placeholder={t("Write your feedback here...")}
                value={userFeedback}
                onChange={(e) => setUserFeedback(e.target.value)}
              />
            </Form.Group>

            {/* Submit Feedback Button */}
            <Button
              variant='primary'
              onClick={handleFeedbackSubmit}
              disabled={userStars === 0}
              className='mt-2'
            >
              {t("Submit Feedback")}
            </Button>
          </div>
        )}
      </Modal.Body>
    </Modal>
  )
};

export default InterventionPopup;
