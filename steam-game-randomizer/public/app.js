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
    gameCount: document.getElementById('gameCount'),
    boxArt: document.getElementById('boxArt')
};

let games = [];

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
        
        games = data.games || [];
        elements.gameList.value = games.map(g => g.name).join('\n');
        elements.gameCount.textContent = `${games.length} games`;
        
        setStatus(`Loaded ${games.length} games successfully!`, 'success');
        
    } catch (error) {
        console.error('Game fetch error:', error);
        showError(`Failed to load games: ${error.message}`);
        setStatus('', '');
    }
}

function randomGame() {
    if (games.length === 0) {
        showError('No games in library!');
        return;
    }
    
    elements.resultBox.classList.add('spinning');
    
    let randomIndex;
    if (crypto && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        randomIndex = Math.floor((array[0] / (0xFFFFFFFF + 1)) * games.length);
    } else {
        randomIndex = Math.floor(Math.random() * games.length);
    }
    
    const game = games[randomIndex];
    
    setTimeout(() => {
        elements.selectedGame.textContent = game.name;
        
        // Show box art from Steam CDN
        if (game.appid) {
            elements.boxArt.src = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`;
            elements.boxArt.style.display = 'block';
            elements.boxArt.onerror = () => {
                elements.boxArt.style.display = 'none';
            };
        } else {
            elements.boxArt.style.display = 'none';
        }
        
        elements.resultBox.classList.remove('spinning');
    }, 300);
    
    console.log(`Randomly selected: ${game.name} (appid: ${game.appid})`);
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