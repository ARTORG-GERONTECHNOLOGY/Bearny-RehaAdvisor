import React from 'react';
import { Button, Card, Col, Container, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useTranslation } from 'react-i18next';

const UnauthorizedAccess: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleGoBack = () => navigate(-1);
  const handleGoHome = () => navigate('/');

  return (
    <Container fluid className="d-flex flex-column min-vh-100 px-3 px-sm-4">
      {/* Header */}
      <Header isLoggedIn={false} />

      {/* Main Content */}
      <Container className="flex-grow-1 d-flex align-items-center justify-content-center py-4">
        <Row className="w-100 justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6} xl={5}>
