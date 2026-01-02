import React from 'react';
import { createRoot } from 'react-dom/client';
import DriverView from './DriverView';  // Import the DriverView component directly
import './index.css';

// Extract truckId from URL parameters or localStorage
const urlParams = new URLSearchParams(window.location.search);
let truckId = urlParams.get('truckId');

if (!truckId) {
  // If not in URL, check if it was passed via localStorage
  truckId = localStorage.getItem('driverTruckId');
}

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <DriverView truckId={truckId} />
  </React.StrictMode>
);