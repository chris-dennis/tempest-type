import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WebSocketContext } from './WebSocketContext.jsx';
import { RaceContext } from './RaceContext.jsx';

function WebSocket() {
    const [isPartyLeader, setPartyLeader] = useState(false);
    const [partyCode, setPartyCode] = useState(null);
    const [partyMembers, setPartyMembers] = useState([]);
    const [code, setCode] = useState('');
    const [leaderboard, setLeaderboard] = useState([]);
    const [raceOver, setRaceOver] = useState(false);
    const [raceStarted, setRaceStarted] = useState(false);

    const { ws, isConnected, sendWebSocketMessage, user } = useContext(WebSocketContext);
    const { startRace, setRacePrompt, racePrompt, resetRace } = useContext(RaceContext);
    const navigate = useNavigate();

    const colorsRef = useRef({});

    const generateRandomColor = () => {
        return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
    };

    const assignColorsToMembers = (members) => {
        const newColors = { ...colorsRef.current };
        members.forEach(member => {
            if (!newColors[member.id]) {
                const color = generateRandomColor();
                newColors[member.id] = { backgroundColor: color};
            }
        });
        colorsRef.current = newColors;
    };


    useEffect(() => {
        if (ws) {
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                console.log('Received message:', message);

                switch (message.type) {
                    case 'partyUpdate':
                        setPartyCode(message.code);
                        setPartyMembers(message.partyMembers);
                        assignColorsToMembers(message.partyMembers);
                        navigate(`/party?code=${message.code}`);
                        setPartyLeader(false);
                        if (message.leader === user.id) {
                            setPartyLeader(true);
                        }
                        if (message.partyMembers.length === 1) {
                            setPartyLeader(true);
                        }
                        break;
                    case 'userJoined':
                        setPartyCode(message.code);
                        setPartyMembers(message.partyMembers);
                        assignColorsToMembers(message.partyMembers);
                        break;
                    case 'startRace':
                        startRace();
                        setRaceStarted(true);
                        setRacePrompt(message.prompt);
                        break;
                    case 'leaderboardUpdate':
                        setLeaderboard(message.leaderboard);
                        setRaceOver(true);
                        break;
                    case 'resetRace':
                        setRaceStarted(false);
                        setLeaderboard([]);
                        setRaceOver(false);
                        resetRace();
                        break;
                    default:
                        break;
                }
            };
        }
    }, [ws, navigate, startRace, setRacePrompt, racePrompt]);

    const handleCreateParty = () => {
        sendWebSocketMessage({ type: 'createParty' });
        setPartyLeader(true);
    };

    const handleJoinParty = () => {
        if (code) {
            sendWebSocketMessage({ type: 'joinParty', code: code });
            setCode('');
        }
    };

    const handleStartRace = () => {
        if (isPartyLeader) {
            sendWebSocketMessage({ type: 'startRace', code: code });
        }
    };

    const handleRestart = () => {
        if (isPartyLeader) {
            setRaceStarted(false);
            setLeaderboard([]);
            resetRace();
            sendWebSocketMessage({ type: 'resetRace', code: code });
        }
    };

    return (
        <>{isConnected ?
            <div>
                {!partyCode && (
                    <div id='partycontrols'>
                        <h3>Create or join a party to get started</h3>
                        <button onClick={handleCreateParty}>Create Party</button>
                        <input
                            id="party-code"
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Enter Party Code"
                        />
                        <button onClick={handleJoinParty}>Join Party</button>
                    </div>
                )}

                {partyCode && (
                    <div>
                        {raceStarted ? (
                            <button onClick={handleRestart}>Clear Race</button>
                        ) : (
                            <button onClick={handleStartRace}>Start Race</button>
                        )}
                        <div className="party">
                            <h3>Party:</h3>
                            <div className="party-members-container">
                                {partyMembers.map((member, index) => (
                                    <div
                                        key={index}
                                        className="party-member"
                                        style={{
                                            backgroundColor: colorsRef.current[member.id].backgroundColor,
                                            color: colorsRef.current[member.id].textColor
                                        }}>
                                        {member.nickname}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="leaderboard-container">
                            <h2>Party Code: {partyCode}</h2>
                            {raceOver && (
                                <div>
                                    <ul id='leaderboard'>
                                        <h3>Winners:</h3>
                                        {leaderboard
                                            .slice()
                                            .sort((a, b) => b.finish_time - a.finish_time)
                                            .map((entry, index) => (
                                                <li key={index}>
                                                    {entry.user_id.nickname}: {entry.finish_time} wpm
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div> : <h2> Backend service unavailable </h2>}
        </>
    );
}

export default WebSocket;