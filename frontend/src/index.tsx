import React from 'react';
import './index.css';
import * as serviceWorker from './serviceWorker';
import i18n from './i18n'; // Import the i18n config
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import { I18nextProvider } from 'react-i18next';
import { Router } from './routes';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <React.StrictMode>
        <Router />
      </React.StrictMode>
    </I18nextProvider>,
  </React.StrictMode>,
);


// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
