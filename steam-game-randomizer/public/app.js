/**
 * Game Randomizer Frontend Logic
 */

const elements = {
    gameList: document.getElementById('gameList'),
    selectedGame: document.getElementById('selectedGame'),
    resultBox: document.getElementById('resultBox'),
    statusBar: document.getElementById('statusBar'),
    errorArea: document.getElementById('errorArea'),
    userName: document.getElementById('userName'),
    userAvatar: document.getElementById('userAvatar'),
    gameCount: document.getElementById('gameCount')
};

let games = [];

// On load: check auth and fetch games
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (elements.userName) {
        await refreshGames();
    }
});

// Check if user is logged in
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

// Fetch games from Steam
async function refreshGames() {
    setStatus('Fetching games from Steam...', 'loading');
    
    try {
        const response = await fetch('/api/games', { method: 'POST' });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch games');
        }
        
        games = data.games || [];
        elements.gameList.value = games.join('\n');
        elements.gameCount.textContent = `${games.length} games`;
        
        setStatus(`Loaded ${games.length} games successfully!`, 'success');
        
    } catch (error) {
        console.error('Game fetch error:', error);
        showError(`Failed to load games: ${error.message}`);
        setStatus('', '');
    }
}

// Select random game
function randomGame() {
    if (games.length === 0) {
        showError('No games in library!');
        return;
    }
    
    // Animation
    elements.resultBox.classList.add('spinning');
    
    // Secure random selection
    let randomIndex;
    if (crypto && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        randomIndex = Math.floor((array[0] / (0xFFFFFFFF + 1)) * games.length);
    } else {
        randomIndex = Math.floor(Math.random() * games.length);
    }
    
    // Update display
    setTimeout(() => {
        elements.selectedGame.textContent = games[randomIndex];
        elements.resultBox.classList.remove('spinning');
    }, 300);
    
    console.log(`Randomly selected: ${games[randomIndex]} (${randomIndex + 1}/${games.length})`);
}

// Utility functions
function setStatus(message, type) {
    elements.statusBar.className = `status-bar ${type}`;
    elements.statusBar.textContent = message;
}

function showError(message) {
    elements.errorArea.innerHTML = `<div class="error-message">${message}</div>`;
    setTimeout(() => { elements.errorArea.innerHTML = ''; }, 5000);
}

// Logout
async function logout() {
    await fetch('/auth/logout');
    window.location.href = '/';
}

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        randomGame();
    }
});