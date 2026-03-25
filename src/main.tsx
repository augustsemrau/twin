// MCP guest JS must load before React mounts (patches addEventListener)
import 'tauri-plugin-mcp'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CaptureWindow } from './CaptureWindow'
import './App.css'

const root = document.getElementById('root')!

// Route based on hash — capture window uses #/capture
const isCaptureWindow = window.location.hash === '#/capture'

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {isCaptureWindow ? <CaptureWindow /> : <App />}
  </React.StrictMode>,
)
