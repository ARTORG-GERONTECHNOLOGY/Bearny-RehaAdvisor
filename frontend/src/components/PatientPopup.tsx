import React, { useEffect, useState } from "react";
import { Button, Col, Form, Modal, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Select from "react-select";
import apiClient from "../api/client";
import authStore from "../stores/authStore";
import config from "../config/config.json";
import { t } from 'i18next';

const PatientPopup = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [patient, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState("");
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
// Extract Specialities & Diagnoses from JSON Config
const specialityDiagnosisMap: Record<string, string[]> = config.patientInfo.functionPat;

  useEffect(() => {
    if (authStore.isAuthenticated && authStore.userType === "Therapist" && patient_id) {
      const fetchPatientData = async () => {
        try {
          setLoading(true);
          const response = await apiClient.get(`users/${patient_id.username}/profile/`);
          setPatientData(response.data);
          setFormData(response.data);
        } catch (error) {
          console.error("Error fetching patient data", error);
        } finally {
          setLoading(false);
        }
      };
      fetchPatientData();
    }
  }, [patient_id]);

   // 🔹 Handle Input Changes
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { id, value } = e.target;
      setFormData({ ...formData, [id]: value });
    };
  
    // 🔹 Handle Multi-Select Changes
    const handleMultiSelectChange = (selectedOptions: any, fieldName: string) => {
      const selectedValues = selectedOptions ? selectedOptions.map((option: any) => option.value) : [];
      setFormData({ ...formData, [fieldName]: selectedValues });
  
      if (fieldName === "function") {
        setFormData({ ...formData, function: selectedValues, diagnosis: [] });
      }
    };

  const validateInputs = () => {
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(t("Invalid email format."));
      return false;
    }
    if (formData.phone && !/^\+?[0-9]{7,15}$/.test(formData.phone)) {
      setError(t("Invalid phone number format."));
      return false;
    }
    setError("");
    return true;
  };

  const handleSave = async () => {
    if (!validateInputs()) return;
    try {
      await apiClient.put(`users/${patient_id.username}/profile/`, formData);
      setPatientData(formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating patient data", error);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`users/${patient_id.username}/profile/`);
      handleClose();
    } catch (error) {
      console.error("Error deleting patient data", error);
    }
  };

  if (!patient_id || loading) {
    return <p>{t("Loading")}</p>;
  }

  return (
    <>
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title>{formData.name || "Patient"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
      {error && <p className="text-danger">{error}</p>}
        {config.PatientForm.map((section, idx) => (
          <div key={idx}>
            <h5 className="mb-3">{t(section.title)}</h5>
            <Row>
              {section.fields.filter(field => field.type !== "password" && field.type !== "repeatPassword").map((field, fieldIdx) => (
                <Col md={6} key={fieldIdx}>
                  <Form.Group className="mb-2">
                    <Form.Label>{t(field.label)}</Form.Label>
                    {field.be_name === "reha_end_date" ? (
                      <Form.Control
                        type="date"
                        name={field.be_name}
                        value={formData[field.be_name] ? new Date(formData[field.be_name]).toISOString().split('T')[0] : ""}
                        onChange={handleChange}
                        disabled={!isEditing}
                        />
                      ) :
                        field.be_name === "access_word" ? (
                      <Form.Control
                        type="text"
                        name={field.be_name}
                        value={formData[field.be_name] || ""}
                        disabled
                        required={field.required}
                      />
                    ) : field.type === "multi-select" ? (
                      <Select
                        id={field.be_name}
                        isMulti
                        options={
                          field.be_name === "diagnosis" && formData.function.length > 0
                            ? formData.function.flatMap(speciality =>
                                specialityDiagnosisMap[speciality]?.map(diag => ({
                                  value: diag, // Real value (e.g., code)
                                  label: t(diag), // Display label (e.g., description)
                                })) || []
                              )
                            : field.options?.map(option => ({
                                value: option,
                                label: t(option), // Use label mapping if available
                              }))
                        }
                        defaultValue={(formData[field.be_name] as string[]).map(value => ({
                          value, // Real value stored
                          label:  t(value), // Display the readable label
                        }))}
                        onChange={(selectedOptions) =>
                          handleMultiSelectChange(selectedOptions, field.be_name)
                        }
                      />
                    ) : field.type === "dropdown" ? (
                      <Form.Select
                        name={field.be_name}
                        defaultValue={formData[field.be_name] || ""}
                        onChange={handleChange}
                        disabled={!isEditing}
                        required={field.required}
                      >
                        <option value="">{t("Selectanoption")}</option>
                        {field.options.map((option) => (
                          <option key={option} value={t(option)}>{t(option)}</option>
                        ))}
                      </Form.Select>
                    ) : (
                      <Form.Control
                        type={field.type}
                        name={field.be_name}
                        defaultValue={t(formData[field.be_name] )|| ""}
                        onChange={handleChange}
                        required={field.required}
                        disabled={!isEditing}
                      />
                    )}
                  </Form.Group>
                </Col>
              ))}
            </Row>
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        {isEditing ? (
          <>
           
            <Button variant="secondary" onClick={() => setIsEditing(false)}>{t("Cancel")}</Button>
            <Button variant="success" onClick={handleSave}>{t("SaveChanges")}</Button>
          </>
        ) : (
          <>
          <Button variant="warning" onClick={() => setIsEditing(true)}>{t("Edit")}</Button>
          <Button variant="danger" onClick={() => setShowConfirmDelete(true)}>{t("DeletePatient")}</Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
      <Modal show={showConfirmDelete} onHide={() => setShowConfirmDelete(false)} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t("ConfirmDeletion")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t("DeleteConfirPAt")}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowConfirmDelete(false)}>{t("Cancel")}</Button>
        <Button variant="danger" onClick={handleDelete}>{t("Delete")}</Button>
      </Modal.Footer>
    </Modal>
  </>
  );
};

export default PatientPopup;
