import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Container, Row, Col, Button, ToggleButtonGroup, ToggleButton } from 'react-bootstrap';
import Header from '../components/common/Header';
import ErrorAlert from '../components/common/ErrorAlert';
import authStore from '../stores/authStore';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { useNavigate } from 'react-router-dom';
import autoTable from 'jspdf-autotable';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface HealthEntry {
  date: string;
  steps?: number;
  resting_heart_rate?: number;
}

const HealthPage: React.FC = () => {
  const [allData, setAllData] = useState<HealthEntry[]>([]);
  const [filteredData, setFilteredData] = useState<HealthEntry[]>([]);
  const [error, setError] = useState<string>('');
  const [patientName, setPatientName] = useState<string>('John Doe');
  const [patientUsername, setPatientUsername] = useState<string>('');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [page, setPage] = useState<number>(0);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    }

    const userId = localStorage.getItem('selectedPatient') || patientUsername;
    axios.get(`/api/fitbit/health-data/${userId}/`)
      .then(res => {
        const sorted = res.data.data.sort((a: HealthEntry, b: HealthEntry) => a.date.localeCompare(b.date));
        setAllData(sorted);
      })
      .catch(err => {
        console.error('Failed to fetch health data', err);
        setError(err.response?.data?.error || 'Failed to load Fitbit data.');
      });

    const storedUsername = localStorage.getItem('selectedPatient') || '';
    const storedName = localStorage.getItem('selectedPatientName') || '';
    setPatientUsername(storedUsername);
    setPatientName(storedName || 'John Doe');
  }, [navigate]);

  useEffect(() => {
    if (!allData.length) return;

    let rangeStart: Date;
    let rangeEnd: Date;

    if (startDate && endDate) {
      rangeStart = startDate;
      rangeEnd = endDate;
    } else {
      const now = new Date();
      if (viewMode === 'week') {
        rangeStart = new Date(now);
        rangeStart.setDate(now.getDate() + page * 7);
        rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeStart.getDate() + 6);
      } else {
        const currentMonth = new Date(now.getFullYear(), now.getMonth() + page, 1);
        rangeStart = currentMonth;
        rangeEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      }
    }

    const filtered = allData.filter(entry => {
      const entryDate = new Date(entry.date);
      return entryDate >= rangeStart && entryDate <= rangeEnd;
    });

    setFilteredData(filtered);
  }, [allData, startDate, endDate, viewMode, page]);

  const getCurrentRangeLabel = (): string => {
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    let rangeStart: Date;
    let rangeEnd: Date;

    if (startDate && endDate) {
      rangeStart = startDate;
      rangeEnd = endDate;
    } else {
      const now = new Date();
      if (viewMode === 'week') {
        rangeStart = new Date(now);
        rangeStart.setDate(now.getDate() + page * 7);
        rangeEnd = new Date(rangeStart);
        rangeEnd.setDate(rangeStart.getDate() + 6);
      } else {
        rangeStart = new Date(now.getFullYear(), now.getMonth() + page, 1);
        rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);
      }
    }

    return `${formatDate(rangeStart)} → ${formatDate(rangeEnd)}`;
  };

  const exportCSV = () => {
    const csvRows = ['Date,Steps,RestingHeartRate'];
    filteredData.forEach((entry) => {
      csvRows.push(`${entry.date},${entry.steps ?? ''},${entry.resting_heart_rate ?? ''}`);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    saveAs(blob, 'fitbit_data.csv');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const rows = filteredData.map(entry => [entry.date, entry.steps ?? '-', entry.resting_heart_rate ?? '-']);
    autoTable(doc, {
      head: [['Date', 'Steps', 'Resting Heart Rate']],
      body: rows,
    });
    doc.save('fitbit_data.pdf');
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <Container fluid className="mt-4">
        <Row>
          <Col className="text-center">
            <h2>{patientName}</h2>
          </Col>
        </Row>

        {error && (
          <Row>
            <Col>
              <ErrorAlert message={error} onClose={() => setError('')} />
            </Col>
          </Row>
        )}

        <Row className="align-items-center mb-3">
          <Col className="d-flex justify-content-start">
            <DatePicker
              selected={startDate}
              onChange={(date: Date | null) => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              placeholderText="Start date"
              className="form-control"
            />
            <DatePicker
              selected={endDate}
              onChange={(date: Date | null) => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              placeholderText="End date"
              className="form-control ms-2"
            />
          </Col>

          <Col className="text-center">
            <div className="d-flex justify-content-center align-items-center mt-2">
              <Button variant="secondary" onClick={() => setPage(prev => prev - 1)}>←</Button>
              <span className="mx-3">{getCurrentRangeLabel()}</span>
              <Button variant="secondary" onClick={() => setPage(prev => prev + 1)}>→</Button>
            </div>
          </Col>

          <Col className="d-flex justify-content-end">
            <Button variant="outline-success" className="me-2" onClick={exportCSV}>Export CSV</Button>
            <Button variant="outline-danger" onClick={exportPDF}>Export PDF</Button>
          </Col>
        </Row>

        <Row className="mb-3">
          <Col className="text-center">
            <div className="d-flex justify-content-center align-items-center mt-2">
              <ToggleButtonGroup
                type="radio"
                name="viewMode"
                value={viewMode}
                onChange={(val) => {
                  setPage(0);
                  setViewMode(val);
                }}
              >
                <ToggleButton id="week" value="week">Week</ToggleButton>
                <ToggleButton id="month" value="month">Month</ToggleButton>
              </ToggleButtonGroup>
            </div>
          </Col>
        </Row>

        <Row className="mb-4">
          <Col md={6}>
            <h5>Steps</h5>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredData} syncId="fitbit-sync">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="steps" stroke="#8884d8" name="Steps" />
              </LineChart>
            </ResponsiveContainer>
          </Col>
          <Col md={6}>
            <h5>Resting Heart Rate</h5>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={filteredData} syncId="fitbit-sync">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="resting_heart_rate" stroke="#82ca9d" name="Resting HR" />
              </LineChart>
            </ResponsiveContainer>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default HealthPage;
