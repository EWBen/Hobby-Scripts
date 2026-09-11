/**
 * Steam Game Randomizer - Backend Server
 * Handles Steam OpenID authentication, game library fetching, and review data
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
const BUILD_VERSION = '2026-09-11-dropdown-avatar-fix';

// Trust the first proxy hop (Heroku/Render/Nginx/etc). Without this, secure
// cookies silently fail to be set when the app sits behind a reverse proxy
// in production, and login will appear to randomly not "stick".
app.set('trust proxy', 1);

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

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Serve manifest dynamically
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
        background_color: "#0a0a0f",
        theme_color: "#00f5d4",
        categories: ["games", "entertainment", "utilities"],
        icons: [
            {
                src: "/icons/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any maskable"
            },
            {
                src: "/icons/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable"
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

// Serve service worker
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
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Steam OpenID Strategy
const base_url = process.env.BASE_URL || `http://localhost:${PORT}`;

passport.use(new SteamStrategy({
    returnURL: `${base_url}/auth/steam/return`,
    realm: base_url,
    apiKey: process.env.STEAM_API_KEY
}, (identifier, profile, done) => {
    const steamId64 = identifier.match(/\d+$/)[0];
    // passport-steam's `profile.photos` is an array of { value } objects
    // (small/medium/full), not an object with named keys — profile._json
    // exposes Steam's raw field names directly, which is more reliable.
    const avatar = profile._json?.avatarmedium || profile.photos?.[1]?.value || null;
    const user = {
        steamId64: steamId64,
        displayName: profile.displayName,
        avatar: avatar
    };
    console.log(`✅ User logged in: ${user.displayName} (${user.steamId64})`);
    done(null, user);
}));

// Auth routes
app.get('/auth/steam', (req, res, next) => {
    passport.authenticate('steam')(req, res, next);
});

app.get('/auth/steam/return',
    (req, res, next) => {
        passport.authenticate('steam', { failureRedirect: '/' })(req, res, next);
    },
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.post('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// Protected API routes
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, ...req.user });
    } else {
        res.json({ authenticated: false });
    }
});

// Review scores don't change minute-to-minute, and the randomizer can end up
// asking for the same appid many times across different users/sessions.
// A short-lived in-memory cache avoids hammering Steam's review endpoint.
const reviewCache = new Map(); // appid -> { data, expiresAt }
const REVIEW_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Helper: Fetch review percentage for a single game
async function fetchReviewPercent(appid) {
    const cached = reviewCache.get(appid);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    try {
        const url = `https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&purchase_type=all`;
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json();
        const summary = data.query_summary;
        
        let result;
        if (!summary || summary.total_reviews === 0) {
            result = { review_percent: null, total_reviews: 0, review_desc: 'No reviews' };
        } else {
            const percent = Math.round((summary.total_positive / summary.total_reviews) * 100);
            result = {
                review_percent: percent,
                total_reviews: summary.total_reviews,
                review_desc: summary.review_score_desc
            };
        }

        reviewCache.set(appid, { data: result, expiresAt: Date.now() + REVIEW_CACHE_TTL_MS });
        return result;
    } catch (err) {
        return null;
    }
}

// Games endpoint (lightweight - just name + appid, no review data)
app.post('/api/games', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const steamId = req.user.steamId64;
    
    try {
        const ownedUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`;
        
        const ownedResponse = await fetch(ownedUrl);
        if (!ownedResponse.ok) throw new Error(`Steam API error: ${ownedResponse.status}`);
        
        const ownedData = await ownedResponse.json();
        
        if (!ownedData.response?.games || ownedData.response.games.length === 0) {
            return res.json({ success: true, totalGames: 0, games: [] });
        }

        const ownedGames = ownedData.response.games.map(app => ({
            name: app.name,
            appid: app.appid
        }));

        console.log(`🎮 Retrieved ${ownedGames.length} games for ${req.user.displayName}`);
        
        res.json({
            success: true,
            totalGames: ownedGames.length,
            games: ownedGames
        });

    } catch (error) {
        console.error('Error fetching games:', error);
        res.status(500).json({ 
            error: 'Failed to fetch games from Steam',
            message: error.message 
        });
    }
});

// Endpoint to fetch review for a single game on demand
app.post('/api/game-review/:appid', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { appid } = req.params;
    if (!/^\d+$/.test(appid)) {
        return res.status(400).json({ error: 'Invalid appid' });
    }

    const reviewData = await fetchReviewPercent(appid);
    res.json(reviewData || { review_percent: null });
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
    res.json({ status: 'ok', version: BUILD_VERSION, timestamp: new Date().toISOString() });
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
    console.log(`🏷️  Build: ${BUILD_VERSION}`);
    console.log('===================================');
});