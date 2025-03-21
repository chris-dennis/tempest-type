import { useState, useEffect } from 'react';

function GlobalLeaderboard() {
    const [raceResults, setRaceResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchRaceResults = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('http://localhost:8080/api/race-results', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch race results: ${response.status}`);
            }

            const data = await response.json();
            setRaceResults(data);
        } catch (error) {
            console.error('Error fetching race results:', error);
            setError('Failed to load global leaderboard. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRaceResults();
    }, []);

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    return (
        <div className="global-leaderboard">
            <h2>Global Leaderboard</h2>
            <button
                onClick={fetchRaceResults}
                disabled={loading}
                className="refresh-button"
            >
                {loading ? 'Loading...' : 'Refresh'}
            </button>

            {error && <div className="error-message">{error}</div>}

            {!loading && !error && raceResults.length === 0 && (
                <p>No race results found. Be the first to complete a race!</p>
            )}

            {raceResults.length > 0 && (
                <div className="leaderboard-table-container">
                    <table className="leaderboard-table">
                        <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>WPM</th>
                            <th>Party</th>
                            <th>Date</th>
                        </tr>
                        </thead>
                        <tbody>
                        {raceResults.map((result, index) => (
                            <tr key={result.id}>
                                <td>{index + 1}</td>
                                <td>{result.nickname || 'Anonymous'}</td>
                                <td>{result.wpm.toFixed(1)}</td>
                                <td>{result.party_code || '-'}</td>
                                <td>{formatTimestamp(result.completed_at)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default GlobalLeaderboard;