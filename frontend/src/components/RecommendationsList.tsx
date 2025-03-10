import React, { useEffect, useState } from "react";
import { Badge, Button, Card, ListGroup } from "react-bootstrap";
import { FaStar } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import apiClient from "../api/client";
import PatientInterventionPopUp from "./PatientInterventionPopUp";
import FeedbackPopup from "../components/FeedbackPopup";
import "../assets/styles/RecommendationList.css";
import config from "../config/config.json";

const RecommendationList = () => {
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState([]);
  const [markedAsUsed, setMarkedAsUsed] = useState({});
  const [userRating, setUserRating] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackItem, setFeedbackItem] = useState(null);
  const [feedbackQuestions, setFeedbackQuestions] = useState([]);

  useEffect(() => {
    fetchPatientData();
  }, []);

  const fetchPatientData = async () => {
    try {
      const response = await apiClient.get(`patients/${localStorage.getItem("id")}/today`);
      const data = response.data || [];
      setRecommendations(data);
      const initialMarkedAsUsed = {};
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
      
      // Check if general questions should be asked TODO
      setFeedbackQuestions(config.FeedbackQuestions[1].fields || []);
      setShowFeedbackPopup(true);

    } catch (error) {
      console.error("Error fetching patient data", error);
    }
  };

  const handleMarkAsUsed = async (id) => {
    try {
      await apiClient.post("recommendations/mark-done/", {
        patient_id: localStorage.getItem("id"),
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
      setFeedbackItem(id);
      setFeedbackQuestions(config.FeedbackQuestions[0].fields)
      setShowFeedbackPopup(true);
    } catch (error) {
      console.error("Error marking recommendation as done:", error);
    }
  };

  const isTodayCompleted = (completionDates) => {
    const today = new Date().toISOString().split("T")[0];
    return completionDates.some((date) => date.startsWith(today));
  };

  return (
    <>
    <div className="recommendation-list">
      <h2 className="text-center mb-5">{t("Recommendations for Today")}</h2>

      {recommendations.length > 0 ? (
        <div className="scrollable-container">
          {recommendations.map((rec) => (
            <Card
              key={rec.intervention_id}
              className="mb-4 recommendation-card shadow-sm border-0"
              onClick={() => setSelectedItem(rec)}
              style={{ cursor: "pointer" }}
            >
              <Card.Body className="text-left p-4">
                <Card.Title className="headline mb-2">{rec.intervention_title}</Card.Title>
                <Card.Text className="body-text text-muted">{rec.description}</Card.Text>
                {rec.preview_img && <img src={rec.preview_img} alt="Content Preview" className="w-100" />}
              </Card.Body>

              <div className="row no-gutters align-items-center justify-content-between bg-light p-3">
                <div className="col-md-8 d-flex align-items-center">
                  {markedAsUsed[rec.intervention_id] ? (
                    <Badge pill bg="success" className="mark-as-used-badge">
                      {t("Done")}
                    </Badge>
                  ) : (
                    <Button
                      variant="outline-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsUsed(rec.intervention_id);
                      }}
                      className="mark-as-used-button"
                    >
                      {t("I did it!")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center mt-5">
          <p>{t("No recommendations for today. Please check back tomorrow or contact your therapist.")}</p>
        </div>
      )}

      {selectedItem && <PatientInterventionPopUp show={true} item={selectedItem} handleClose={() => setSelectedItem(null)} />}
      {showFeedbackPopup && feedbackQuestions.length > 0 && (
        <FeedbackPopup
          show={true}
          interventionId={feedbackItem || ''}
          questions={feedbackQuestions || []}
          onClose={() => setShowFeedbackPopup(false)}
        />
      )}

    </div>
    </>
  );
};

export default RecommendationList;
