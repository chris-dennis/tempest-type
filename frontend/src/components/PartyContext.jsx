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

    const initialPartyJoinAttempted = useRef(false);
    const partyCreatedOrJoined = useRef(false);

    const { isConnected, sendMessage, registerMessageHandler } = useContext(WebSocketContext);
    const { user, isAuthenticated } = useContext(UserContext);
    const navigate = useNavigate();

    // Color management
    const memberColors = useRef({});

    const generateRandomColor = useCallback(() => {
        return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
    }, []);

    const assignColorToMember = useCallback((memberId) => {
        if (!memberColors.current[memberId]) {
            memberColors.current[memberId] = generateRandomColor();
        }
        return memberColors.current[memberId];
    }, [generateRandomColor]);

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

        const success = sendMessage({ type: 'joinParty', code });
        if (success) {
            partyCreatedOrJoined.current = true;
            setPartyCode(code);
            setMessage('Joining party...');
        } else {
            setMessage('Failed to join party - connection issue');
        }
        return success;
    }, [user, sendMessage]);

    // Determine party leadership
    const updatePartyLeadership = useCallback((members, leader) => {
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

            setTimeout(() => {
                if (!partyCreatedOrJoined.current) {
                    sendMessage({ type: 'rejoinParty', code });
                    setMessage('Joining party from URL...');
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

            // Color assignment
            validMembers.forEach(member => {
                if (member && member.id) {
                    assignColorToMember(member.id);
                }
            });

            navigate(`/party?code=${message.code}`);
            setMessage('');
        });

        // Handle user joined
        const unregisterUserJoined = registerMessageHandler('userJoined', (message) => {
            partyCreatedOrJoined.current = true;
            setPartyCode(message.code);

            const joinedMembers = Array.isArray(message.partyMembers)
                ? message.partyMembers.filter(m => m !== null)
                : [];

            setPartyMembers(joinedMembers);
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

        // Handle errors
        const unregisterError = registerMessageHandler('error', (message) => {
            setMessage(message.message || 'An error occurred');
        });

        return () => {
            unregisterPartyUpdate();
            unregisterUserJoined();
            unregisterLeaderboardUpdate();
            unregisterError();
        };
    }, [isConnected, registerMessageHandler, updatePartyLeadership, navigate, assignColorToMember]);

    // Get color for a specific member
    const getMemberColor = useCallback((memberId) => {
        return memberColors.current[memberId] || '#808080';
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
            createParty,
            joinParty,
            leaveParty,
            getMemberColor
        }}>
            {children}
        </PartyContext.Provider>
    );
};

export { PartyContext, PartyProvider };