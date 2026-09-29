import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';
import './locales/i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Without this, any render error unmounts the entire tree and the user is
        left staring at a blank page with nothing in the console they can see. */}
    <ErrorBoundary>
      <AuthProvider><App /></AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);