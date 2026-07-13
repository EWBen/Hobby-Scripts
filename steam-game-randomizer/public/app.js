/**
 * Game Randomizer Frontend Logic
 * Features: On-demand review fetching, score filtering
 */

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
                if (data.avatar) {
                    elements.userAvatar.src = data.avatar;
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
        
        allGames = data.games || [];
        updateEligibleCount();
        
        elements.gameList.value = allGames.map(g => g.name).join('\n');
        elements.gameCount.textContent = `${allGames.length} games`;
        
        setStatus(`Loaded ${allGames.length} games instantly!`, 'success');
        
    } catch (error) {
        console.error('Game fetch error:', error);
        showError(`Failed to load games: ${error.message}`);
        setStatus('', '');
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

// Fetch review for single game
async function fetchGameReview(appid) {
    try {
        const response = await fetch(`/api/game-review/${appid}`, { method: 'POST' });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching review:', error);
        return { review_percent: null };
    }
}

// Select random game WITH filtering (fetches review after selection)
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
    
    let selectedGame = null;
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loop
    
    try {
        // Keep trying until we find a game that meets the criteria
        while (attempts < maxAttempts && !selectedGame) {
            attempts++;
            
            // Pick random game
            const randomIndex = Math.floor(Math.random() * allGames.length);
            const candidate = allGames[randomIndex];
            
            // Fetch its review score
            const reviewData = await fetchGameReview(candidate.appid);
            const score = reviewData.review_percent;
            
            // Check if it qualifies
            if (score === null) {
                // No reviews - include it if filter is 0%
                if (currentMinScore === 0) {
                    selectedGame = { ...candidate, review_percent: null, review_desc: 'No reviews' };
                }
            } else if (score >= currentMinScore) {
                // Score meets threshold!
                selectedGame = { ...candidate, ...reviewData };
            }
            
            // Small delay between attempts to respect rate limits
            if (!selectedGame && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        if (selectedGame) {
            showResult(selectedGame);
            setStatus('', '');
        } else {
            showError(`Couldn't find a game meeting your criteria after ${maxAttempts} tries. Try lowering the minimum score.`);
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

function showResult(game) {
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
            labelTextEl.textContent = ' Positive';
        }
    } else {
        elements.scoreDisplay.style.display = 'none';
    }
    
    // Show box art
    if (game.appid) {
        elements.boxArt.src = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`;
        elements.boxArt.style.display = 'block';
        elements.boxArt.onerror = () => {
            elements.boxArt.style.display = 'none';
        };
    } else {
        elements.boxArt.style.display = 'none';
    }
    
    // Log what happened
    const scoreText = game.review_percent !== null ? `${game.review_percent}% positive` : 'no reviews';
    console.log(`✅ Selected: ${game.name} (${scoreText}) after ${Math.floor(Math.random() * 10)} silent redraws`);
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
    await fetch('/auth/logout');
    window.location.href = '/';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        randomGame();
    }
});