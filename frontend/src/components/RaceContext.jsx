import { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { WebSocketContext } from './WebSocketContext';
import { UserContext } from './UserContext';
import { PartyContext } from './PartyContext';

const RaceContext = createContext();

const RaceProvider = ({ children }) => {
    const [raceStarted, setRaceStarted] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const [racePrompt, setRacePrompt] = useState('');
    const [cursorPositions, setCursorPositions] = useState({});
    const lastPositionUpdate = useRef(0);
    const lastSentPosition = useRef(0);
    const positionUpdateInterval = useRef(null);

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
        setCursorPositions({});
        setRaceOver(false);

        // Clear the position update interval
        if (positionUpdateInterval.current) {
            clearInterval(positionUpdateInterval.current);
            positionUpdateInterval.current = null;
        }
        lastSentPosition.current = 0;
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
        setCursorPositions({});
    }, []);

    // Submit race completion results
    const finishRace = useCallback((promptLength, timeTakenMs) => {
        if (!user || !partyCode) return;

        // Calculate WPM clientside only for display  server calculates actual result
        const chars = promptLength;
        const minutes = timeTakenMs / 60000;
        const wpm = (chars / 5) / minutes;

        console.log(`Race finished: ${chars} chars in ${timeTakenMs}ms = ${wpm.toFixed(2)} WPM, sending to server`);
        sendMessage({
            type: 'finishRace',
            promptLength: chars,
            timeTakenMs: timeTakenMs,
            user: user,
        });

        // Clear the position update interval
        if (positionUpdateInterval.current) {
            clearInterval(positionUpdateInterval.current);
            positionUpdateInterval.current = null;
        }

        return wpm;
    }, [user, partyCode, sendMessage]);

    // Send cursor position update to server
    const updateCursorPosition = useCallback((position) => {
        if (!user || !partyCode || !raceStarted || countdown > 0) return;

        if (position !== lastSentPosition.current) {
            const now = Date.now();
            lastPositionUpdate.current = now;
            lastSentPosition.current = position;

            sendMessage({
                type: 'positionUpdate',
                position: position,
                party_code: partyCode,
                timestamp: now
            });
        }
    }, [user, partyCode, raceStarted, countdown, sendMessage]);

    // Cursor position updates
    useEffect(() => {
        if (raceStarted && countdown === 0 && user && partyCode) {
            if (positionUpdateInterval.current) {
                clearInterval(positionUpdateInterval.current);
            }

            // updates every 500ms if there's a change
            positionUpdateInterval.current = setInterval(() => {
                if (lastSentPosition.current > 0) {
                    const now = Date.now();
                    if (now - lastPositionUpdate.current > 500) {
                        sendMessage({
                            type: 'positionUpdate',
                            position: lastSentPosition.current,
                            party_code: partyCode,
                            timestamp: now
                        });
                        lastPositionUpdate.current = now;
                    }
                }
            }, 500);

            return () => {
                if (positionUpdateInterval.current) {
                    clearInterval(positionUpdateInterval.current);
                    positionUpdateInterval.current = null;
                }
            };
        }
    }, [raceStarted, countdown, user, partyCode, sendMessage]);

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

        // cursor position updates
        const unregisterCursorPositions = registerMessageHandler('cursorPositions', (message) => {
            console.log('Cursor positions update:', message.positions);
            setCursorPositions(message.positions);
        });

        return () => {
            unregisterStartRace();
            unregisterResetRace();
            unregisterCursorPositions();
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
            finishRace,
            updateCursorPosition,
            cursorPositions
        }}>
            {children}
        </RaceContext.Provider>
    );
};

export { RaceContext, RaceProvider };