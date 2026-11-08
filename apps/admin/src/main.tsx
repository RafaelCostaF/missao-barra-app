import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';
import { FeedbackHost } from './components/Feedback';

createRoot(document.getElementById('root')!).render(<StrictMode><App /><FeedbackHost /></StrictMode>);
