import './App.css'
import './components/racebox.jsx'
import Racebox from "./components/racebox.jsx";
import WebSocket from "./components/WebSocket.jsx";

import { Routes, Route } from 'react-router-dom';
import {RaceProvider} from "./components/RaceContext.jsx";
import {WebSocketProvider} from "./components/WebSocketContext.jsx";
import Footer from "./components/footer.jsx";

function App() {
  return (
      <>
          <WebSocketProvider>
              <RaceProvider>
                <Racebox></Racebox>

                <Routes>
                  <Route path="/" element={<WebSocket />} />
                  <Route path="/party" element={
                  <>
                      <WebSocket />
                  </>
                  } />
                </Routes>
              </RaceProvider>
              <Footer />
          </WebSocketProvider>
      </>
  );
}

export default App
