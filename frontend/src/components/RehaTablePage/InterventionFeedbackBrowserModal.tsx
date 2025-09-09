import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, ButtonGroup, Badge, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import ReactPlayer from 'react-player';
import { FaFilter, FaVideo, FaCommentDots, FaMicrophone } from 'react-icons/fa';
import { translateText } from '../../utils/translate';
import { Intervention } from '../../types';

type Answer = { key: string; translations: { language: string; text: string }[] };
type Question = { id?: string; translations: { language: string; text: string }[] };

type DateEntry = {
  datetime: string;
  status: string;
  feedback?: Array<{
    question: Question;
    comment?: string;
    audio_url?: string | null;
    // backend sometimes uses answer or answerKey
    answer?: Answer[];
    answerKey?: Answer[];
  }>;
  // optional video blob (if present)
  video?: { video_url: string; video_expired: boolean; comment?: string };
};

interface Props {
  show: boolean;
  onClose: () => void;
  intervention: Intervention & { dates?: DateEntry[] };
  userLang: string;
}

const getTr = (translations: { language: string; text: string }[] = [], lang: string) =>
  translations.find((t) => t.language === lang)?.text ||
  translations.find((t) => t.language === 'en')?.text ||
  '';

const dateOnly = (iso: string) => (iso || '').slice(0, 10);

const InterventionFeedbackBrowserModal: React.FC<Props> = ({
  show,
  onClose,
  intervention,
  userLang,
}) => {
  const { t } = useTranslation();
  const [translatedTitle, setTranslatedTitle] = useState(intervention?.title || '');
  const [range, setRange] = useState<'all' | '7' | '30' | '90'>('all');
  const [onlyWithFeedback, setOnlyWithFeedback] = useState<boolean>(true);
  const [onlyWithVideo, setOnlyWithVideo] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Title i18n
  useEffect(() => {
    if (!show || !intervention?.title) return;
    translateText(intervention.title, userLang)
      .then(({ translatedText }) => setTranslatedTitle(translatedText || intervention.title))
      .catch(() => setTranslatedTitle(intervention.title));
  }, [show, intervention?.title, userLang]);

  // Entries sorted (newest first)
  const entries = useMemo(() => {
    const arr = (intervention?.dates || []).slice();
    return arr.sort((a, b) => (b.datetime > a.datetime ? 1 : -1));
  }, [intervention]);

  // Filters
  const filtered = useMemo(() => {
    const now = new Date();
    const cutoff = (days: number) => new Date(now.getTime() - days * 86400000);
    return entries.filter((e) => {
      if (onlyWithFeedback && !(e.feedback && e.feedback.length > 0)) return false;
      if (onlyWithVideo && !(e as any).video) return false;

      if (range !== 'all') {
        const d = new Date(e.datetime);
        return d >= cutoff(parseInt(range, 10));
      }
      return true;
    });
  }, [entries, range, onlyWithFeedback, onlyWithVideo]);

  const current = filtered[selectedIndex] || null;

  // Summary (quick counts shown above the list)
  const summary = useMemo(() => {
    const total = entries.length;
    const withFeedback = entries.filter((e) => e.feedback && e.feedback.length > 0).length;
    const withVideo = entries.filter((e: any) => e.video).length;
    const completed = entries.filter((e) => e.status === 'completed').length;
    return { total, withFeedback, withVideo, completed };
  }, [entries]);

  return (
    <Modal show={show} onHide={onClose} size="xl" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          {translatedTitle} – {t('Feedback')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="row g-3">
          {/* LEFT – list of relevant dates */}
          <div className="col-12 col-md-4">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="fw-semibold">{t('Entries')}</div>
              <div className="small text-muted">
                {t('Total')}: {summary.total} • {t('With feedback')}: {summary.withFeedback} • {t('Completed')}: {summary.completed}
              </div>
            </div>

            {/* Filters */}
            <div className="border rounded p-2 mb-2">
              <div className="d-flex align-items-center gap-2 mb-2">
                <FaFilter />
                <div className="fw-semibold">{t('Filters')}</div>
              </div>
              <div className="d-flex flex-wrap gap-2 mb-2">
                <ButtonGroup>
                  <Button size="sm" variant={range === 'all' ? 'primary' : 'outline-secondary'} onClick={() => setRange('all')}>
                    {t('All')}
                  </Button>
                  <Button size="sm" variant={range === '7' ? 'primary' : 'outline-secondary'} onClick={() => setRange('7')}>
                    7d
                  </Button>
                  <Button size="sm" variant={range === '30' ? 'primary' : 'outline-secondary'} onClick={() => setRange('30')}>
                    30d
                  </Button>
                  <Button size="sm" variant={range === '90' ? 'primary' : 'outline-secondary'} onClick={() => setRange('90')}>
                    90d
                  </Button>
                </ButtonGroup>
              </div>
              <Form.Check
                type="checkbox"
                id="only-feedback"
                className="mb-1"
                label={t('Only with feedback')}
                checked={onlyWithFeedback}
                onChange={(e) => setOnlyWithFeedback(e.target.checked)}
              />
              <Form.Check
                type="checkbox"
                id="only-video"
                label={t('Only with video')}
                checked={onlyWithVideo}
                onChange={(e) => setOnlyWithVideo(e.target.checked)}
              />
            </div>

            <div className="border rounded p-2" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {filtered.length === 0 && <div className="text-muted">{t('No entries found')}</div>}

              {filtered.map((e, i) => {
                const active = i === selectedIndex;
                const hasFb = (e.feedback || []).length > 0;
                const hasAudio = (e.feedback || []).some((f) => !!f.audio_url);
                const hasVideo = !!(e as any).video;
                return (
                  <button
                    key={e.datetime + i}
                    className={`w-100 text-start btn ${active ? 'btn-primary' : 'btn-outline-secondary'} mb-2`}
                    onClick={() => setSelectedIndex(i)}
                    title={new Date(e.datetime).toLocaleString()}
                  >
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <div className="fw-semibold">{dateOnly(e.datetime)}</div>
                        <div className="small">
                          <Badge bg={e.status === 'completed' ? 'success' : 'secondary'}>{e.status}</Badge>{' '}
                          {hasFb && <Badge bg="info"><FaCommentDots className="me-1" />{t('Feedback')}</Badge>}{' '}
                          {hasAudio && <Badge bg="dark"><FaMicrophone className="me-1" />{t('Audio')}</Badge>}{' '}
                          {hasVideo && <Badge bg="warning"><FaVideo className="me-1" />{t('Video')}</Badge>}
                        </div>
                      </div>
                      <div className="small text-muted">
                        {new Date(e.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT – details for selected date */}
          <div className="col-12 col-md-8">
            {!current && <div className="text-muted">{t('Select a date to view details')}</div>}

            {current && (
              <>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="fw-semibold">
                    {dateOnly(current.datetime)} • {t('Status')}:&nbsp;
                    <Badge bg={current.status === 'completed' ? 'success' : 'secondary'}>{t(current.status)}</Badge>
                  </div>
                  <div className="small text-muted">
                    {t('Feedback items')}: {current.feedback?.length || 0}
                  </div>
                </div>

                {/* Optional video */}
                {(current as any).video && (
                  <section className="mb-3">
                    <div className="fw-semibold mb-1"><FaVideo className="me-2" />{t('Video feedback')}</div>
                    {(current as any).video?.comment && <div className="fst-italic mb-2">{(current as any).video.comment}</div>}
                    {!(current as any).video?.video_expired ? (
                      <div className="rounded shadow-sm overflow-hidden">
                        <ReactPlayer url={(current as any).video.video_url} width="100%" height="320px" controls />
                      </div>
                    ) : (
                      <div className="text-muted">{t('Video feedback has expired.')}</div>
                    )}
                  </section>
                )}

                {(current.feedback || []).length > 0 ? (
                  current.feedback!.map((f, idx) => {
                    const qText = getTr(f.question?.translations || [], userLang);
                    const answers = (f.answerKey || f.answer || []) as Answer[];
                    return (
                      <section key={idx} className="mb-3">
                        <hr />
                        <div className="fw-semibold">{qText}</div>

                        {/* original audio */}
                        {f.audio_url && (
                          <div className="my-1">
                            <div className="small text-muted">{t('Original audio')}</div>
                            <audio controls preload="none" src={f.audio_url || ''} style={{ width: '100%' }} />
                          </div>
                        )}

                        {/* answers */}
                        {answers.length > 0 && (
                          <ul className="mb-0">
                            {answers.map((a, i) => (
                              <li key={i}>{getTr(a.translations || [], userLang) || a.key}</li>
                            ))}
                          </ul>
                        )}

                        {/* fallback to comment if no answers/audio */}
                        {(!answers || answers.length === 0) && !f.audio_url && (f.comment?.trim()?.length ?? 0) > 0 && (
                          <div className="mt-1">{f.comment}</div>
                        )}
                      </section>
                    );
                  })
                ) : (
                  <div className="text-muted">{t('No feedback for this date')}</div>
                )}
              </>
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default InterventionFeedbackBrowserModal;
