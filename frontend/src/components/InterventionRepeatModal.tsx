import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col, Card } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import { t } from 'i18next';
import config from '../config/config.json';
const weekdays = ['Mon', 'Dien', 'Mitt', 'Don', 'Fre', 'Sam', 'Son'];

interface Props {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void; // <- Add this
  patient: string;
  intervention: string;
}


const InterventionRepeatModal: React.FC<Props> = ({ show, onHide, onSuccess, patient, intervention }) => {
  const specialisations = authStore.specialisation.split(',').map(s => s.trim())
  const diagnoses = Array.isArray(specialisations)
  ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
  : config?.patientInfo?.function?.[specialisations]?.diagnosis || [];
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState('week');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endOption, setEndOption] = useState<'never' | 'date' | 'count'>('never');
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [startDate, setstartDate] = useState<Date | null>(null);
  const [occurrenceCount, setOccurrenceCount] = useState(10);
  const [success, setSuccess] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<string>('08:00');
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
      const path = isDiagnosis ? 'recommendations/assign-to-patient-types/' : 'recommendations/add-to-patient/'
      const res = await apiClient.post(path,
        {
          therapistId: authStore.id,
          patientId: patient,
          interventions :[{
          interval: interval,
          interventionId: intervention,
          unit: unit,
          startDate: getCombinedStartDate(),
          selectedDays: selectedDays,
          end: {
            type: endOption,
            date: endOption === 'date' ? endDate : null,
            count: endOption === 'count' ? occurrenceCount : null
          }}]
        }
      );
      if (res.status == 200 || res.status == 201) {
        setSuccess(true)
        if (onSuccess) onSuccess(); // <- Trigger callback to fetchAll
        
      }
    } catch (e) {
      console.error('Error loading all interventions', e);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t("Frequency")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>

      {!isDiagnosis && (
        <>
          <Form.Group as={Row} className="mb-3">
            <Form.Label column sm={4}>Starts</Form.Label>
            <DatePicker
              selected={startDate}
              onChange={(date) => setstartDate(date)}
              className="form-control mt-2"
              dateFormat="yyyy-MM-dd"
            />
          </Form.Group>
          <Form.Group as={Row} className="mb-3">
            <Form.Label column sm={4}>{t("Start Time")}</Form.Label>
            <Col sm={8}>
              <Form.Control
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Col>
          </Form.Group>
        </>
      )}

        <Form.Group as={Row} className="mb-3">
          <Form.Label column sm={4}>{t("Repeat every")}</Form.Label>
          <Col sm={3}>
            <Form.Control type="number" value={interval} onChange={(e) => setInterval(parseInt(e.target.value))} />
          </Col>
          <Col sm={5}>
            <Form.Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="day">{t("Day")}</option>
              <option value="week">{t("Week")}</option>
              <option value="month">{t("Month")}</option>
            </Form.Select>
          </Col>
        </Form.Group>

        {unit === 'week' && (
          <div className="d-flex justify-content-between mb-3">
            {weekdays.map((day, idx) => (
              <Button
                key={idx}
                variant={selectedDays.includes(day) ? 'primary' : 'outline-secondary'}
                onClick={() => toggleDay(day)}
              >
                {day}
              </Button>
            ))}
          </div>
        )}

        <Form.Group className="mb-3">
          <Form.Label>{t("Ends")}</Form.Label>
          <div>
            <Form.Check
              type="radio"
              label="Never"
              checked={endOption === 'never'}
              onChange={() => setEndOption('never')}
            />
            <Form.Check
              type="radio"
              label="On date"
              checked={endOption === 'date'}
              onChange={() => setEndOption('date')}
            />
            {endOption === 'date' && (
              <DatePicker
                selected={endDate}
                onChange={(date) => setEndDate(date)}
                className="form-control mt-2"
              />
            )}
            <Form.Check
              type="radio"
              label="After N times"
              checked={endOption === 'count'}
              onChange={() => setEndOption('count')}
            />
            {endOption === 'count' && (
              <Form.Control
                className="mt-2"
                type="number"
                value={occurrenceCount}
                onChange={(e) => setOccurrenceCount(parseInt(e.target.value))}
              />
            )}
          </div>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        {!success && 
        <>
        <Button variant="secondary" onClick={onHide}>{t("Cancel")}</Button>
        <Button variant="primary" onClick={handleSubmit}>{t("Save")}</Button>
        </>}
        {success &&         <div className="alert alert-success">
          {t("Succes.")}
        </div>}

        
      </Modal.Footer>
    </Modal>
  );
};

export default InterventionRepeatModal;
