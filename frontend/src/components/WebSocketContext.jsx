import { createContext, useState, useEffect, useRef, useCallback } from 'react';

const WebSocketContext = createContext(null);

const WebSocketProvider = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const messageHandlersRef = useRef(new Map());
    const [connectionAttempts, setConnectionAttempts] = useState(0);

    // Register a message handler for a specific message type
    const registerMessageHandler = useCallback((type, handler) => {
        messageHandlersRef.current.set(type, handler);
        return () => messageHandlersRef.current.delete(type);
    }, []);

    const sendMessage = useCallback((message) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log("Sending message:", message);
            wsRef.current.send(JSON.stringify(message));
            return true;
        } else {
            console.error('WebSocket not connected');
            return false;
        }
    }, []);

    const connectWebSocket = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }

        console.log('Creating new WebSocket connection');
        const socket = new WebSocket('ws://localhost:8080/ws');

        socket.onopen = () => {
            console.log('WebSocket connection opened - READY FOR MESSAGES');
            setIsConnected(true);
            startHeartbeat(socket);
        };

        socket.onmessage = (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (error) {
                console.error('Error parsing message:', error);
                return;
            }

            console.log('Received message:', message);

            if (message.type && messageHandlersRef.current.has(message.type)) {
                messageHandlersRef.current.get(message.type)(message);
            }
        };

        socket.onclose = (event) => {
            console.log('WebSocket connection closed', event);
            setIsConnected(false);
            clearHeartbeat(socket);

            if (!event.wasClean && connectionAttempts < 3) {
                console.log(`Connection attempt ${connectionAttempts + 1}/3`);
                setConnectionAttempts(prev => prev + 1);
                setTimeout(() => {
                    connectWebSocket();
                }, 3000);
            }
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        wsRef.current = socket;
    }, [connectionAttempts]);

    const startHeartbeat = (socket) => {
        socket.heartbeatInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ping' }));
            } else {
                clearInterval(socket.heartbeatInterval);
            }
        }, 15000);
    };

    const clearHeartbeat = (socket) => {
        if (socket.heartbeatInterval) {
            clearInterval(socket.heartbeatInterval);
            socket.heartbeatInterval = null;
        }
    };

    useEffect(() => {
        connectWebSocket();

        return () => {
            if (wsRef.current) {
                clearHeartbeat(wsRef.current);
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connectWebSocket]);

    return (
        <WebSocketContext.Provider value={{
            isConnected,
            sendMessage,
            registerMessageHandler
        }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export { WebSocketContext, WebSocketProvider };