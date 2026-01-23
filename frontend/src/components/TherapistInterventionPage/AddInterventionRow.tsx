import React from 'react';
import { Row, Col, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

type Props = {
  onAdd: () => void;
};

const AddInterventionRow: React.FC<Props> = ({ onAdd }) => {
  const { t } = useTranslation();

  return (
    <Row className="mb-3">
      <Col xs={12} md="auto">
        <Button onClick={onAdd} variant="primary">
          {t('Add Intervention')}
        </Button>
      </Col>
    </Row>
  );
};

export default AddInterventionRow;
