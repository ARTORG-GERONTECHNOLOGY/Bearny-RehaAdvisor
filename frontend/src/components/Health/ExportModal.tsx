import React, { useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';

type Props = {
  show: boolean;
  onClose: () => void;

  // initial values (used to prefill when the modal opens)
  initialFrom: Date | null;
  initialTo: Date | null;
  selections: Record<string, boolean>;

  // call back to the page with the chosen settings
  onExportCSV: (from: Date, to: Date, selections: Record<string, boolean>) => void;
  onExportPDF: (from: Date, to: Date, selections: Record<string, boolean>) => void;
};

const ExportModal: React.FC<Props> = ({
  show,
  onClose,
  initialFrom,
  initialTo,
  selections,
  onExportCSV,
  onExportPDF,
}) => {
  const { t } = useTranslation();

  const [from, setFrom] = useState<Date | null>(initialFrom);
  const [to, setTo] = useState<Date | null>(initialTo);
  const [chosen, setChosen] = useState<Record<string, boolean>>(selections);

  // reset local state when the modal opens
  useEffect(() => {
    if (show) {
      setFrom(initialFrom);
      setTo(initialTo);
      setChosen(selections);
    }
  }, [show, initialFrom, initialTo, selections]);

  const ids = [
    'totalScore','questionnaire','restingHR','sleep','hrZones',
    'floors','steps','distance','breathing','hrv'
  ];

  const allSelected = Object.values(chosen).every(Boolean);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    ids.forEach(id => (next[id] = !allSelected));
    setChosen(next);
  };

  const disabled = !from || !to;

  return (
    <Modal show={show} onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('Export')}</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="text-muted small mb-3">
          {t('Export date range only affects the files; it does not change the charts.')}
        </p>

        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <Form.Label className="fw-bold">{t('From')}</Form.Label>
            <DatePicker
              selected={from}
              onChange={(d) => setFrom(d)}
              className="form-control"
              dateFormat="yyyy-MM-dd"
            />
          </div>
          <div className="col-md-6">
            <Form.Label className="fw-bold">{t('To')}</Form.Label>
            <DatePicker
              selected={to}
              onChange={(d) => setTo(d)}
              className="form-control"
              dateFormat="yyyy-MM-dd"
            />
          </div>
        </div>

        <hr className="my-4" />

        <Form.Label className="fw-bold">{t('Select Plots to Export')}</Form.Label>
        <div className="mb-2">
          <span
            className={`badge rounded-pill px-3 py-2 ${allSelected ? 'bg-success text-white' : 'bg-light text-success border border-success'}`}
            style={{ cursor: 'pointer' }}
            onClick={toggleAll}
          >
            {t('Select All')}
          </span>
        </div>

        <div className="d-flex flex-wrap gap-2">
          {ids.map((id) => (
            <span
              key={id}
              className={`badge rounded-pill px-3 py-2 ${
                chosen[id] ? 'bg-primary text-white' : 'bg-light text-primary border border-primary'
              }`}
              style={{ cursor: 'pointer' }}
              onClick={() => setChosen((p) => ({ ...p, [id]: !p[id] }))}
            >
              {t(id)}
            </span>
          ))}
        </div>
      </Modal.Body>

      <Modal.Footer className="justify-content-between">
        <Button variant="outline-secondary" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            disabled={disabled}
            onClick={() => from && to && onExportCSV(from, to, chosen)}
          >
            <i className="bi bi-file-earmark-spreadsheet"></i> {t('Export CSV')}
          </Button>
          <Button
            variant="outline-primary"
            disabled={disabled}
            onClick={() => from && to && onExportPDF(from, to, chosen)}
          >
            <i className="bi bi-file-earmark-pdf"></i> {t('Export PDF')}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default ExportModal;
