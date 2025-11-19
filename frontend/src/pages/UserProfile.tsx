import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  OverlayTrigger,
  Row,
  Spinner,
  Tooltip,
} from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import InfoBubble from "../components/common/InfoBubble";
import Header from "../components/common/Header";
import Footer from "../components/common/Footer";
import EditUserInfo from "../components/UserProfile/EditTherapistInfo";
import DeleteConfirmation from "../components/UserProfile/DeleteConfirmation";
import StatusBanner from "../components/common/StatusBanner";

import authStore from "../stores/authStore";
import apiClient from "../api/client";
import { UserType } from "../types";

const UserProfile: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [userData, setUserData] = useState<UserType | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState("");
  const [successBanner, setSuccessBanner] = useState("");

  const therapistId = authStore?.id;

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated) {
      navigate("/");
    } else {
      fetchUserProfile();
    }
  }, [navigate, therapistId]);

  const fetchUserProfile = async () => {
    try {
      const response = await apiClient.get(`/users/${therapistId}/profile`);
      setUserData(response.data);
    } catch (err) {
      console.error("Profile load failed:", err);
      setErrorBanner(t("Failed to load user profile"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updatedUserData: UserType) => {
    try {
      await apiClient.put(`/users/${therapistId}/profile/`, updatedUserData);
      const refreshed = await apiClient.get(
        `/users/${therapistId}/profile`
      );
      setUserData(refreshed.data);

      setSuccessBanner(t("Profile updated successfully"));
      setTimeout(() => setSuccessBanner(""), 2500);
      setIsEditing(false);
    } catch (err: any) {
      console.error("Update failed:", err);
      setErrorBanner(t("Failed to update profile"));
      setTimeout(() => setErrorBanner(""), 3000);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/users/${therapistId}/profile/`);
      setSuccessBanner(t("Account deleted successfully"));
      setTimeout(() => setSuccessBanner(""), 2000);

      authStore.deleteUser();
      localStorage.clear();
      navigate("/");
    } catch (err) {
      console.error("Delete failed:", err);
      setErrorBanner(t("Failed to delete account"));
      setTimeout(() => setErrorBanner(""), 3000);
    }
  };

  const renderProfileDetails = () => (
    <>
      <h4 className="text-center mb-4">
        {userData?.first_name} {userData?.name}
      </h4>

      <p><strong>{t("Email")}:</strong> {userData?.email}</p>
      <p><strong>{t("Phone")}:</strong> {userData?.phone}</p>

      {authStore.userType === "Therapist" && (
        <>
          <p>
            <strong>{t("Specialization")}:</strong>{" "}
            {userData?.specializations?.length
              ? userData.specializations.join(", ")
              : t("None")}
            <InfoBubble tooltip={t("Therapist’s areas of clinical expertise")} />
          </p>

          <p>
            <strong>{t("Clinics")}:</strong>{" "}
            {userData?.clinics?.length
              ? userData.clinics.join(", ")
              : t("None")}
            <InfoBubble tooltip={t("Affiliated institutions")} />
          </p>
        </>
      )}

      <div className="d-flex justify-content-between mt-4">
        <Button variant="primary" onClick={() => setIsEditing(true)}>
          {t("Edit Info")}
        </Button>
        <Button variant="danger" onClick={() => setShowDeletePopup(true)}>
          {t("Delete Account")}
        </Button>
      </div>
    </>
  );

  return (
    <Container fluid className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={!!authStore.userType} />

      <StatusBanner
        type="danger"
        message={errorBanner}
        onClose={() => setErrorBanner("")}
      />

      <StatusBanner
        type="success"
        message={successBanner}
        onClose={() => setSuccessBanner("")}
      />

      <Container className="my-5 flex-grow-1">
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8} xl={6}>
            <Card className="shadow-sm">
              <Card.Header className="bg-primary text-white text-center">
                <h2>{t("User Profile")}</h2>
              </Card.Header>

              <Card.Body>
                {loading ? (
                  <div className="text-center my-4">
                    <Spinner animation="border" />
                    <p className="mt-3">{t("Loading")}...</p>
                  </div>
                ) : isEditing && userData ? (
                  <EditUserInfo
                    userData={userData}
                    onSave={handleSave}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  userData && renderProfileDetails()
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {showDeletePopup && (
        <DeleteConfirmation
          show={showDeletePopup}
          handleClose={() => setShowDeletePopup(false)}
          handleConfirm={handleDelete}
        />
      )}

      <Footer />
    </Container>
  );
};

export default UserProfile;
