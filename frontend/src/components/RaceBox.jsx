import { useState, useEffect, useRef, useContext } from 'react';
import { UserContext } from './UserContext';
import { WebSocketContext } from './WebSocketContext';
import { RaceContext } from './RaceContext';
import { PartyContext } from './PartyContext';
import Typewriter from 'typewriter-effect/dist/core';
import UserStats from './UserStats';

function RaceBox() {
    const [userInput, setUserInput] = useState('');
    const [firstMistakeIndex, setFirstMistakeIndex] = useState(-1);
    const [startTime, setStartTime] = useState(null);
    const [endTime, setEndTime] = useState(null);
    const [currentWPM, setCurrentWPM] = useState(0);
    const inputRef = useRef(null);

    const { user } = useContext(UserContext);
    const { isConnected } = useContext(WebSocketContext);
    const { setRaceOver } = useContext(PartyContext);
    const {
        raceStarted,
        countdown,
        racePrompt,
        finishRace
    } = useContext(RaceContext);
    const hasSentFinish = useRef(false);

    // Initialize typewriter effect
    useEffect(() => {
        if (isConnected) {
            const typewriter = new Typewriter('#typewriter', {
                loop: false,
            });

            typewriter.typeString('Tempest Type').start();
        }
    }, [isConnected]);

    useEffect(() => {
        if (!raceStarted) {
            setUserInput('');
            setFirstMistakeIndex(-1);
            setStartTime(null);
            setEndTime(null);
            setCurrentWPM(0);
            hasSentFinish.current = false;
        }
    }, [raceStarted]);

    // Start timer after countdown
    useEffect(() => {
        if (raceStarted && countdown === 0) {
            setStartTime(Date.now());
            inputRef.current?.focus();
        }
    }, [raceStarted, countdown]);

    // Checking for race completion
    useEffect(() => {
        if (userInput === racePrompt && racePrompt !== "") {
            setEndTime(Date.now());
            setRaceOver(true);
        }
    }, [userInput, racePrompt, setRaceOver]);


    useEffect(() => {
        if (endTime && startTime && user && racePrompt && !hasSentFinish.current) {
            const timeTaken = (endTime - startTime) / 60000;
            const wordsTyped = racePrompt.split(' ').length;
            const wpm = wordsTyped / timeTaken;

            setCurrentWPM(wpm);
            finishRace(wpm);
            hasSentFinish.current = true;
        }
    }, [endTime, startTime, user, racePrompt, finishRace]);

    const handleInputChange = (e) => {
        if (endTime) return;

        setUserInput(e.target.value);

        if (firstMistakeIndex === -1 && e.target.value !== racePrompt.slice(0, e.target.value.length)) {
            for (let i = 0; i < e.target.value.length; i++) {
                if (e.target.value[i] !== racePrompt[i]) {
                    setFirstMistakeIndex(i);
                    break;
                }
            }
        }
    };

    const renderHighlightedText = () => {
        const chars = [];
        let firstMistakeIndex = -1;
        let highlight = false;

        for (let i = 0; i < racePrompt.length; i++) {
            if (i < userInput.length) {
                if (userInput[i] !== racePrompt[i] && firstMistakeIndex === -1) {
                    highlight = true;
                    firstMistakeIndex = i;
                }

                chars.push(
                    <span
                        key={i}
                        style={{
                            background: highlight ? "red" : "lightgreen",
                            color: highlight ? "white" : "black",
                            textDecoration: i === firstMistakeIndex ? "underline" : "none",
                        }}
                    >
                        {racePrompt[i]}
                    </span>
                );
            } else {
                chars.push(<span key={i}>{racePrompt[i]}</span>);
            }
        }

        return chars;
    };

    return (
        <>
            <a href="/"><div className="typewriter" id="typewriter"></div></a>
            {isConnected ? (
                <div className="top">
                    {user && <UserStats />}

                    <div className="prompt-box">
                        <div id="countdown">
                            {raceStarted && countdown > 0 && <h2>{countdown}</h2>}
                        </div>
                        <div className="prompt">
                            {raceStarted ? renderHighlightedText() :
                                <div style={{textAlign: "center"}}>Waiting for Prompt...</div>}
                        </div>
                        <input
                            type="text"
                            ref={inputRef}
                            value={userInput}
                            onChange={handleInputChange}
                            id="input-box"
                            disabled={!raceStarted || countdown > 0 || endTime !== null}
                            placeholder="Type here (auto-focus when countdown ends)"
                            autoComplete="off"
                            onPaste={(e) => {
                                e.preventDefault();
                                return false;
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                return false;
                            }}
                        />
                    </div>
                    {endTime && <p>Your WPM: {currentWPM.toFixed(2).replace(".00", "")}</p>}
                </div>
            ) : (
                <h1></h1>
            )}
        </>
    );
}

export default RaceBox;