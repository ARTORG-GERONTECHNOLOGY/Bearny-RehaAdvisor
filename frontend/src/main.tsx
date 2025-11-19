import React from 'react';
import i18n from '../i18n'; // Import the i18n config
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

import { I18nextProvider } from 'react-i18next';
import { Router } from './routes';
import './assets/styles/index.css'; // Ensure this import is correct
import 'bootstrap/dist/css/bootstrap.min.css'; // Keep Bootstrap if used

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <React.StrictMode>
        <Router />
      </React.StrictMode>
    </I18nextProvider>
  </React.StrictMode>
);
