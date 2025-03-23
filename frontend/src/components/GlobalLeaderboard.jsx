import { useState, useEffect } from 'react';

function GlobalLeaderboard() {
    const [raceResults, setRaceResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'wpm', direction: 'desc' });
    const [filterName, setFilterName] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [resultsPerPage, setResultsPerPage] = useState(10);

    // Fetch a results
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

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    // Get sorted and filtered results
    const getSortedAndFilteredResults = () => {
        const filteredResults = raceResults.filter(result => {
            const nickname = result.nickname || 'Anonymous';
            return nickname.toLowerCase().includes(filterName.toLowerCase());
        });

        const sortedResults = [...filteredResults].sort((a, b) => {
            if (sortConfig.key === 'completed_at') {
                return sortConfig.direction === 'asc'
                    ? new Date(a.completed_at) - new Date(b.completed_at)
                    : new Date(b.completed_at) - new Date(a.completed_at);
            }

            if (sortConfig.key === 'nickname') {
                const nameA = a.nickname || 'Anonymous';
                const nameB = b.nickname || 'Anonymous';
                return sortConfig.direction === 'asc'
                    ? nameA.localeCompare(nameB)
                    : nameB.localeCompare(nameA);
            }

            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return sortedResults;
    };

    // Get current page results
    const getCurrentPageResults = () => {
        const sortedAndFilteredResults = getSortedAndFilteredResults();
        const indexOfLastResult = currentPage * resultsPerPage;
        const indexOfFirstResult = indexOfLastResult - resultsPerPage;
        return sortedAndFilteredResults.slice(indexOfFirstResult, indexOfLastResult);
    };

    // Get sort indicator
    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    };

    // Calculate total pages
    const totalPages = Math.ceil(getSortedAndFilteredResults().length / resultsPerPage);

    // Handle page changes
    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    return (
        <div className="global-leaderboard">
            <div className="leaderboard-header">
                <h2>Global Leaderboard</h2>
                <button
                    onClick={toggleCollapse}
                    className="collapse-button"
                >
                    {isCollapsed ? 'Show' : 'Hide'}
                </button>
            </div>

            {!isCollapsed && (
                <>
                    <div className="leaderboard-controls">
                        <button
                            onClick={fetchRaceResults}
                            disabled={loading}
                            className="refresh-button"
                        >
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>

                        <div className="filter-control">
                            <input
                                type="text"
                                placeholder="Filter by player name..."
                                value={filterName}
                                onChange={(e) => {
                                    setFilterName(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="name-filter"
                            />
                            {filterName && (
                                <button
                                    className="clear-filter"
                                    onClick={() => {
                                        setFilterName('');
                                        setCurrentPage(1);
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="pagination-size-control">
                            <label htmlFor="results-per-page">Show:</label>
                            <select
                                id="results-per-page"
                                value={resultsPerPage}
                                onChange={(e) => {
                                    setResultsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                            <span>results</span>
                        </div>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    {!loading && !error && raceResults.length === 0 && (
                        <p>No race results found. Be the first to complete a race!</p>
                    )}

                    {!loading && !error && raceResults.length > 0 && getSortedAndFilteredResults().length === 0 && (
                        <p>No matching results found. Try a different filter.</p>
                    )}

                    {raceResults.length > 0 && getSortedAndFilteredResults().length > 0 && (
                        <>
                            <div className="leaderboard-table-container">
                                <table className="leaderboard-table">
                                    <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th
                                            onClick={() => requestSort('nickname')}
                                            className="sortable-header"
                                        >
                                            Player{getSortIndicator('nickname')}
                                        </th>
                                        <th
                                            onClick={() => requestSort('wpm')}
                                            className="sortable-header"
                                        >
                                            WPM{getSortIndicator('wpm')}
                                        </th>
                                        <th
                                            onClick={() => requestSort('completed_at')}
                                            className="sortable-header"
                                        >
                                            Date{getSortIndicator('completed_at')}
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {getCurrentPageResults().map((result, index) => {
                                        const sortedResults = getSortedAndFilteredResults();
                                        const actualRank = sortedResults.findIndex(r => r.id === result.id) + 1;

                                        return (
                                            <tr key={result.id}>
                                                <td>{actualRank}</td>
                                                <td>{result.nickname || 'Anonymous'}</td>
                                                <td>{result.wpm.toFixed(1)}</td>
                                                <td>{formatTimestamp(result.completed_at)}</td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination controls */}
                            {totalPages > 1 && (
                                <div className="pagination-controls">
                                    <button
                                        onClick={() => goToPage(1)}
                                        disabled={currentPage === 1}
                                        className="pagination-button"
                                    >
                                        &laquo;
                                    </button>
                                    <button
                                        onClick={() => goToPage(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="pagination-button"
                                    >
                                        &lt;
                                    </button>

                                    <span className="pagination-info">
                                        Page {currentPage} of {totalPages}
                                    </span>

                                    <button
                                        onClick={() => goToPage(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="pagination-button"
                                    >
                                        &gt;
                                    </button>
                                    <button
                                        onClick={() => goToPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="pagination-button"
                                    >
                                        &raquo;
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

export default GlobalLeaderboard;