import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './components/App';
import ErrorBoundary from './components/ErrorBoundary';
import { ENDPOINTS } from './config/api';
import { installErrorReporter } from './telemetry/errorReporter';

installErrorReporter({ url: ENDPOINTS.clientErrors, apiKey: process.env.REACT_APP_API_KEY });

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
