import { createContext, useState } from 'react';


const RaceContext = createContext();

const RaceProvider = ({ children }) => {
    const [raceStarted, setRaceStarted] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const [racePrompt, setRacePrompt] = useState('');

    const resetRace = () => {
        setRaceStarted(false);
        setCountdown(5);
    };
    const startRace = () => {
        setRaceStarted(true);
    };

    const value = {
        raceStarted,
        countdown,
        setCountdown,
        startRace,
        racePrompt,
        setRacePrompt,
        resetRace
    };

    return (
        <RaceContext.Provider value={value}>
            {children}
        </RaceContext.Provider>
    );
};

export { RaceContext, RaceProvider };