import { useState, useContext } from 'react';
import { WebSocketContext } from './WebSocketContext';
import { UserContext } from './UserContext';
import { PartyContext } from './PartyContext';
import { RaceContext } from './RaceContext';

function PartyManager() {
    const [joinCode, setJoinCode] = useState('');

    const { isConnected } = useContext(WebSocketContext);
    const { user } = useContext(UserContext);
    const {
        partyCode,
        partyMembers,
        isPartyLeader,
        leaderboard,
        raceOver,
        message,
        isLoading,
        setMessage,
        createParty,
        joinParty,
        getMemberColor,
        getMemberSessionWins,
        leader,
        showOtherCursors,
        setShowOtherCursors
    } = useContext(PartyContext);

    const {
        raceStarted,
        initiateRace,
        resetPartyRace
    } = useContext(RaceContext);

    const handleCreateParty = () => {
        createParty();
    };

    const handleJoinParty = () => {
        joinParty(joinCode);
        setJoinCode('');
    };

    const handleStartRace = () => {
        if (initiateRace()) {
            setMessage('Starting race...');
        } else {
            setMessage('Only the party leader can start the race');
        }
    };

    const handleRestart = () => {
        if (resetPartyRace()) {
            setMessage('Resetting race...');
        } else {
            setMessage('Only the party leader can reset the race');
        }
    };

    const renderSessionWins = (memberId) => {
        const wins = getMemberSessionWins(memberId);
        if (wins > 0) {
            return (
                <span className="session-wins">
                    <span className="gold-star">⭐</span>
                    {wins}
                </span>
            );
        }
        return null;
    };

    const handleToggleCursors = (e) => {
        setShowOtherCursors(e.target.checked);
    };

    return (
        <>
            {isConnected && partyCode && isLoading && (
                <div className="url-joining-message">
                    <div className="mini-spinner"></div>
                    <p>Connecting to party {partyCode}...</p>
                </div>
            )}
            {isConnected ? (
                <div>
                    {message && (
                        <div className={`message-container ${message ? 'has-message' : ''}`}>
                            {message && <p>{message}</p>}
                        </div>
                    )}

                    {!partyCode && (
                        <div id='partycontrols'>
                            <h3>Create or join a party to get started</h3>
                            <button onClick={handleCreateParty}>Create Party</button>
                            <input
                                id="party-code"
                                type="text"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                placeholder="Enter Party Code"
                            />
                            <button onClick={handleJoinParty}>Join Party</button>
                        </div>
                    )}

                    {partyCode && (
                        <div>
                            {raceStarted ? (
                                <button onClick={handleRestart} disabled={!isPartyLeader}>
                                    {isPartyLeader ? 'Clear Race' : 'Waiting for leader to clear race'}
                                </button>
                            ) : (
                                <button onClick={handleStartRace} disabled={!isPartyLeader}>
                                    {isPartyLeader ? 'Start Race' : 'Waiting for leader to start race'}
                                </button>
                            )}

                            <div className="party">
                                <h3>Party: {partyCode}</h3>
                                <div className="party-members-container">
                                    {partyMembers.length > 0 ? (
                                        partyMembers.map((member) => (
                                            member && member.id ? (
                                                <div
                                                    key={member.id}
                                                    className="party-member"
                                                    style={{
                                                        backgroundColor: getMemberColor(member.id)
                                                    }}>
                                                    {member.nickname || 'Anonymous'}
                                                    {member.id === user?.id ? ' (You)' : ''}
                                                    {member.id === leader ? ' 👑' : ''}
                                                    {renderSessionWins(member.id)}
                                                </div>
                                            ) : null
                                        ))
                                    ) : (
                                        <div>Waiting for players to join...</div>
                                    )}
                                </div>

                                <div className="cursor-option">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={showOtherCursors}
                                            onChange={handleToggleCursors}
                                        />
                                        Show other users progress
                                    </label>
                                </div>
                            </div>

                            {raceOver && leaderboard.length > 0 && (
                                <div className="leaderboard-container">
                                    <h2>Party Code: {partyCode}</h2>
                                    <div>
                                        <ul id='leaderboard'>
                                            <h3>Winners:</h3>
                                            {leaderboard
                                                .slice()
                                                .map((entry, index) => (
                                                    <li key={index}>
                                                        {entry.user?.nickname || 'Anonymous'}: {entry.wpm.toFixed(1)} WPM
                                                    </li>
                                                ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <h2>Connecting to server...</h2>
            )}
        </>
    );
}

export default PartyManager;