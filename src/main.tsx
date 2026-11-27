import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadNetworkState, persistNetworkState } from './lib/network.ts'
import './lib/theme.ts'
import { getLanguage } from './lib/locale.ts'
import { loadLocale } from './lib/i18n.tsx'

persistNetworkState(loadNetworkState())

void loadLocale(getLanguage()).catch(() => undefined).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
