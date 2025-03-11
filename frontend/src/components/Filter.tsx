import React, { useState } from 'react';
import { Button } from 'react-bootstrap';
import { t } from 'i18next';
// @ts-ignore
const Filter = ({ dataType, setFilteredData }) => {
  const [age, setAge] = useState('');
  const [price, setPrice] = useState('');

  const handleFilter = () => {
    if (dataType === 'patients') {
      // Filter patients by age
      // @ts-ignore
      const filtered = data.patients.filter((patient) => patient.age >= age);
      setFilteredData(filtered);
    } else if (dataType === 'products') {
      // Filter products by price
      // @ts-ignore
      const filtered = data.products.filter((product) => product.price <= price);
      setFilteredData(filtered);
    }
  };

  return (
    <div className="filter-section">
      {dataType === 'patients' ? (
        <div>
          <label>{t("Filter by Age:</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder={t("Enter age")}
          />
        </div>
      ) : (
        <div>
          <label>{t("Filter by Price:")}</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={t("Enter max price")}
          />
        </div>
      )}
      <Button variant="primary" onClick={handleFilter}>
        {t("Apply Filter")}
      </Button>
    </div>
  );
};

export default Filter;
