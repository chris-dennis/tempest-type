import { useState, useEffect, useRef, useContext } from 'react';
import { RaceContext } from "./RaceContext.jsx";
import { WebSocketContext } from "./WebSocketContext.jsx";
import Typewriter from 'typewriter-effect/dist/core';

function RaceBox() {
    const [userInput, setUserInput] = useState('');
    const [firstMistakeIndex, setFirstMistakeIndex] = useState(-1);
    const [raceFinished, setRaceFinished] = useState(false);
    const [startTime, setStartTime] = useState(null);
    const [endTime, setEndTime] = useState(null);
    const [updatedUserStats, setUpdatedUserStats] = useState(null);
    const inputRef = useRef(null);
    const [newNickname, setNewNickname] = useState('');

    const { raceStarted, countdown, setCountdown, racePrompt } = useContext(RaceContext);
    const { sendWebSocketMessage, user, isConnected } = useContext(WebSocketContext);

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
            setRaceFinished(false);
            setStartTime(null);
            setEndTime(null);
            setUpdatedUserStats(null);
        }
    }, [raceStarted]);


    useEffect(() => {
        let timerId;

        if (raceStarted && countdown > 0) {
            timerId = setInterval(() => {
                setCountdown(countdown - 1);
            }, 1000);
        } else if (countdown === 0) {
            setStartTime(Date.now());
            inputRef.current.focus();
        }

        return () => {
            clearInterval(timerId);
        };
    }, [countdown, raceStarted]);

    useEffect(() => {
        if (userInput === racePrompt && racePrompt !== "") {
            setEndTime(Date.now());
            setRaceFinished(true);
        }
    }, [userInput, racePrompt]);

    useEffect(() => {
        if (endTime && startTime && raceFinished) {
            const timeTaken = (endTime - startTime) / 60000;
            const wordsTyped = racePrompt.split(' ').length;
            const currentWPM = wordsTyped / timeTaken;

            const updatedUser = { ...user };

            updatedUser.stats.races_completed += 1;

            if (currentWPM > updatedUser.stats.top_wpm) {
                updatedUser.stats.top_wpm = currentWPM;
            }

            updatedUser.stats.avg_wpm =
                ((updatedUser.stats.avg_wpm * (updatedUser.stats.races_completed - 1) + currentWPM) / updatedUser.stats.races_completed);

            localStorage.setItem('user', JSON.stringify(updatedUser));
            setUpdatedUserStats(updatedUser.stats);
        }
    }, [endTime]);

    useEffect(() => {
        if (raceFinished && endTime && startTime && user) {
            const timeTaken = (endTime - startTime) / 60000;
            const wordsTyped = racePrompt.split(' ').length;
            const currentWPM = wordsTyped / timeTaken;
            sendWebSocketMessage({
                type: 'finishRace',
                time: currentWPM,
                user: user,
            });
        }
    }, [raceFinished, endTime, startTime, sendWebSocketMessage, user]);

    const handleInputChange = (e) => {
        if (!raceFinished) {
            setUserInput(e.target.value);

            if (firstMistakeIndex === -1 && e.target.value !== racePrompt.slice(0, e.target.value.length)) {
                for (let i = 0; i < e.target.value.length; i++) {
                    if (e.target.value[i] !== racePrompt[i]) {
                        setFirstMistakeIndex(i);
                        break;
                    }
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
                            color: highlight? "white" : "black",
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

    const handleInputChangeNickname = (e) => {
        setNewNickname(e.target.value);

    };

    const handleSaveNickname = () => {
        if (newNickname && newNickname.length < 20) {
            sendWebSocketMessage({
                type: 'updateNickname',
                user: user,
                nickname: newNickname,
            });
            setUserInput('');
            const updatedUser = { ...user, nickname: newNickname };
            localStorage.setItem('user', JSON.stringify(updatedUser));
        }
    };


    const timeTaken = endTime && startTime ? (endTime - startTime) / 60000 : 0;
    const wordsTyped = racePrompt.split(' ').length;
    const currentWPM = (wordsTyped / timeTaken).toFixed(2).replace(".00", "");

    const stats = updatedUserStats || (user && user.stats);

    return (
        <>
            <a href=""><div className="typewriter" id="typewriter"></div></a>
            {isConnected ? (
                <div className="top">
                    {stats && (
                        <div className="stats">
                            <h3>Stats</h3>
                            <p>
                                <input type="text" value={newNickname} placeholder={user.nickname}
                                       onChange={handleInputChangeNickname} onBlur={handleSaveNickname} id="nickname"/>
                            </p>
                            <p>Races Completed: {stats.races_completed}</p>
                            {/*<p>Races Won: {stats.races_won}</p>*/}
                            <p>Average WPM: {stats.avg_wpm.toFixed(0).replace(".00", "")}</p>
                            <p>Top WPM: {stats.top_wpm.toFixed(0).replace(".00", "")}</p>
                        </div>
                    )}
                    <div className="prompt-box">
                        <div id="countdown">
                            {raceStarted && countdown > 0 && <h2>{countdown}</h2>}
                            {/*{countdown === 0 && <h5>Press Tab to restart</h5>}*/}
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
                            disabled={!raceStarted || countdown > 0 || raceFinished}
                            placeholder="Type here (auto-focus when countdown ends)"
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
                    {raceFinished && <p>WPM: {currentWPM}</p>}
                </div>
            ) : (
                <h1></h1>
            )}
        </>
    );
}

export default RaceBox;
