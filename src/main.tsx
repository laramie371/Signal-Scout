import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

const handleMainProcessMessage = (message: unknown) => {
  console.log(message)
}

if (window.electronAPI?.on) {
  window.electronAPI.on('main-process-message', handleMainProcessMessage)
} else {
  console.error('Missing electronAPI.on', window.electronAPI)
}
