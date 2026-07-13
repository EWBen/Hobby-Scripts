/**
 * Steam Game Randomizer - Backend Server
 * Handles Steam OpenID authentication and API requests
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment validation
if (!process.env.STEAM_API_KEY) {
    console.error('❌ STEAM_API_KEY not found in environment variables!');
    console.error('Create a .env file with your Steam API Key.');
    process.exit(1);
}

if (!process.env.SESSION_SECRET) {
    console.error('❌ SESSION_SECRET not set!');
    console.error('Generate a random string and add to .env file.');
    process.exit(1);
}

if (!process.env.BASE_URL) {
    console.warn('⚠️ BASE_URL not set. Defaulting to localhost.');
}

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Serve manifest dynamically (updates base_url)
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.json({
        name: "Game Randomizer",
        short_name: "GameRandom",
        description: "Can't decide what to play? Let fate choose your next Steam game!",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#667eea",
        theme_color: "#667eea",
        categories: ["games", "entertainment", "utilities"],
        icons: [
            {
                src: "/icons/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any"
            },
            {
                src: "/icons/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any"
            },
            {
                src: "/icons/icon-maskable-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable"
            },
            {
                src: "/icons/icon-maskable-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable"
            }
        ],
        shortcuts: [
            {
                name: "Random Game",
                short_name: "Random",
                description: "Pick a random game instantly",
                url: "/dashboard?action=random",
                icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }]
            }
        ]
    });
});

// Serve service worker with correct headers
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../public/sw.js'));
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Steam OpenID Strategy
const base_url = process.env.BASE_URL || `http://localhost:${PORT}`;

passport.use(new SteamStrategy({
    returnURL: `${base_url}/auth/steam/return`,
    realm: base_url,
    apiKey: process.env.STEAM_API_KEY
}, (identifier, profile, done) => {
    // Extract SteamID64 from identifier URL
    const steamId64 = identifier.match(/\d+$/)[0];
    
    const user = {
        steamId64: steamId64,
        displayName: profile.displayName,
        avatar: profile.photos?.medium || null
    };
    
    console.log(`✅ User logged in: ${user.displayName} (${user.steamId64})`);
    done(null, user);
}));

// Auth routes
app.get('/auth/steam',
    (req, res, next) => {
        console.log('🚪 Initiating Steam auth...');
        passport.authenticate('steam')(req, res, next);
    }
);

app.get('/auth/steam/return',
    (req, res, next) => {
        passport.authenticate('steam', { failureRedirect: '/' })(req, res, next);
    },
    (req, res) => {
        console.log('✅ Authentication successful, redirecting to dashboard');
        res.redirect('/dashboard');
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Protected API routes
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            ...req.user
        });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/games', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const steamId = req.user.steamId64;
    
    try {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Steam API error: ${response.status}`);
        }

        const data = await response.json();
        
// Extract game name + appid for box art
const games = (data.response?.games || [])
    .filter(game => game.name)
    .map(game => ({
        name: game.name,
        appid: game.appid
    }));

console.log(`🎮 Retrieved ${games.length} games for ${req.user.displayName}`);

res.json({
    success: true,
    totalGames: games.length,
    games: games
});

    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ 
            error: 'Failed to fetch games from Steam',
            message: error.message 
        });
    }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    } else {
        res.redirect('/');
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    } else {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

// Start server
app.listen(PORT, () => {
    console.log('===================================');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔐 Steam Auth URL: http://localhost:${PORT}/auth/steam`);
    console.log('===================================');
});