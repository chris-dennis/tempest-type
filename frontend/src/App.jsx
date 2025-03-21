import './App.css'
import './components/RaceBox.jsx'

import {Routes, Route, BrowserRouter} from 'react-router-dom';
import {RaceProvider} from "./components/RaceContext.jsx";
import {WebSocketProvider} from "./components/WebSocketContext.jsx";
import Footer from "./components/footer.jsx";
import {UserProvider} from "./components/UserContext.jsx";
import {PartyProvider} from "./components/PartyContext.jsx";
import HomePage from "./components/HomePage.jsx";
import PartyPage from "./components/PartyPage.jsx";
import GlobalLeaderboard from "./components/GlobalLeaderboard.jsx";

function App() {
    return (
        <BrowserRouter>
            <WebSocketProvider>
                <UserProvider>
                    <PartyProvider>
                        <RaceProvider>
                            <div className="main-content">
                                <Routes>
                                    <Route path="/" element={<HomePage />} />
                                    <Route path="/party" element={<PartyPage />} />
                                </Routes>
                                <GlobalLeaderboard />
                            </div>
                            <Footer />
                        </RaceProvider>
                    </PartyProvider>
                </UserProvider>
            </WebSocketProvider>
        </BrowserRouter>
    );
}

export default App
