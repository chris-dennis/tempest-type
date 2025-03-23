import { createContext, useState, useEffect } from 'react';

const SettingsContext = createContext(null);

const defaultSettings = {
    backgroundColor: '#242424',
    promptFontFamily: 'Courier New, Courier, monospace',
    promptColor: 'rgba(255, 255, 255, 0.87)',
    errorHighlightColor: 'red',
    correctHighlightColor: 'lightgreen',
    highlightEnabled: true,
};

const SettingsProvider = ({ children }) => {
    // Load settings from localStorage if available
    const [settings, setSettings] = useState(() => {
        const savedSettings = localStorage.getItem('tempestTypeSettings');
        return savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    });

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('tempestTypeSettings', JSON.stringify(settings));

        if (settings.backgroundColor) {
            document.body.style.backgroundColor = settings.backgroundColor;
        }

        return () => {
            document.body.style.backgroundColor = '';
        };
    }, [settings]);

    const updateSettings = (newSettings) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, defaultSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export { SettingsContext, SettingsProvider };