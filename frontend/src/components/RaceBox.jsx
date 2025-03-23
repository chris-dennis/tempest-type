import {useContext, useEffect, useRef, useState} from 'react';
import {UserContext} from './UserContext';
import {WebSocketContext} from './WebSocketContext';
import {RaceContext} from './RaceContext';
import {PartyContext} from './PartyContext';
import {SettingsContext} from './SettingsContext';
import UserStats from './UserStats';

function RaceBox() {
    const [userInput, setUserInput] = useState('');
    const [firstMistakeIndex, setFirstMistakeIndex] = useState(-1);
    const [startTime, setStartTime] = useState(null);
    const [endTime, setEndTime] = useState(null);
    const [currentWPM, setCurrentWPM] = useState(0);
    const inputRef = useRef(null);
    const promptRef = useRef(null);
    const [charRects, setCharRects] = useState([]);

    const { user } = useContext(UserContext);
    const { isConnected } = useContext(WebSocketContext);
    const { setRaceOver, partyMembers, getMemberColor, showOtherCursors } = useContext(PartyContext);
    const { settings } = useContext(SettingsContext);
    const {raceStarted, countdown, racePrompt, finishRace, updateCursorPosition, cursorPositions} = useContext(RaceContext);
    const hasSentFinish = useRef(false);

    useEffect(() => {
        if (!raceStarted) {
            setUserInput('');
            setFirstMistakeIndex(-1);
            setStartTime(null);
            setEndTime(null);
            setCurrentWPM(0);
            hasSentFinish.current = false;
            setCharRects([]);
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

        const newInput = e.target.value;
        setUserInput(newInput);
        updateCursorPosition(newInput.length);

        if (firstMistakeIndex === -1 && newInput !== racePrompt.slice(0, newInput.length)) {
            for (let i = 0; i < newInput.length; i++) {
                if (newInput[i] !== racePrompt[i]) {
                    setFirstMistakeIndex(i);
                    break;
                }
            }
        }
    };

    // Update character positions after rendering
    useEffect(() => {
        if (raceStarted && promptRef.current && racePrompt) {
            const timer = setTimeout(() => {
                const spans = promptRef.current.querySelectorAll('span');
                const newCharRects = [];

                spans.forEach((span, index) => {
                    const rect = span.getBoundingClientRect();
                    const promptRect = promptRef.current.getBoundingClientRect();

                    newCharRects[index] = {
                        left: rect.left - promptRect.left,
                        top: rect.top - promptRect.top,
                        width: rect.width,
                        height: rect.height
                    };
                });

                setCharRects(newCharRects);
            }, 50);

            return () => clearTimeout(timer);
        }
    }, [racePrompt, raceStarted, countdown]);

    // For showing other users cursors
    const createCursorElement = (userId, position) => {
        const memberColor = getMemberColor(userId);
        const isCurrentUser = user && userId === user.id;

        const memberInfo = partyMembers.find(member => member.id === userId);
        const memberName = memberInfo ? memberInfo.nickname || 'Anonymous' : 'Unknown';

        if (isCurrentUser) return null;

        if (!charRects.length || position >= charRects.length) {
            return null;
        }

        const charPos = charRects[position] || charRects[charRects.length - 1];
        if (!charPos) return null;

        return (
            <div
                key={userId}
                className="user-cursor"
                style={{
                    position: 'absolute',
                    left: `${charPos.left}px`,
                    top: `${charPos.top}px`,
                    background: memberColor,
                    width: '2px',
                    height: '20px',
                    animation: 'blink 1s step-end infinite',
                    zIndex: 100,
                    marginTop: '4px',
                }}
                title={`${memberName}'s cursor`}
            >
                <div
                    className="cursor-name"
                    style={{
                        position: 'absolute',
                        top: '-20px',
                        left: '-10px',
                        fontSize: '10px',
                        color: 'black',
                        backgroundColor: memberColor,
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        opacity: 0.5
                    }}
                >
                    {memberName}
                </div>
            </div>
        );
    };

    const renderHighlightedText = () => {
        const chars = [];
        let localFirstMistakeIndex = -1;
        let highlight = false;

        for (let i = 0; i < racePrompt.length; i++) {
            if (i < userInput.length) {
                if (userInput[i] !== racePrompt[i] && localFirstMistakeIndex === -1) {
                    highlight = true;
                    localFirstMistakeIndex = i;
                }

                chars.push(
                    <span
                        key={i}
                        style={{
                            background: settings?.highlightEnabled
                                ? (highlight ? settings.errorHighlightColor : settings.correctHighlightColor)
                                : 'transparent',
                            color: settings?.promptColor,
                            textDecoration: i === localFirstMistakeIndex && settings?.highlightEnabled ? "underline" : "none",
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
            {isConnected ? (
                <div className="top">
                    {user && <UserStats />}

                    <div className="prompt-box">
                        <div id="countdown">
                            {raceStarted && countdown > 0 && <h2>{countdown}</h2>}
                        </div>
                        <div className="prompt-container">
                            <div
                                className="prompt"
                                ref={promptRef}
                                style={{
                                    position: 'relative',
                                    fontFamily: settings?.promptFontFamily,
                                    color: settings?.promptColor
                                }}
                            >
                                {raceStarted ? renderHighlightedText() :
                                    <div style={{textAlign: "center"}}>Waiting for Prompt...</div>}

                                {/* Render other users' cursors */}
                                {raceStarted && countdown === 0 && charRects.length > 0 && showOtherCursors &&
                                    Object.entries(cursorPositions).map(([userId, position]) => {
                                        return createCursorElement(userId, position);
                                    })}
                            </div>
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