import React from 'react'
import './browser-api'
import { createRoot } from 'react-dom/client'
import AuthGate from './AuthGate'
import './styles.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthGate /></React.StrictMode>)
