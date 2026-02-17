import React from 'react';
import i18n from '../i18n'; // Import the i18n config
import { createRoot } from 'react-dom/client';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { StoreProvider } from './stores/StoreProvider';
import { I18nextProvider } from 'react-i18next';
import { Router } from './routes';
import './assets/styles/index.css'; // Ensure this import is correct
import './assets/styles/custom-bootstrap.scss'; // Custom Bootstrap overrides

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <Router />
    </I18nextProvider>
  </React.StrictMode>
);
