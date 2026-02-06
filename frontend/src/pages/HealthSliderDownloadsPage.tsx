import React, { useState } from 'react';
import { Button, Table, Spinner, Container, Row, Col, Form } from 'react-bootstrap';
import { zipSync, strToU8 } from 'fflate';
import apiClient from '../api/client';

export default function DownloadsPage() {
  const [participantId, setParticipantId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const fetchItems = async () => {
    if (!participantId.trim()) return alert("Please enter a Patient ID");
    setLoading(true);
    try {
      const res = await apiClient.get(`/healthslider/items/`, { params: { participantId: participantId.trim() } });
      setItems(res.data.items || []);
    } catch (e) { alert("Error fetching data"); }
    setLoading(false);
  };

  /** --- DYNAMIC AUDIO LOADING --- */
  const loadAudio = async (itemId: string) => {
    if (audioUrls[itemId]) return; // Already loaded
    try {
      const res = await apiClient.get(`/healthslider/audio/${itemId}/`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setAudioUrls(prev => ({ ...prev, [itemId]: url }));
    } catch (e) { alert("Playback failed to load."); }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const downloadAll = async () => {
    if (!items.length) return;
    setLoading(true);

    const zipData: Record<string, Uint8Array> = {};
    const dateStr = new Date().toISOString().split('T')[0];

    const csvRows = [["QuestionID", "QuestionText", "Rating", "Timestamp", "AudioFile"]];
    
    for (const item of items) {
      const fileName = item.audioName || `Q${item.questionIndex + 1}_${participantId}.mp4`;
      csvRows.push([
        item.questionIndex + 1,
        `"${item.questionText}"`,
        item.answerValue === -1 ? "N/A" : item.answerValue,
        item.answeredAt,
        item.hasAudio ? fileName : "No Audio"
      ]);

      if (item.hasAudio) {
        try {
          const audioRes = await apiClient.get(`/healthslider/audio/${item.id}/`, { responseType: 'arraybuffer' });
          zipData[fileName] = new Uint8Array(audioRes.data);
        } catch (e) { console.error("Audio download failed", item.id); }
      }
    }

    zipData[`Summary_${participantId}_${dateStr}.csv`] = strToU8(csvRows.map(r => r.join(",")).join("\n"));

    const zipped = zipSync(zipData);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ICF_Monitor_Export_${participantId}_${dateStr}.zip`;
    a.click();
    
    setLoading(false);
  };

  return (
    <Container className="py-5" style={{ fontFamily: 'Atkinson Hyperlegible, sans-serif' }}>
      <h3 className="mb-4">Admin Dashboard (V2.2)</h3>
      <Row className="mb-4 align-items-end">
        <Col md={4}>
          <Form.Group>
            <Form.Label className="fw-bold">Patient ID (Format: Pxx)</Form.Label>
            <Form.Control 
              value={participantId} 
              onChange={e => setParticipantId(e.target.value)} 
              placeholder="e.g. P01" 
            />
          </Form.Group>
        </Col>
        <Col>
          <Button onClick={fetchItems} variant="primary" className="me-2 px-4 shadow-sm">Search</Button>
          <Button variant="success" onClick={downloadAll} disabled={!items.length || loading} className="px-4 shadow-sm">
            {loading ? <Spinner size="sm" /> : "Download All (ZIP + CSV)"}
          </Button>
        </Col>
      </Row>

      <Table striped bordered hover responsive className="mt-2 align-middle">
        <thead className="table-dark">
          <tr>
            <th className="text-center">Q#</th>
            <th>Question & Timestamp</th>
            <th className="text-center">Rating</th>
            <th className="text-center">Audio Size</th>
            <th style={{ width: '300px' }}>Playback</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id}>
              <td className="text-center fw-bold">{it.questionIndex + 1}</td>
              <td>
                <div className="fw-semibold">{it.questionText}</div>
                <small className="text-muted">{new Date(it.answeredAt).toLocaleString('de-DE')}</small>
              </td>
              <td className="text-center">
                {it.answerValue === -1 ? (
                  <span className="badge bg-secondary">N/A</span>
                ) : (
                  <span className="badge bg-primary" style={{ fontSize: '1rem' }}>{it.answerValue}</span>
                )}
              </td>
              <td className="text-center text-muted small">{it.hasAudio ? formatSize(it.audioSize) : '—'}</td>
              <td>
                {it.hasAudio ? (
                  audioUrls[it.id] ? (
                    <audio src={audioUrls[it.id]} controls style={{ height: '35px', width: '100%' }} />
                  ) : (
                    <Button size="sm" variant="outline-dark" onClick={() => loadAudio(it.id)}>
                      ▶ Load Recording
                    </Button>
                  )
                ) : (
                  <span className="text-danger small">No recording available</span>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && !loading && (
            <tr><td colSpan={5} className="text-center py-5 text-muted">Enter a Patient ID and click Search to display results.</td></tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
}