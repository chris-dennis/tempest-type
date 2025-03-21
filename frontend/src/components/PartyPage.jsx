import RaceBox from './RaceBox';
import PartyManager from './PartyManager';
import GlobalLeaderboard from "./GlobalLeaderboard.jsx";

function PartyPage() {
    return (
        <div className="container">
            <RaceBox />
            <PartyManager />
            <GlobalLeaderboard />
        </div>
    );
}

export default PartyPage;
