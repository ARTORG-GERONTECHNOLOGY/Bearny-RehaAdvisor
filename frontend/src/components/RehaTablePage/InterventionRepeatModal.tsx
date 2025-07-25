import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import authStore from '../../stores/authStore';
import apiClient from '../../api/client';
import { t } from 'i18next';
import config from '../../config/config.json';

const weekdays = ['Mon', 'Dien', 'Mitt', 'Don', 'Fre', 'Sam', 'Son'];

interface Props {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void;
  patient: string;
  intervention: string;
}

const InterventionRepeatModal: React.FC<Props> = ({
  show,
  onHide,
  onSuccess,
  patient,
  intervention,
}) => {
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState('week');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>('never');
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [occurrenceCount, setOccurrenceCount] = useState(10);
  const [startTime, setStartTime] = useState('08:00');
  const [success, setSuccess] = useState(false);
  const [requireVideoFeedback, setRequireVideoFeedback] = useState(false);

  const specialisations = authStore.specialisation.split(',').map((s) => s.trim());
  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];
  const isDiagnosis = diagnoses.includes(patient) || patient === 'all';

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const getCombinedStartDate = (): string => {
    if (!startDate) return new Date().toISOString();
    const [hours, minutes] = (startTime || '08:00').split(':').map(Number);
    const combined = new Date(startDate);
    combined.setHours(hours, minutes, 0, 0);
    return combined.toISOString();
  };

  const handleSubmit = async () => {
    try {
      const path = isDiagnosis
        ? 'interventions/assign-to-patient-types/'
        : 'interventions/add-to-patient/';

      const payload = {
        therapistId: authStore.id,
        patientId: patient,
        interventions: [
          {
            interval,
            interventionId: intervention,
            unit,
            startDate: getCombinedStartDate(),
            selectedDays,
            end: {
              type: endOption,
              date: endOption === 'date' ? endDate : null,
              count: endOption === 'count' ? occurrenceCount : null,
            },
            require_video_feedback: requireVideoFeedback,
          },
        ],
      };

      const res = await apiClient.post(path, payload);
      if (res.status === 200 || res.status === 201) {
        setSuccess(true);
        if (onSuccess) onSuccess();
      }
    } catch (e) {
      console.error('Error assigning intervention', e);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby="repeat-modal-title">
      <Modal.Header closeButton>
        <Modal.Title id="repeat-modal-title">{t('Frequency')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form>
          {!isDiagnosis && (
            <>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="start-date">{t('Start Date')}</Form.Label>
                <DatePicker
                  selected={startDate}
                  onChange={(date) => setStartDate(date)}
                  className="form-control"
                  dateFormat="yyyy-MM-dd"
                  id="start-date"
                  aria-label={t('Start Date')}
                />
              </Form.Group>

              <Form.Group as={Row} className="mb-3" controlId="start-time">
                <Form.Label column sm={4}>
                  {t('Start Time')}
                </Form.Label>
                <Col sm={8}>
                  <Form.Control
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    aria-label={t('Start Time')}
                  />
                </Col>
              </Form.Group>
            </>
          )}

          <Form.Group as={Row} className="mb-3" controlId="repeat-every">
            <Form.Label column sm={4}>
              {t('Repeat every')}
            </Form.Label>
            <Col sm={4}>
              <Form.Control
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value))}
                aria-label={t('Interval')}
              />
            </Col>
            <Col sm={4}>
              <Form.Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="day">{t('Day')}</option>
                <option value="week">{t('Week')}</option>
                <option value="month">{t('Month')}</option>
              </Form.Select>
            </Col>
          </Form.Group>

          {unit === 'week' && (
            <Form.Group className="mb-3" role="group" aria-label={t('Select days of the week')}>
              <div className="d-flex flex-wrap gap-2">
                {weekdays.map((day, idx) => (
                  <Button
                    key={idx}
                    variant={selectedDays.includes(day) ? 'primary' : 'outline-secondary'}
                    onClick={() => toggleDay(day)}
                    aria-pressed={selectedDays.includes(day)}
                    aria-label={t(`Day ${day}`)}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </Form.Group>
          )}

          <Form.Group className="mb-3" role="radiogroup" aria-label={t('End options')}>
            <Form.Label>{t('Ends')}</Form.Label>
            <div className="d-flex flex-column gap-2">
              <Form.Check
                type="radio"
                label={t('Never')}
                checked={endOption === 'never'}
                onChange={() => setEndOption('never')}
              />
              <Form.Check
                type="radio"
                label={t('On date')}
                checked={endOption === 'date'}
                onChange={() => setEndOption('date')}
              />
              {endOption === 'date' && (
                <DatePicker
                  selected={endDate}
                  onChange={(date) => setEndDate(date)}
                  className="form-control"
                  dateFormat="yyyy-MM-dd"
                  aria-label={t('End date')}
                />
              )}
              <Form.Check
                type="radio"
                label={t('After N times')}
                checked={endOption === 'count'}
                onChange={() => setEndOption('count')}
              />
              {endOption === 'count' && (
                <Form.Control
                  type="number"
                  value={occurrenceCount}
                  onChange={(e) => setOccurrenceCount(parseInt(e.target.value))}
                  aria-label={t('Number of occurrences')}
                />
              )}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              id="require-video-feedback"
              label={t('Ask video feedback from patient')}
              checked={requireVideoFeedback}
              onChange={() => setRequireVideoFeedback((prev) => !prev)}
            />
            <Form.Text muted>
              {t('Patients will be prompted to upload or record a video of the exercise.')}
            </Form.Text>
          </Form.Group>
        </Form>
      </Modal.Body>

      <Modal.Footer>
        {!success ? (
          <>
            <Button variant="secondary" onClick={onHide}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              {t('Save')}
            </Button>
          </>
        ) : (
          <div className="alert alert-success w-100 text-center m-0">{t('Success!')}</div>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default InterventionRepeatModal;
