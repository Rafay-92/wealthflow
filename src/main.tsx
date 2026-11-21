import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import './index.css'
import { useFinanceStore } from './store/financeStore'

// Start loading saved data from IndexedDB straight away, in parallel with the first render.
void useFinanceStore.getState().load()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('WealthFlow: #root element missing from index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
