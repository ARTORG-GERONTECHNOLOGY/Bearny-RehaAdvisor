import React, { useMemo, useState, useEffect } from 'react';
import { Modal, Button, ListGroup, Badge, Row, Col, Alert, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

type AnyObj = Record<string, any>;

interface Props {
  show: boolean;
  onHide: () => void;
  intervention: AnyObj; // should include dates[] with feedback/video
}

const safeT = (t: any, key: string) => {
  const v = t(key);
  return typeof v === 'string' ? v : key;
};

const asArray = (v: any) => (Array.isArray(v) ? v : []);

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// very defensive language pick
const pickTranslation = (translations: any[], preferredLang: string) => {
  const arr = asArray(translations);
  return (
    arr.find((tr: any) => tr?.language === preferredLang)?.text ||
    arr.find((tr: any) => tr?.language === 'en')?.text ||
    arr[0]?.text ||
    ''
  );
};

const InterventionFeedbackModal: React.FC<Props> = ({ show, onHide, intervention }) => {
  const { t, i18n } = useTranslation();
  const userLang = i18n.language || 'en';

  const allDates = useMemo(() => asArray(intervention?.dates), [intervention]);

  // ✅ filter toggle
  const [onlyWithFeedback, setOnlyWithFeedback] = useState(true);

  // reset UI when opening a different intervention/modal
  useEffect(() => {
    if (show) {
      setOnlyWithFeedback(true);
      setSelectedIdx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, intervention?._id]);

  // counts
  const totalScheduled = allDates.length;

  const answeredCount = useMemo(() => {
    return allDates.reduce((acc: number, d: any) => {
      const fbCount = asArray(d?.feedback).length;
      const hasVideo = !!d?.video?.video_url;
      // treat either Q-feedback or video feedback as "answered"
      return acc + (fbCount > 0 || hasVideo ? 1 : 0);
    }, 0);
  }, [allDates]);

  // ✅ filtered list for left column
  const visibleDates = useMemo(() => {
    if (!onlyWithFeedback) return allDates;
    return allDates.filter((d: any) => {
      const fbCount = asArray(d?.feedback).length;
      const hasVideo = !!d?.video?.video_url;
      return fbCount > 0 || hasVideo;
    });
  }, [allDates, onlyWithFeedback]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = visibleDates[selectedIdx] || null;

  // if filter makes current index invalid, clamp
  useEffect(() => {
    if (selectedIdx >= visibleDates.length) setSelectedIdx(0);
  }, [visibleDates.length, selectedIdx]);

  const feedback = asArray(selected?.feedback);

  const title = intervention?.title || safeT(t, 'Intervention');

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="lg"
      // ✅ limit popup size
      dialogClassName="reha-feedback-modal"
      contentClassName="reha-feedback-modal__content"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {safeT(t, 'Feedback')}: {title}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="reha-feedback-modal__body">
        {!totalScheduled ? (
          <Alert variant="info" className="mb-0">
            {safeT(t, 'No scheduled events found')}
          </Alert>
        ) : (
          <>
            {/* ✅ summary + filter toggle */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div className="text-muted">
                {safeT(t, 'Answered feedback for')}{' '}
                <strong>
                  {answeredCount} {safeT(t, 'out of')} {totalScheduled}
                </strong>{' '}
                {safeT(t, 'scheduled events')}.
              </div>

              <Form.Check
                type="switch"
                id="onlyWithFeedbackSwitch"
                label={safeT(t, 'Show only dates with feedback')}
                checked={onlyWithFeedback}
                onChange={(e) => setOnlyWithFeedback(e.target.checked)}
              />
            </div>

            {!visibleDates.length ? (
              <Alert variant="secondary" className="mb-0">
                {safeT(t, 'No feedback available')}
              </Alert>
            ) : (
              <Row className="g-3">
                {/* LEFT: dates list (scrollable) */}
                <Col md={4}>
                  <div className="fw-semibold mb-2">{safeT(t, 'Dates')}</div>

                  <div className="reha-feedback-modal__datesScroll">
                    <ListGroup>
                      {visibleDates.map((d: any, idx: number) => {
                        const st = String(d?.status || '').toLowerCase();
                        const fbCount = asArray(d?.feedback).length;
                        const hasVid = !!d?.video?.video_url;

                        return (
                          <ListGroup.Item
                            key={d?.datetime || idx}
                            action
                            active={idx === selectedIdx}
                            onClick={() => setSelectedIdx(idx)}
                            className="d-flex justify-content-between align-items-center"
                            style={{ cursor: 'pointer' }}
                          >
                            <span style={{ fontSize: 13 }}>
                              {formatDateTime(String(d?.datetime || ''))}
                            </span>

                            <span className="d-flex gap-1 align-items-center">
                              {st ? (
                                <Badge
                                  bg={
                                    st === 'completed'
                                      ? 'success'
                                      : st === 'missed'
                                        ? 'danger'
                                        : st === 'today'
                                          ? 'primary'
                                          : 'secondary'
                                  }
                                >
                                  {safeT(t, st)}
                                </Badge>
                              ) : null}

                              {fbCount > 0 ? <Badge bg="info">Q:{fbCount}</Badge> : null}
                              {hasVid ? (
                                <Badge bg="warning" text="dark">
                                  V
                                </Badge>
                              ) : null}
                            </span>
                          </ListGroup.Item>
                        );
                      })}
                    </ListGroup>
                  </div>
                </Col>

                {/* RIGHT: feedback detail (scrollable if long) */}
                <Col md={8}>
                  {!selected ? (
                    <Alert variant="info">{safeT(t, 'Select a date')}</Alert>
                  ) : (
                    <div className="reha-feedback-modal__detailScroll">
                      {/* video */}
                      {selected?.video?.video_url ? (
                        <div className="mb-3">
                          <div className="fw-semibold mb-2">{safeT(t, 'Video feedback')}</div>
                          <video
                            src={selected.video.video_url}
                            controls
                            style={{ width: '100%', borderRadius: 8 }}
                          />
                          {selected.video.comment ? (
                            <div className="text-muted mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                              {selected.video.comment}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="fw-semibold mb-2">{safeT(t, 'Answers')}</div>

                      {!feedback.length ? (
                        <Alert variant="secondary">{safeT(t, 'No feedback available')}</Alert>
                      ) : (
                        <ListGroup>
                          {feedback.map((fb: any, i: number) => {
                            const q = fb?.question;
                            const qText = pickTranslation(q?.translations, userLang);

                            const answers = asArray(fb?.answer);
                            const answerText = answers
                              .map((a: any) => pickTranslation(a?.translations, userLang) || a?.key)
                              .filter(Boolean)
                              .join(', ');

                            return (
                              <ListGroup.Item key={i}>
                                <div className="fw-semibold">
                                  {qText || safeT(t, 'Question')}
                                </div>

                                {answerText ? <div className="mt-1">{answerText}</div> : null}

                                {fb?.comment ? (
                                  <div className="text-muted mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                                    {fb.comment}
                                  </div>
                                ) : null}

                                {fb?.audio_url ? (
                                  <div className="mt-2">
                                    <audio controls src={fb.audio_url} />
                                  </div>
                                ) : null}
                              </ListGroup.Item>
                            );
                          })}
                        </ListGroup>
                      )}
                    </div>
                  )}
                </Col>
              </Row>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {safeT(t, 'Close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default InterventionFeedbackModal;
