import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { WebSocketContext } from './WebSocketContext';

const UserContext = createContext(null);

const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const { isConnected, sendMessage, registerMessageHandler } = useContext(WebSocketContext);

    const fetchUser = useCallback(async () => {
        try {
            console.log('Fetching user data from server');
            const response = await fetch('http://localhost:8080/api/users', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch user: ${response.status}`);
            }

            const userData = await response.json();
            console.log('User data received:', userData);
            setUser(userData);
            return userData;
        } catch (error) {
            console.error("Error fetching user:", error);
            return null;
        }
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    useEffect(() => {
        if (isConnected && user && !isAuthenticated) {
            console.log('Authenticating WebSocket with user:', user.id);
            sendMessage({ type: 'auth', user });
        }
    }, [isConnected, user, isAuthenticated, sendMessage]);

    useEffect(() => {
        if (!isConnected) return;

        console.log('Registering user-related message handlers');

        const unregisterAuthSuccess = registerMessageHandler('authSuccess', () => {
            console.log('Authentication successful');
            setIsAuthenticated(true);
        });

        const unregisterStatsUpdate = registerMessageHandler('statsUpdate', (message) => {
            if (message.user) {
                console.log('Received updated user stats:', message.user);
                setUser(message.user);
            }
        });

        return () => {
            unregisterAuthSuccess();
            unregisterStatsUpdate();
        };
    }, [isConnected, registerMessageHandler]);

    // Update nickname
    const updateNickname = useCallback((nickname) => {
        if (!user || !nickname || nickname.length >= 20) return false;

        sendMessage({
            type: 'updateNickname',
            user: user,
            nickname: nickname
        });

        setUser(prevUser => ({
            ...prevUser,
            nickname: nickname
        }));

        return true;
    }, [user, sendMessage]);

    return (
        <UserContext.Provider value={{
            user,
            setUser,
            isAuthenticated,
            updateNickname
        }}>
            {children}
        </UserContext.Provider>
    );
};

export { UserContext, UserProvider };