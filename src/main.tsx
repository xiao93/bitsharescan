import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadNetworkState, persistNetworkState } from './lib/network.ts'
import './lib/theme.ts'

persistNetworkState(loadNetworkState())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
