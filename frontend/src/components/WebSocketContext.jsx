import  { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {useSearchParams} from "react-router-dom";

const WebSocketContext = createContext(null);

const WebSocketProvider = ({ children }) => {
    const [ws, setWs] = useState(null);
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [user, setUser] = useState(null);
    const [searchParams] = useSearchParams();

    const partyCode = searchParams.get('code');
    const connectWebSocket = useCallback(async () => {

        let storedUser = JSON.parse(localStorage.getItem('user'));
        if (!storedUser) {
            try {
                const response = await fetch('/api/users');
                if (!response.ok) {
                    throw new Error('Failed to fetch user');
                }
                storedUser = await response.json();
            } catch (error) {
                console.error("Error fetching user:", error);
                storedUser = {
                    id: uuidv4(),
                    stats: {races_completed: 0, races_won: 0, avg_wpm: 0.0, top_wpm: 0.0},
                    nickname: "Guest",
                };
            }
            localStorage.setItem('user', JSON.stringify(storedUser));
        }

        setUser(storedUser);
            const socket = new WebSocket('ws://13.59.42.81:8080/ws');

        socket.onopen = () => {
            console.log('WebSocket connection opened');
            setIsConnected(true);
            startHeartbeat(socket);
            socket.send(JSON.stringify({type: 'auth', user: storedUser}));

            if (partyCode){
                sendWebSocketMessage({type: 'rejoinParty', code: partyCode});
                console.log(partyCode)
            }
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);
        };

        socket.onclose = () => {
            console.log('WebSocket connection closed');
            setIsConnected(false);
        };

        wsRef.current = socket;
        setWs(socket);
    }, []);

    useEffect(() => {
        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [connectWebSocket]);

    const sendWebSocketMessage = (message) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log("Message sent")
            wsRef.current.send(JSON.stringify(message));
        } else {
            console.error('WebSocket not connected');
        }
    };

    const startHeartbeat = (socket) => {
        const interval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ping' }));
                // console.log('sent ping');
            } else {
                clearInterval(interval);
            }
        }, 15000);
    };

    return (
        <WebSocketContext.Provider value={{ ws, isConnected, sendWebSocketMessage, user }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export { WebSocketContext, WebSocketProvider };