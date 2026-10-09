import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Must run before App (and therefore before any store hydrates from
// localStorage), so renamed keys do not log users out or drop local drafts.
import { migrateLegacyLocalStorage } from './utils/storageMigration'
import './index.css'
import App from './App'
import { registerServiceWorker } from './serviceWorkerRegistration'

migrateLegacyLocalStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
