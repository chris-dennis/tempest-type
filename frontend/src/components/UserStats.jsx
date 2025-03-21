import { useState, useContext } from 'react';
import { UserContext } from './UserContext';

function UserStats() {
    const [newNickname, setNewNickname] = useState('');
    const { user, updateNickname } = useContext(UserContext);

    if (!user || !user.stats) return null;

    const handleInputChangeNickname = (e) => {
        setNewNickname(e.target.value);
    };

    const handleSaveNickname = () => {
        if (newNickname && newNickname.length < 16) {
            updateNickname(newNickname);
            setNewNickname('');
        }
    };

    return (
        <div className="stats">
            <h3>Stats</h3>
            <p>
                <input
                    type="text"
                    value={newNickname}
                    placeholder={user.nickname || "Enter nickname"}
                    onChange={handleInputChangeNickname}
                    onBlur={handleSaveNickname}
                    id="nickname"
                />
            </p>
            <p>Races Completed: {user.stats.races_completed}</p>
            <p>Races Won: {user.stats.races_won}</p>
            <p>Average WPM: {user.stats.avg_wpm.toFixed(0).replace(".00", "")}</p>
            <p>Top WPM: {user.stats.top_wpm.toFixed(0).replace(".00", "")}</p>
        </div>
    );
}

export default UserStats;
