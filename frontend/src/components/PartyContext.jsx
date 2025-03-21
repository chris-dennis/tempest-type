import { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WebSocketContext } from './WebSocketContext';
import { UserContext } from './UserContext';

const PartyContext = createContext(null);

const PartyProvider = ({ children }) => {
    const [partyCode, setPartyCode] = useState(null);
    const [partyMembers, setPartyMembers] = useState([]);
    const [isPartyLeader, setIsPartyLeader] = useState(false);
    const [leaderboard, setLeaderboard] = useState([]);
    const [raceOver, setRaceOver] = useState(false);
    const [message, setMessage] = useState('');
    const [searchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(false);
    const [leader, setLeader] = useState(null);
    const initialPartyJoinAttempted = useRef(false);
    const partyCreatedOrJoined = useRef(false);
    const memberColors = useRef({});
    const sessionWins = useRef({});

    const { isConnected, sendMessage, registerMessageHandler } = useContext(WebSocketContext);
    const { user, isAuthenticated } = useContext(UserContext);
    const navigate = useNavigate();


    // Create a new party
    const createParty = useCallback(() => {
        if (!user) {
            setMessage('Please wait for user data to load');
            return false;
        }

        const success = sendMessage({ type: 'createParty' });
        if (success) {
            partyCreatedOrJoined.current = true;
            setMessage('Creating party...');
        } else {
            setMessage('Failed to create party - connection issue');
        }
        return success;
    }, [user, sendMessage]);

    // Join an existing party
    const joinParty = useCallback((code) => {
        if (!user) {
            setMessage('Please wait for user data to load');
            return false;
        }

        if (!code) {
            setMessage('Please enter a party code');
            return false;
        }

        setIsLoading(true);
        const success = sendMessage({ type: 'joinParty', code });
        if (success) {
            partyCreatedOrJoined.current = true;
            setPartyCode(code);
            setMessage('Joining party...');
        } else {
            setMessage('Failed to join party - connection issue');
            setIsLoading(false);
        }
        return success;
    }, [user, sendMessage]);

    // Find party leader
    const updatePartyLeadership = useCallback((members, leader) => {
        setLeader(leader);

        if (user && leader === user.id) {
            setIsPartyLeader(true);
        } else if (members.length === 1 && members[0]?.id === user?.id) {
            setIsPartyLeader(true);
        } else {
            setIsPartyLeader(false);
        }
    }, [user]);

    // Reset party state when leaving
    const leaveParty = useCallback(() => {
        if (partyCode) {
            sendMessage({ type: 'leaveParty', code: partyCode });
            setPartyCode(null);
            setPartyMembers([]);
            setIsPartyLeader(false);
            setLeaderboard([]);
            setRaceOver(false);
            setMessage('');
            setLeader(null);

            memberColors.current = {};
            sessionWins.current = {};

            // Reset the party join/create flags
            partyCreatedOrJoined.current = false;
            initialPartyJoinAttempted.current = false;

            navigate('/');
        }
    }, [partyCode, sendMessage, navigate]);

    // Join party from URL params
    useEffect(() => {
        const code = searchParams.get('code');

        if (code &&
            isConnected &&
            isAuthenticated &&
            user &&
            !initialPartyJoinAttempted.current &&
            !partyCreatedOrJoined.current) {

            console.log('Attempting to join party from URL:', code);
            initialPartyJoinAttempted.current = true;

            setPartyCode(code);

            setIsLoading(true);

            setTimeout(() => {
                if (!partyCreatedOrJoined.current) {
                    sendMessage({ type: 'rejoinParty', code });
                }
            }, 500); // delay for auth
        }
    }, [isConnected, isAuthenticated, user, searchParams, sendMessage]);

    // Reset join attempt flag when disconnected
    useEffect(() => {
        if (!isConnected) {
            initialPartyJoinAttempted.current = false;
        }
    }, [isConnected]);

    // Register message handlers
    useEffect(() => {
        if (!isConnected) return;

        // party updates
        const unregisterPartyUpdate = registerMessageHandler('partyUpdate', (message) => {
            console.log('Party update received:', message);
            partyCreatedOrJoined.current = true;
            setPartyCode(message.code);

            const validMembers = Array.isArray(message.partyMembers)
                ? message.partyMembers.filter(m => m !== null)
                : [];

            setPartyMembers(validMembers);
            updatePartyLeadership(validMembers, message.leader);

            // Member colors from server
            if (message.member_colors && Object.keys(message.member_colors).length > 0) {
                console.log('Received member colors:', message.member_colors);
                memberColors.current = message.member_colors;
            }
            // Session wins
            if (message.session_wins && Object.keys(message.session_wins).length > 0) {
                console.log('Received session wins:', message.session_wins);
                sessionWins.current = message.session_wins;
            }

            navigate(`/party?code=${message.code}`);
            setMessage('');
            setIsLoading(false);
        });

        // Handle user joined
        const unregisterUserJoined = registerMessageHandler('userJoined', (message) => {
            partyCreatedOrJoined.current = true;
            setPartyCode(message.code);

            const joinedMembers = Array.isArray(message.partyMembers)
                ? message.partyMembers.filter(m => m !== null)
                : [];

            setPartyMembers(joinedMembers);

            // Update member colors if provided
            if (message.member_colors && Object.keys(message.member_colors).length > 0) {
                console.log('Received member colors on user joined:', message.member_colors);
                memberColors.current = message.member_colors;
            }
            if (message.session_wins && Object.keys(message.session_wins).length > 0) {
                console.log('Received session wins on user joined:', message.session_wins);
                sessionWins.current = message.session_wins;
            }

            setMessage('');
        });

        // Handle leaderboard updates
        const unregisterLeaderboardUpdate = registerMessageHandler('leaderboardUpdate', (message) => {
            if (Array.isArray(message.leaderboard)) {
                console.log('Leaderboard update:', message.leaderboard);
                setLeaderboard(message.leaderboard);
                setRaceOver(true);
                setMessage('Race completed!');
            }
        });

        const unregisterError = registerMessageHandler('error', (message) => {
            setMessage(message.message || 'An error occurred');
            setIsLoading(false);
        });

        return () => {
            unregisterPartyUpdate();
            unregisterUserJoined();
            unregisterLeaderboardUpdate();
            unregisterError();
        };
    }, [isConnected, registerMessageHandler, updatePartyLeadership, navigate]);

    const getMemberColor = useCallback((memberId) => {
        const memberIdStr = String(memberId);
        return memberColors.current[memberIdStr] || '#808080';
    }, []);

    const getMemberById = useCallback((memberId) => {
        return partyMembers.find(member => member.id === memberId);
    }, [partyMembers]);

    const getMemberSessionWins = useCallback((memberId) => {
        const memberIdStr = String(memberId);
        return sessionWins.current[memberIdStr] || 0;
    }, []);

    return (
        <PartyContext.Provider value={{
            partyCode,
            partyMembers,
            isPartyLeader,
            leaderboard,
            raceOver,
            setRaceOver,
            message,
            setMessage,
            isLoading,
            createParty,
            joinParty,
            leaveParty,
            getMemberColor,
            getMemberById,
            getMemberSessionWins,
            leader
        }}>
            {children}
        </PartyContext.Provider>
    );
};

export { PartyContext, PartyProvider };