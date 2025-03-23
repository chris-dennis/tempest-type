import { useState, useContext, useEffect } from 'react';
import { SettingsContext } from './SettingsContext';

function SettingsModal({ isOpen, onClose }) {
    const { settings, updateSettings, defaultSettings } = useContext(SettingsContext);
    const [tempSettings, setTempSettings] = useState(settings);

    useEffect(() => {
        setTempSettings(settings);
    }, [settings, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setTempSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSave = () => {
        updateSettings(tempSettings);
        onClose();
    };

    const handleReset = () => {
        updateSettings(defaultSettings);
        setTempSettings(defaultSettings);
    };

    const presetFonts = [
        'Courier New, Courier, monospace',
        'Arial, sans-serif',
        'Verdana, sans-serif',
        'Tahoma, sans-serif',
        'Georgia, serif',
        'Times New Roman, serif',
    ];

    return (
        <div className="settings-modal-overlay">
            <div className="settings-modal">
                <h2>Accessibility Settings</h2>

                <div className="settings-section">
                    <h3>Page Background</h3>
                    <div className="settings-control">
                        <label htmlFor="backgroundColor">Background Color:</label>
                        <input
                            type="color"
                            id="backgroundColor"
                            name="backgroundColor"
                            value={tempSettings.backgroundColor}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Prompt Text</h3>
                    <div className="settings-control">
                        <label htmlFor="promptFontFamily">Font:</label>
                        <select
                            id="promptFontFamily"
                            name="promptFontFamily"
                            value={tempSettings.promptFontFamily}
                            onChange={handleChange}
                        >
                            {presetFonts.map(font => (
                                <option key={font} value={font}>{font.split(',')[0]}</option>
                            ))}
                        </select>
                    </div>

                    <div className="settings-control">
                        <label htmlFor="promptColor">Text Color:</label>
                        <input
                            type="color"
                            id="promptColor"
                            name="promptColor"
                            value={tempSettings.promptColor}
                            onChange={handleChange}
                        />
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Typing Highlights</h3>
                    <div className="settings-control checkbox">
                        <label htmlFor="highlightEnabled">
                            <input
                                type="checkbox"
                                id="highlightEnabled"
                                name="highlightEnabled"
                                checked={tempSettings.highlightEnabled}
                                onChange={handleChange}
                            />
                            Enable Highlighting
                        </label>
                    </div>

                    <div className="settings-control">
                        <label htmlFor="correctHighlightColor">Correct Text Highlight:</label>
                        <input
                            type="color"
                            id="correctHighlightColor"
                            name="correctHighlightColor"
                            value={tempSettings.correctHighlightColor}
                            onChange={handleChange}
                            disabled={!tempSettings.highlightEnabled}
                        />
                    </div>

                    <div className="settings-control">
                        <label htmlFor="errorHighlightColor">Error Highlight:</label>
                        <input
                            type="color"
                            id="errorHighlightColor"
                            name="errorHighlightColor"
                            value={tempSettings.errorHighlightColor}
                            onChange={handleChange}
                            disabled={!tempSettings.highlightEnabled}
                        />
                    </div>
                </div>

                <div className="settings-buttons">
                    <button onClick={handleReset}>Reset to Default</button>
                    <button onClick={onClose}>Cancel</button>
                    <button onClick={handleSave} className="primary-button">Save Settings</button>
                </div>
            </div>
        </div>
    );
}

export default SettingsModal;