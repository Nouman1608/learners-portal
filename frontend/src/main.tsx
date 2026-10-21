import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { applyBrand } from './brand'
import { loadAuthToken, initDisplayScale } from './native'
import { needsCampusChoice } from './appCampus'
import CampusChooser from './pages/CampusChooser'

applyBrand()
initDisplayScale()

// In the mobile app, read the saved login before the first request goes out.
loadAuthToken().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {/* The mobile app starts on its school chooser until a school is picked. */}
      {needsCampusChoice ? <CampusChooser /> : <App />}
    </React.StrictMode>,
  )
})
