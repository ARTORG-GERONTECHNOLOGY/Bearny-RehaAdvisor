import React, { useEffect, useState } from "react";
import { Button, Card, Row, Col, ToggleButtonGroup, ToggleButton, Badge } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import apiClient from "../api/client";
import { startOfWeek, addDays, format, isToday, isPast, isFuture, isSameDay } from "date-fns";
import PatientInterventionPopUp from "./PatientInterventionPopUp";
import FeedbackPopup from "./FeedbackPopup";
import config from "../config/config.json";

const InterventionList = () => {
  const { t } = useTranslation();
  const [recommendations, setRecommendations] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [feedbackItem, setFeedbackItem] = useState(null);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [feedbackQuestions, setFeedbackQuestions] = useState([]);
  const [viewMode, setViewMode] = useState("day");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showHealthPopup, setShowHealthPopup] = useState(false);


  useEffect(() => {
    fetchInterventions();
    getQuestionaire();
  }, []);

  const getQuestionaire = async () => {
    try {
      const data = await apiClient.get(`/patients/get-questions/Healthstatus/${localStorage.getItem("id")}/`);
      const res = data.data;
      const language = localStorage.getItem("language") || "en";
  
      const formattedQuestions = res.questions.map((q) => {
        const label = q.translations.find(t => t.language === language)?.text || q.translations[0]?.text || '';
      
        const options = q.possibleAnswers || [];

        return {
            questionKey: q.questionKey,
            label,
            options: q.possibleAnswers || [],
            type: q.answerType,
        };
      });
  
      setFeedbackQuestions(formattedQuestions);
      setShowHealthPopup(true);
    } catch (error) {
      console.error("Error fetching health questionnaire:", error);
    }
  };
  
  

  const fetchInterventions = async () => {
    try {
      const res = await apiClient.get(`/patients/rehabilitation-plan/patient/${localStorage.getItem("id")}/`);
      setRecommendations(res.data || []);
    } catch (error) {
      console.error("Failed to load interventions", error);
    }
  };

  const handleMarkAsDone = async (interventionId) => {
    try {
      const res = await apiClient.post("recommendations/mark-done/", {
        patient_id: localStorage.getItem("id"),
        intervention_id: interventionId,
      });
  
      if (res.status === 200) {
        const updated = recommendations.map((rec) => {
          if (rec.intervention_id === interventionId) {
            return {
              ...rec,
              completion_dates: [...rec.completion_dates, new Date().toISOString()],
            };
          }
          return rec;
        });
  
        setRecommendations(updated);
        setFeedbackItem(interventionId);
  
        const data = await apiClient.get(`/patients/get-questions/Intervention/${localStorage.getItem("id")}/`);
        const res = data.data;
        const language = localStorage.getItem("language") || "en";
  
        const formattedQuestions = res.questions.map((q) => {
          const label = q.translations.find(t => t.language === language)?.text || q.translations[0]?.text || '';
        
          const options = q.possibleAnswers || [];
  
          return {
              questionKey: q.questionKey,
              label,
              options: q.possibleAnswers || [],
              type: q.answerType,
          };
        });
  
        setFeedbackQuestions(formattedQuestions);
        setShowFeedbackPopup(true);
      }
    } catch (error) {
      console.error("Error marking as done", error);
    }
  };
  

  const isCompletedOn = (rec, date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return rec.completion_dates?.some((d) => d.startsWith(dateStr));
  };

  const renderStatus = (rec, date) => {
    if (isToday(date)) {
      return isCompletedOn(rec, date) ? (
        <Badge bg="success">{t("Done")}</Badge>
      ) : (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation(); // ⛔ prevent card click
            handleMarkAsDone(rec.intervention_id);
          }}
        >
          {t("Ididit")}
        </Button>
      );
    }
    if (isPast(date)) {
      return isCompletedOn(rec, date) ? (
        <Badge bg="success">{t("Done")}</Badge>
      ) : (
        <Badge bg="secondary">{t("Missed")}</Badge>
      );
    }
    if (isFuture(date)) {
      return <Badge bg="info">{t("Upcoming")}</Badge>;
    }
  };
  

  const renderDayColumn = (date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    const filtered = recommendations.filter((rec) =>
      rec.dates.some((d) => d.startsWith(dateKey))
    );

    return (
      <Col key={dateKey}>
        <h6 className="text-center">{format(date, "EEE dd.MM")}</h6>
        {filtered.map((rec) => (
          <Card
            key={rec.intervention_id}
            className="mb-3"
            onClick={() => setSelectedItem(rec)}
            style={{ cursor: "pointer" }}
          >
            <Card.Body>
              <Card.Title>{rec.intervention_title}</Card.Title>
              <Card.Text className="text-muted">
              <div>{rec.description}</div>
              <div>{t("Duration")}: {rec.duration} {t("minutes")}</div>
              </Card.Text>
              {rec.preview_img && <img src={rec.preview_img} alt="" className="img-fluid" />}
            </Card.Body>
            <Card.Footer className="text-center">
              {renderStatus(rec, date)}
            </Card.Footer>
          </Card>
        ))}
      </Col>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const weekNumber = format(start, "I"); // ISO week number

    return (
      <>
        <h5 className="text-center mb-3">
          {format(weekDates[0], "dd.MM")} - {format(weekDates[6], "dd.MM")} ({t("Week")} {weekNumber})
        </h5>
        <Row>{weekDates.map((date) => renderDayColumn(date))}</Row>
      </>
    );
  };

  const renderDayView = () => (
    <>
      <h5 className="text-center mb-3">{format(selectedDate, "EEEE, dd.MM.yyyy")}</h5>
      <Row>{renderDayColumn(selectedDate)}</Row>
    </>
  );

  const handleNavigate = (direction) => {
    const modifier = direction === "next" ? 1 : -1;
    const delta = viewMode === "day" ? 1 : 7;
    setSelectedDate(addDays(selectedDate, delta * modifier));
  };

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Button onClick={() => handleNavigate("prev")}>{t("Previous")}</Button>
        <ToggleButtonGroup type="radio" name="viewMode" value={viewMode} onChange={setViewMode}>
          <ToggleButton id="day" value="day" variant="outline-primary">
            {t("Day")}
          </ToggleButton>
          <ToggleButton id="week" value="week" variant="outline-primary">
            {t("Week")}
          </ToggleButton>
        </ToggleButtonGroup>
        <Button onClick={() => handleNavigate("next")}>{t("Next")}</Button>
      </div>

      {viewMode === "week" ? renderWeekView() : renderDayView()}

      {selectedItem && !showFeedbackPopup && (
        <PatientInterventionPopUp
          show={true}
          item={selectedItem}
          handleClose={() => setSelectedItem(null)}
        />
      )}
      {showFeedbackPopup && (
        <FeedbackPopup
          show={true}
          interventionId={feedbackItem || ""}
          questions={feedbackQuestions || []}
          onClose={() => setShowFeedbackPopup(false)}
        />
      )}
      {showHealthPopup && (
        <FeedbackPopup
          show={true}
          interventionId={""}  // Empty since it's general health
          questions={feedbackQuestions}
          onClose={() => setShowHealthPopup(false)}
        />
      )}

    </div>
  );
};

export default InterventionList;
