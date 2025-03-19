import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { WebSocketContext } from './WebSocketContext';
import { UserContext } from './UserContext';
import { PartyContext } from './PartyContext';

const RaceContext = createContext();

const RaceProvider = ({ children }) => {
    const [raceStarted, setRaceStarted] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const [racePrompt, setRacePrompt] = useState('');

    const { isConnected, sendMessage, registerMessageHandler } = useContext(WebSocketContext);
    const { user } = useContext(UserContext);
    const { partyCode, isPartyLeader, setRaceOver, setMessage } = useContext(PartyContext);

    // Only leader can start race
    const initiateRace = useCallback(() => {
        if (!isPartyLeader || !partyCode) {
            console.log('Cannot start race: not leader or no party code');
            return false;
        }

        const success = sendMessage({ type: 'startRace', code: partyCode });
        if (success) {
            console.log('Race start request sent');
        }
        return success;
    }, [isPartyLeader, partyCode, sendMessage]);

    // Reset the race locally
    const resetRace = useCallback(() => {
        setRaceStarted(false);
        setCountdown(5);
        setRacePrompt('');
        setRaceOver(false);
    }, [setRaceOver]);

    // Reset race for everyone (leader only)
    const resetPartyRace = useCallback(() => {
        if (!isPartyLeader || !partyCode) {
            console.log('Cannot reset race: not leader or no party code');
            return false;
        }

        resetRace();
        const success = sendMessage({ type: 'resetRace', code: partyCode });
        return success;
    }, [isPartyLeader, partyCode, sendMessage, resetRace]);

    // Start the race based on server message
    const startRace = useCallback(() => {
        setRaceStarted(true);
    }, []);

    // Submit race completion results
    const finishRace = useCallback((wpm) => {
        if (!user || !partyCode) return;

        console.log(`Race finished with ${wpm} WPM, sending to server`);
        sendMessage({
            type: 'finishRace',
            wpm: wpm,
            user: user,
        });
    }, [user, partyCode, sendMessage]);

    // Register message handlers for race events
    useEffect(() => {
        if (!isConnected) return;

        // race start messages
        const unregisterStartRace = registerMessageHandler('startRace', (message) => {
            console.log('Race starting with prompt:', message.prompt);
            startRace();
            setRacePrompt(message.prompt);
            setMessage('Race started!');
        });

        // race reset messages
        const unregisterResetRace = registerMessageHandler('resetRace', () => {
            console.log('Race reset received');
            resetRace();
            setMessage('Race has been reset.');
        });

        return () => {
            unregisterStartRace();
            unregisterResetRace();
        };
    }, [isConnected, registerMessageHandler, startRace, resetRace, setMessage]);

    useEffect(() => {
        let timerId;

        if (raceStarted && countdown > 0) {
            timerId = setInterval(() => {
                setCountdown(prev => prev - 1);
            }, 1000);
        }

        return () => {
            clearInterval(timerId);
        };
    }, [raceStarted, countdown]);

    return (
        <RaceContext.Provider value={{
            raceStarted,
            countdown,
            setCountdown,
            racePrompt,
            setRacePrompt,
            startRace,
            resetRace,
            initiateRace,
            resetPartyRace,
            finishRace
        }}>
            {children}
        </RaceContext.Provider>
    );
};

export { RaceContext, RaceProvider };