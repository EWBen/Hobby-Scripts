/**
 * Game Randomizer Frontend Logic
 * Features: On-demand review fetching, score filtering
 * Build: 2026-09-11-dropdown-avatar-fix
 */
console.log('%cGame Randomizer build: 2026-09-11-dropdown-avatar-fix', 'color:#00f5d4;font-weight:bold;');

const elements = {
    gameList: document.getElementById('gameList'),
    selectedGame: document.getElementById('selectedGame'),
    resultBox: document.getElementById('resultBox'),
    statusBar: document.getElementById('statusBar'),
    errorArea: document.getElementById('errorArea'),
    userName: document.getElementById('userName'),
    userAvatar: document.getElementById('userAvatar'),
    gameCount: document.getElementById('gameCount'),
    boxArt: document.getElementById('boxArt'),
    minScore: document.getElementById('minScore'),
    minScoreValue: document.getElementById('minScoreValue'),
    eligibleCount: document.getElementById('eligibleCount'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    scoreValue: document.getElementById('scoreValue')
};

let allGames = [];
let currentMinScore = 0;
let isLoading = false;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (elements.userName) {
        await refreshGames();
    }
});

async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        
        if (data.authenticated) {
            if (elements.userName) {
                elements.userName.textContent = data.displayName;
                if (data.avatar && elements.userAvatar) {
                    elements.userAvatar.src = data.avatar;
                    elements.userAvatar.style.display = 'block';
                    elements.userAvatar.onerror = () => {
                        elements.userAvatar.style.display = 'none';
                    };
                }
            }
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
}

async function refreshGames() {
    setStatus('Fetching games from Steam...', 'loading');
    
    try {
        const response = await fetch('/api/games', { method: 'POST' });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch games');
        }
        
        // Sort alphabetically (case-insensitive) so the dropdown is easy to scan.
        allGames = (data.games || []).slice().sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        updateEligibleCount();
        
        populateGameDropdown(allGames);
        elements.gameCount.textContent = `${allGames.length} games`;
        
        setStatus(`Loaded ${allGames.length} games instantly!`, 'success');
        
    } catch (error) {
        console.error('Game fetch error:', error);
        showError(`Failed to load games: ${error.message}`);
        setStatus('', '');
    }
}

function populateGameDropdown(games) {
    if (!elements.gameList) return;
    elements.gameList.innerHTML = '';

    if (games.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = 'No games found';
        elements.gameList.appendChild(opt);
        return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `${games.length} games — select to view`;
    elements.gameList.appendChild(placeholder);

    for (const game of games) {
        const opt = document.createElement('option');
        opt.value = game.appid;
        opt.textContent = game.name;
        elements.gameList.appendChild(opt);
    }
}

function updateEligibleCount() {
    // We don't know exact count until we fetch reviews, but we can estimate
    if (currentMinScore === 0) {
        elements.eligibleCount.textContent = 'All games eligible';
    } else {
        elements.eligibleCount.textContent = `Games will be filtered to ≥ ${currentMinScore}% positive`;
    }
}

// Slider event listener
if (elements.minScore) {
    elements.minScore.addEventListener('input', (e) => {
        currentMinScore = parseInt(e.target.value);
        elements.minScoreValue.textContent = currentMinScore + '%';
        updateEligibleCount();
    });
}

// Cache of review data per appid so re-rolling never re-fetches the same
// game twice in a session (the server also caches, but this saves the
// round-trip entirely on repeat draws).
const reviewCache = new Map();

// Fetch review for single game, using the local cache first
async function fetchGameReview(appid) {
    if (reviewCache.has(appid)) {
        return reviewCache.get(appid);
    }
    try {
        const response = await fetch(`/api/game-review/${appid}`, { method: 'POST' });
        const data = await response.json();
        reviewCache.set(appid, data);
        return data;
    } catch (error) {
        console.error('Error fetching review:', error);
        return { review_percent: null };
    }
}

function shuffled(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// How many unique games to check per click before giving up. Walking the
// whole library is fine once it's cached, but the first pass over a huge
// library would be slow, so this caps how far a single click will search.
const MAX_CANDIDATES_PER_ROLL = 80;
const REVIEW_FETCH_CONCURRENCY = 4;

// Select random game WITH filtering. Walks a shuffled, deduplicated slice of
// the library (instead of repeatedly re-rolling with replacement) so it
// never wastes a check re-testing the same losing game twice, and fetches
// reviews a few at a time in parallel instead of one-by-one with a sleep.
async function randomGame() {
    if (allGames.length === 0) {
        showError('No games in library!');
        return;
    }
    
    if (isLoading) {
        return; // Prevent double-clicks
    }
    isLoading = true;
    
    setStatus('Picking your next adventure...', 'loading');
    elements.resultBox.classList.add('spinning');
    hideResult(); // Hide previous result

    const candidates = shuffled(allGames).slice(0, Math.min(allGames.length, MAX_CANDIDATES_PER_ROLL));
    let selectedGame = null;
    let checked = 0;
    let nextIndex = 0;

    async function worker() {
        while (!selectedGame && nextIndex < candidates.length) {
            const candidate = candidates[nextIndex++];
            const reviewData = await fetchGameReview(candidate.appid);
            checked++;

            if (selectedGame) return; // another worker already found a match

            const score = reviewData.review_percent;
            if (score === null) {
                if (currentMinScore === 0) {
                    selectedGame = { ...candidate, review_percent: null, review_desc: 'No reviews' };
                }
            } else if (score >= currentMinScore) {
                selectedGame = { ...candidate, ...reviewData };
            }
        }
    }

    try {
        const workerCount = Math.min(REVIEW_FETCH_CONCURRENCY, candidates.length);
        await Promise.all(Array.from({ length: workerCount }, worker));

        if (selectedGame) {
            showResult(selectedGame, checked);
            setStatus('', '');
        } else {
            showError(`Couldn't find a game meeting your criteria after checking ${checked} games. Try lowering the minimum score.`);
            setStatus('', '');
        }
        
    } catch (error) {
        console.error('Error during randomization:', error);
        showError('An error occurred while picking a game. Please try again.');
        setStatus('', '');
    } finally {
        elements.resultBox.classList.remove('spinning');
        isLoading = false;
    }
}

function showResult(game, checkedCount) {
    // Show game name
    elements.selectedGame.textContent = game.name;
    
    // Show score with proper formatting and magenta color
    if (game.review_percent !== null) {
        elements.scoreValue.textContent = game.review_percent + '%';
        elements.scoreDisplay.style.display = 'flex';
        
        // FORCE magenta color via inline styles (bypasses any CSS conflicts)
        elements.scoreValue.style.color = '#bd00ff';
        elements.scoreValue.style.fontWeight = '700';
        
        const labelTextEl = elements.scoreDisplay.querySelector('.score-label');
        if (labelTextEl) {
            labelTextEl.style.color = '#bd00ff';
            labelTextEl.style.fontFamily = '"Share Tech Mono", monospace';
            labelTextEl.style.marginLeft = '8px';
            labelTextEl.textContent = 'Positive';
        }
    } else {
        elements.scoreDisplay.style.display = 'none';
    }
    
    // Show box art
    if (game.appid) {
        elements.boxArt.src = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
        elements.boxArt.style.display = 'block';
        elements.boxArt.onerror = () => {
            elements.boxArt.style.display = 'none';
        };
    } else {
        elements.boxArt.style.display = 'none';
    }
    
    // Log what happened
    const scoreText = game.review_percent !== null ? `${game.review_percent}% positive` : 'no reviews';
    console.log(`✅ Selected: ${game.name} (${scoreText}) after checking ${checkedCount} game(s)`);
}

function hideResult() {
    elements.selectedGame.textContent = '?';
    elements.scoreDisplay.style.display = 'none';
    elements.boxArt.style.display = 'none';
}

function setStatus(message, type) {
    if (elements.statusBar) {
        elements.statusBar.className = `status-bar ${type}`;
        elements.statusBar.textContent = message;
    }
}

function showError(message) {
    if (elements.errorArea) {
        elements.errorArea.innerHTML = `<div class="error-message">${message}</div>`;
        setTimeout(() => { elements.errorArea.innerHTML = ''; }, 5000);
    }
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        randomGame();
    }
});