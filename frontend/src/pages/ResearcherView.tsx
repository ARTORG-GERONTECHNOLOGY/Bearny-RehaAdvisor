import React, { useState, useEffect } from 'react';
import { Button, Table } from 'react-bootstrap';
import PatientPopup_re from '../components/PatientPopup_re';
import ProductPopup from '../components/ProductPopup';
import Filter from '../components/Filter';
import { exportToCSV } from '../utils/csvExport';
import { useNavigate } from 'react-router-dom'; // for redirecting unauthorized users
import authStore from '../stores/authStore';

const ResearcherView: React.FC = () => {
  const navigate = useNavigate(); // used for navigation
  const [showPopup, setShowPopup] = useState(false);
  const [currentItem, setCurrentItem] = useState(null); // Current patient/product for the popup
  const [dataType, setDataType] = useState('patients'); // Can be 'patients' or 'products'
  const [filteredData, setFilteredData] = useState({
    patients: [],
    products: [],
  }); // Data to display, filtered based on filters
  const [loading, setLoading] = useState(true); // Loading state for authentication check

  // Example data for patients and products
  const data = {
    patients: [
      { name: 'John Doe', age: 25, feedback: 'Good product', recommendations: ['Recom1', 'Recom2'] },
      { name: 'Jane Smith', age: 30, feedback: 'Satisfactory', recommendations: ['Recom3'] }
    ],
    products: [
      { name: 'Product A', price: 50, stars: 4.5, feedback: 'Very effective' },
      { name: 'Product B', price: 30, stars: 3.8, feedback: 'Average' }
    ]
  };

  // Handle row click to open a popup
  const handleRowClick = (item: any) => {
    setCurrentItem(item);
    setShowPopup(true);
  };

  // Handle exporting the filtered data to CSV
  const handleExportCSV = () => {
    exportToCSV(filteredData, dataType === 'patients' ? 'patients.csv' : 'products.csv');
  };

  // Access control: Check if the user is authorized
  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Researcher') {
      navigate('/unauthorized');  // Redirect to UnauthorizedAccess if not a researcher
    } else {
      // @ts-ignore
      setFilteredData(data); // Populate filtered data once authentication is confirmed
      setLoading(false); // Set loading to false after authentication check
    }
  }, [navigate]);

  // Show a loading message or spinner while authentication check is in progress
  if (loading) {
    return <div>Loading...</div>;
  }


  return (
    <div>
      <h1>Researcher Dashboard</h1>

      {/* Filter Component */}
      <Filter dataType={dataType} setFilteredData={setFilteredData} />

      {/* Toggle between patients and products */}
      <div>
        <Button variant="outline-primary" onClick={() => setDataType('patients')}>Patients</Button>
        <Button variant="outline-secondary" onClick={() => setDataType('products')}>Products</Button>
      </div>

      {/* Table Display */}
      <Table striped bordered hover>
        <thead>
        <tr>
          {dataType === 'patients' ? (
            <>
              <th>Name</th>
              <th>Age</th>
              <th>Feedback</th>
            </>
          ) : (
            <>
              <th>Product</th>
              <th>Price</th>
              <th>Stars</th>
            </>
          )}
        </tr>
        </thead>
        <tbody>
        {// @ts-ignore
          filteredData[dataType].map((item: any, index: number) => (
          <tr key={index} onClick={() => handleRowClick(item)}>
            {dataType === 'patients' ? (
              <>
                <td>{item.name}</td>
                <td>{item.age}</td>
                <td>{item.feedback}</td>
              </>
            ) : (
              <>
                <td>{item.name}</td>
                <td>${item.price}</td>
                <td>{item.stars}</td>
              </>
            )}
          </tr>
        ))}
        </tbody>
      </Table>

      {/* Export CSV Button */}
      <Button variant="success" onClick={handleExportCSV}>
        Export to CSV
      </Button>

      {/* Pop-up to show details about patient/product 
      {dataType === 'patients' ? (
        <PatientPopup_re show={showPopup} item={currentItem} handleClose={() => setShowPopup(false)} />
      ) : (
        <ProductPopup show={showPopup} item={currentItem} handleClose={() => setShowPopup(false)} therapist={'t1'} />
      )}*/}
    </div>
  );
};

export default ResearcherView;
