import { useState } from 'react';
import SettingsModal from './SettingsModal';

function SettingsToggle() {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <>
            <div
                className="settings-toggle"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Open Accessibility Settings"
                role="button"
                tabIndex={0}
            >
                <span className="settings-icon">⚙️</span>
            </div>
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </>
    );
}

export default SettingsToggle;