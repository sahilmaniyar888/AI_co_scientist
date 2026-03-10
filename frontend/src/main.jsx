import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'rgba(8, 13, 28, 0.92)',
          color: '#e2e8f0',
          border: '1px solid rgba(148, 163, 184, 0.18)',
        },
      }}
    />
  </React.StrictMode>
)
