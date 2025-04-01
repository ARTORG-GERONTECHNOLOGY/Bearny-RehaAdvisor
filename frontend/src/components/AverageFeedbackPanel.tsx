import { t} from 'i18next';

const AverageFeedbackPanel = ({ selectedExercise }) => {
    if (!selectedExercise) return <p>{t("Select an intervention")}</p>;
  
    const averageRating = (
      selectedExercise.feedback.reduce((sum, fb) => sum + (parseInt(fb.rating) || 0), 0) /
      (selectedExercise.feedback.length || 1)
    ).toFixed(1);
  
    return (
      <Card>
        <Card.Body>
          <h5>{t("Avg. Feedback")}</h5>
          <p><strong>{t("Rating")}:</strong> {averageRating} / 5</p>
          {/* Optionally show charts */}
        </Card.Body>
      </Card>
    );
  };
  