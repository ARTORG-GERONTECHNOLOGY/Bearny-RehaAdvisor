import React, { useState } from 'react';
import { Button } from 'react-bootstrap';

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
          <label>Filter by Age:</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Enter age"
          />
        </div>
      ) : (
        <div>
          <label>Filter by Price:</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Enter max price"
          />
        </div>
      )}
      <Button variant="primary" onClick={handleFilter}>
        Apply Filter
      </Button>
    </div>
  );
};

export default Filter;
