import { t} from 'i18next';

const DetailedFeedbackPanel = ({ selectedExercise, selectedDate }) => {
    if (!selectedExercise || !selectedDate) return <p>{t("Select a date")}</p>;
  
    const feedback = selectedExercise.dates?.find(d => d.datetime.startsWith(selectedDate));
  
    return (
      <Card>
        <Card.Body>
          <h5>{t("Feedback for")} {selectedDate}</h5>
          {feedback?.feedback ? (
            <>
              <p><strong>{t("Status")}:</strong> {feedback.status}</p>
              <p><strong>{t("Comment")}:</strong> {feedback.feedback.comments}</p>
              <p><strong>{t("Rating")}:</strong> {feedback.feedback.rating} / 5</p>
            </>
          ) : <p>{t("No feedback yet.")}</p>}
        </Card.Body>
      </Card>
    );
  };
  