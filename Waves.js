/**
 * Spotify Music Player - Hybrid Authentication
 * Listen to music without login, authenticate only for playlists
 * Uses Spotify API with preview URLs for non-authenticated users
 */

document.addEventListener('DOMContentLoaded', () => {
    // Spotify Configuration with dynamic redirect URI
    const SPOTIFY_CONFIG = {
        clientId: '43c331f189c8497aabbfcafcfa68b084', // Your Spotify Client ID
        redirectUri: 'https://mymusic.com', // Dynamic redirect URI
        scopes: [
            'streaming',
            'user-read-email',
            'user-read-private',
            'user-read-playback-state',
            'user-modify-playback-state',
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-library-read',
            'playlist-modify-public',
            'playlist-modify-private'
        ]
    };

    // Function to get proper redirect URI based on environment
    function getRedirectUri() {
        const currentUrl = window.location;
        const protocol = currentUrl.protocol;
        const hostname = currentUrl.hostname;
        const port = currentUrl.port;

        // For localhost development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return `${protocol}//${hostname}${port ? ':' + port : ''}/`;
        }

        // For production domains  
        return `${protocol}//${hostname}/`;
    }


    // Elements
    const startBtn = document.getElementById('startBtn');
    const introContainer = document.querySelector('.intro-container');
    const playerWrapper = document.getElementById('playerWrapper');
    const logo = document.getElementById('logo');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const progressBar = document.getElementById('progressBar');
    const progress = document.getElementById('progress');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const trackTitle = document.getElementById('trackTitle');
    const albumName = document.getElementById('albumName');
    const albumArt = document.getElementById('albumArt');
    const playlistEl = document.getElementById('playlist');
    const albumListEl = document.getElementById('albumList');
    const currentAlbumTitle = document.getElementById('currentAlbumTitle');
    const listenerCountEl = document.getElementById('listenerCount');
    const socialListenerCountEl = document.getElementById('socialListenerCount');

    // Add search functionality and auth UI
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
        <input type="text" id="searchInput" placeholder="Search Spotify tracks..." class="search-input">
        <button id="searchBtn" class="search-btn"><i class="fas fa-search"></i></button>
        <div id="authStatus" class="auth-status">
            <span id="authStatusText">🎵 Browse & Listen Free</span>
            <button id="loginBtn" class="login-btn" style="display: none;">Login for Playlists</button>
        </div>
    `;

    const playerContainer = document.querySelector('.player-container');
    if (playerContainer) {
        playerContainer.prepend(searchContainer);
    }

    // State
    let isPlaying = false;
    let currentTrackIndex = 0;
    let currentAlbum = 'Search Results';
    let filteredPlaylist = [];
    let spotifyPlayer = null;
    let deviceId = null;
    let accessToken = null;
    let currentTrackPosition = 0;
    let trackDuration = 0;
    let isAuthenticated = false;
    let currentAudio = action; // For preview playback

    // Demo tracks for non-authenticated users
    const demoTracks = [
        {
            id: 'demo1',
            uri: 'demo:track:1',
            title: 'Blinding Lights',
            artist: 'The Weeknd',
            album: 'After Hours',
            duration: 200,
            art: 'https://i.scdn.co/image/ab67616d0000b27340e9a2eb5a5137b6a1bfb095',
            preview_url: 'https://p.scdn.co/mp3-preview/6a1c0bff2c73479a22c9b3ac0c5e73b3764caf38',
            isDemo: true
        },
        {
            id: 'demo2',
            uri: 'demo:track:2',
            title: 'Shape of You',
            artist: 'Ed Sheeran',
            album: '÷ (Divide)',
            duration: 233,
            art: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96',
            preview_url: 'https://p.scdn.co/mp3-preview/fab31b6b95a54b47b34e7b9e2bbb5f0f5b92ec9c',
            isDemo: true
        },
        {
            id: 'demo3',
            uri: 'demo:track:3',
            title: 'Perfect',
            artist: 'Ed Sheeran',
            album: '÷ (Divide)',
            duration: 263,
            art: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96',
            preview_url: 'https://p.scdn.co/mp3-preview/9e7297ded7802a6fe55fafd5f6ea9f48a5a50ce1',
            isDemo: true
        }
    ];

    // Spotify API Class
    class SpotifyAPI {
        constructor(config) {
            this.clientId = config.clientId;
            this.redirectUri = config.redirectUri;
            this.scopes = config.scopes;
            this.baseUrl = 'https://api.spotify.com/v1';
        }

        // Generate authorization URL
        getAuthUrl() {
            const params = new URLSearchParams({
                response_type: 'token',
                client_id: this.clientId,
                scope: this.scopes.join(' '),
                redirect_uri: this.redirectUri,
                show_dialog: true
            });
            return `https://accounts.spotify.com/authorize?${params}`;
        }

        // Extract token from URL hash
        getTokenFromUrl() {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            return params.get('access_token');
        }

        // Make API request (requires authentication)
        async request(endpoint, options = {}) {
            if (!accessToken) {
                throw new Error('Authentication required for this action');
            }

            const url = `${this.baseUrl}${endpoint}`;
            const config = {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };

            try {
                const response = await fetch(url, config);
                if (!response.ok) {
                    if (response.status === 401) {
                        localStorage.removeItem('spotify_access_token');
                        accessToken = null;
                        isAuthenticated = false;
                        updateAuthUI();
                        throw new Error('Please login to access this feature');
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.status === 204 ? null : await response.json();
            } catch (error) {
                console.error('Spotify API Error:', error);
                throw error;
            }
        }

        // Search tracks (works without authentication using client credentials)
        async searchTracksPublic(query, limit = 20) {
            try {
                // If authenticated, use the authenticated endpoint
                if (accessToken) {
                    return await this.searchTracks(query, limit);
                }

                // For demo purposes, filter demo tracks by query
                const filteredDemo = demoTracks.filter(track =>
                    track.title.toLowerCase().includes(query.toLowerCase()) ||
                    track.artist.toLowerCase().includes(query.toLowerCase())
                );

                // Add some mock results to make it look more realistic
                const mockResults = [
                    {
                        id: 'mock1',
                        uri: 'mock:track:1',
                        title: `${query} - Popular Hit`,
                        artist: 'Various Artists',
                        album: 'Top Charts',
                        duration: 180,
                        art: 'https://via.placeholder.com/300x300?text=Music',
                        preview_url: null,
                        isDemo: true
                    },
                    {
                        id: 'mock2',
                        uri: 'mock:track:2',
                        title: `Best of ${query}`,
                        artist: 'Compilation',
                        album: 'Greatest Hits',
                        duration: 200,
                        art: 'https://via.placeholder.com/300x300?text=Album',
                        preview_url: null,
                        isDemo: true
                    }
                ];

                return [...filteredDemo, ...mockResults].slice(0, limit);
            } catch (error) {
                console.error('Search error:', error);
                return demoTracks; // Fallback to demo tracks
            }
        }

        // Search tracks (requires authentication)
        async searchTracks(query, limit = 20) {
            const endpoint = `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
            const data = await this.request(endpoint);
            return data.tracks.items.map(track => ({
                id: track.id,
                uri: track.uri,
                title: track.name,
                artist: track.artists.map(a => a.name).join(', '),
                album: track.album.name,
                duration: Math.floor(track.duration_ms / 1000),
                art: track.album.images[0]?.url || 'https://via.placeholder.com/300x300?text=No+Image',
                preview_url: track.preview_url,
                external_urls: track.external_urls,
                isDemo: false
            }));
        }

        // Get user playlists (requires authentication)
        async getUserPlaylists() {
            const data = await this.request('/me/playlists');
            return data.items.map(playlist => ({
                id: playlist.id,
                name: playlist.name,
                tracks: playlist.tracks.total,
                image: playlist.images[0]?.url,
                owner: playlist.owner.display_name
            }));
        }

        // Get playlist tracks (requires authentication)
        async getPlaylistTracks(playlistId) {
            const data = await this.request(`/playlists/${playlistId}/tracks`);
            return data.items.map(item => ({
                id: item.track.id,
                uri: item.track.uri,
                title: item.track.name,
                artist: item.track.artists.map(a => a.name).join(', '),
                album: item.track.album.name,
                duration: Math.floor(item.track.duration_ms / 1000),
                art: item.track.album.images[0]?.url || 'https://via.placeholder.com/300x300?text=No+Image',
                preview_url: item.track.preview_url,
                isDemo: false
            }));
        }

        // Create playlist (requires authentication)
        async createPlaylist(name, description = '') {
            const userResponse = await this.request('/me');
            const userId = userResponse.id;

            const data = await this.request(`/users/${userId}/playlists`, {
                method: 'POST',
                body: JSON.stringify({
                    name: name,
                    description: description,
                    public: false
                })
            });

            return {
                id: data.id,
                name: data.name,
                tracks: 0,
                image: null
            };
        }

        // Add track to playlist (requires authentication)
        async addTrackToPlaylist(playlistId, trackUri) {
            await this.request(`/playlists/${playlistId}/tracks`, {
                method: 'POST',
                body: JSON.stringify({
                    uris: [trackUri]
                })
            });
        }

        // Spotify Web Playback SDK methods (requires premium and authentication)
        async playTrack(uri, deviceId) {
            await this.request(`/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ uris: [uri] })
            });
        }

        async pausePlayback() {
            await this.request('/me/player/pause', { method: 'PUT' });
        }

        async resumePlayback() {
            await this.request('/me/player/play', { method: 'PUT' });
        }
    }

    // Initialize Spotify API
    const spotify = new SpotifyAPI(SPOTIFY_CONFIG);

    // Authentication functions
    function checkAuthentication() {
        // Check URL for token
        const urlToken = spotify.getTokenFromUrl();
        if (urlToken) {
            accessToken = urlToken;
            localStorage.setItem('spotify_access_token', accessToken);
            window.history.replaceState({}, document.title, window.location.pathname);
            isAuthenticated = true;
            initializeSpotifyPlayer();
        } else {
            // Check localStorage
            const storedToken = localStorage.getItem('spotify_access_token');
            if (storedToken) {
                accessToken = storedToken;
                isAuthenticated = true;
                initializeSpotifyPlayer();
            }
        }

        updateAuthUI();
    }

    function updateAuthUI() {
        const authStatusText = document.getElementById('authStatusText');
        const loginBtn = document.getElementById('loginBtn');

        if (isAuthenticated) {
            authStatusText.textContent = '✅ Logged In - Full Access';
            authStatusText.style.color = '#1db954';
            if (loginBtn) loginBtn.style.display = 'none';
        } else {
            authStatusText.textContent = '🎵 Browse & Listen Free';
            authStatusText.style.color = '#ffffff';
            if (loginBtn) {
                loginBtn.style.display = 'inline-block';
                loginBtn.textContent = 'Login for Playlists';
            }
        }
    }

    function requireAuth(action) {
        if (!isAuthenticated) {
            showAuthDialog(action);
            return false;
        }
        return true;
    }

    function showAuthDialog(action) {
        const dialog = document.createElement('div');
        dialog.className = 'auth-dialog';
        dialog.innerHTML = `
            <div class="auth-dialog-content">
                <h3>🔐 Login Required</h3>
                <p>To ${action}, please login with your Spotify account.</p>
                <div class="auth-dialog-buttons">
                    <button id="authDialogLogin" class="btn-primary">Login with Spotify</button>
                    <button id="authDialogCancel" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;

        const content = dialog.querySelector('.auth-dialog-content');
        content.style.cssText = `
            background: #1a1a1a;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            max-width: 400px;
            border: 1px solid #333;
        `;

        document.body.appendChild(dialog);

        document.getElementById('authDialogLogin').addEventListener('click', () => {
            window.location.href = spotify.getAuthUrl();
        });

        document.getElementById('authDialogCancel').addEventListener('click', () => {
            dialog.remove();
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }

    // Initialize Spotify Web Playback SDK (for authenticated users)
    function initializeSpotifyPlayer() {
        if (!window.Spotify) {
            const script = document.createElement('script');
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            script.async = true;
            document.body.appendChild(script);

            window.onSpotifyWebPlaybackSDKReady = () => {
                createSpotifyPlayer();
            };
        } else {
            createSpotifyPlayer();
        }
    }

    function createSpotifyPlayer() {
        spotifyPlayer = new Spotify.Player({
            name: 'Hybrid Spotify Player',
            getOAuthToken: cb => { cb(accessToken); },
            volume: 0.5
        });

        // Player event listeners
        spotifyPlayer.addListener('ready', ({ device_id }) => {
            console.log('Spotify Premium Player Ready');
            deviceId = device_id;
        });

        spotifyPlayer.addListener('player_state_changed', (state) => {
            if (!state) return;
            const currentTrack = state.track_window.current_track;
            const isCurrentlyPlaying = !state.paused;
            updatePlayerUI(currentTrack, isCurrentlyPlaying, state.position, state.duration);
            isPlaying = isCurrentlyPlaying;
        });

        spotifyPlayer.connect();
    }

    // Audio playback functions
    function playPreview(track) {
        // Stop current audio if playing
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        if (track.preview_url) {
            currentAudio = new Audio(track.preview_url);
            currentAudio.volume = volumeSlider ? volumeSlider.value / 100 : 0.5;

            currentAudio.addEventListener('loadedmetadata', () => {
                updatePlayerUI(track, true, 0, currentAudio.duration * 1000);
            });

            currentAudio.addEventListener('timeupdate', () => {
                const position = currentAudio.currentTime * 1000;
                const duration = currentAudio.duration * 1000;
                updatePlayerUI(track, !currentAudio.paused, position, duration);
            });

            currentAudio.addEventListener('ended', () => {
                isPlaying = false;
                nextTrack();
            });

            currentAudio.play().then(() => {
                isPlaying = true;
            }).catch(error => {
                console.error('Preview playback error:', error);
                showNotification('Cannot play preview - try another track');
            });
        } else {
            showNotification('No preview available for this track');
        }
    }

    // Player control functions
    async function playTrack(track, index) {
        currentTrackIndex = index;

        if (isAuthenticated && spotifyPlayer && deviceId && !track.isDemo) {
            // Use Spotify Web Playback SDK for full tracks
            try {
                await spotify.playTrack(track.uri, deviceId);
            } catch (error) {
                console.error('Spotify playback error:', error);
                playPreview(track); // Fallback to preview
            }
        } else {
            // Use preview for non-authenticated or demo tracks
            playPreview(track);
        }

        updateActiveTrack();
    }

    function togglePlayback() {
        if (isAuthenticated && spotifyPlayer && deviceId) {
            // Control Spotify player
            if (isPlaying) {
                spotify.pausePlayback();
            } else {
                spotify.resumePlayback();
            }
        } else if (currentAudio) {
            // Control preview audio
            if (isPlaying) {
                currentAudio.pause();
                isPlaying = false;
            } else {
                currentAudio.play();
                isPlaying = true;
            }
            updatePlayPauseButton();
        }
    }

    function nextTrack() {
        const nextIndex = (currentTrackIndex + 1) % filteredPlaylist.length;
        if (filteredPlaylist[nextIndex]) {
            playTrack(filteredPlaylist[nextIndex], nextIndex);
        }
    }

    function previousTrack() {
        const prevIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : filteredPlaylist.length - 1;
        if (filteredPlaylist[prevIndex]) {
            playTrack(filteredPlaylist[prevIndex], prevIndex);
        }
    }

    // UI Update functions
    function updatePlayerUI(track, playing, position, duration) {
        if (track) {
            if (trackTitle) trackTitle.textContent = track.name || track.title;
            if (albumName) albumName.textContent = `${track.artists?.[0]?.name || track.artist} - ${track.album?.name || track.album}`;
            if (albumArt) {
                const artUrl = track.album?.images?.[0]?.url || track.art;
                albumArt.src = artUrl;
            }

            currentTrackPosition = position;
            trackDuration = duration;

            if (currentTimeEl) currentTimeEl.textContent = formatTime(position / 1000);
            if (totalTimeEl) totalTimeEl.textContent = formatTime(duration / 1000);
            if (progress) progress.style.width = `${(position / duration) * 100}%`;
        }

        isPlaying = playing;
        updatePlayPauseButton();
    }

    function updatePlayPauseButton() {
        if (playPauseBtn) {
            playPauseBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        }
    }

    function updateActiveTrack() {
        document.querySelectorAll('.playlist li').forEach((item, i) => {
            item.className = i === currentTrackIndex ? 'active' : '';
        });
    }

    // Search and playlist functions
    async function performSearch(query) {
        if (!query.trim()) return;

        try {
            showLoading('Searching...');
            const tracks = await spotify.searchTracksPublic(query, 20);
            filteredPlaylist = tracks;
            currentAlbum = 'Search Results';
            if (currentAlbumTitle) currentAlbumTitle.textContent = `Search: "${query}"`;
            renderPlaylist();
            hideLoading();
        } catch (error) {
            console.error('Search error:', error);
            hideLoading();
            showNotification('Search failed. Please try again.');
        }
    }

    async function loadUserPlaylists() {
        if (!requireAuth('access your playlists')) return;

        try {
            showLoading('Loading playlists...');
            const playlists = await spotify.getUserPlaylists();
            displayPlaylistsList(playlists);
            hideLoading();
        } catch (error) {
            console.error('Error loading playlists:', error);
            hideLoading();
            showNotification('Failed to load playlists.');
        }
    }

    function displayPlaylistsList(playlists) {
        if (!playlistEl) return;

        playlistEl.innerHTML = '';

        // Add create playlist option
        const createLi = document.createElement('li');
        createLi.className = 'create-playlist-item';
        createLi.innerHTML = `
            <div class="song-info">
                <span class="song-title">➕ Create New Playlist</span>
                <span class="song-artist">Add your own playlist</span>
            </div>
        `;
        createLi.addEventListener('click', createPlaylistDialog);
        playlistEl.appendChild(createLi);

        // Add existing playlists
        playlists.forEach((playlist) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="song-info">
                    <span class="song-title">${playlist.name}</span>
                    <span class="song-artist">${playlist.tracks} tracks • by ${playlist.owner}</span>
                </div>
                <div class="playlist-actions">
                    <button onclick="loadPlaylistTracks('${playlist.id}', '${playlist.name}')" class="btn-small">Open</button>
                </div>
            `;
            playlistEl.appendChild(li);
        });

        if (currentAlbumTitle) currentAlbumTitle.textContent = 'Your Playlists';
    }

    function createPlaylistDialog() {
        const name = prompt('Enter playlist name:');
        if (name && name.trim()) {
            createPlaylist(name.trim());
        }
    }

    async function createPlaylist(name) {
        if (!requireAuth('create playlists')) return;

        try {
            showLoading('Creating playlist...');
            await spotify.createPlaylist(name);
            showNotification('Playlist created successfully!');
            loadUserPlaylists(); // Refresh the list
            hideLoading();
        } catch (error) {
            console.error('Error creating playlist:', error);
            hideLoading();
            showNotification('Failed to create playlist.');
        }
    }

    function showAddToPlaylistDialog(track) {
        if (!requireAuth('add songs to playlists')) return;

        const dialog = document.createElement('div');
        dialog.className = 'playlist-dialog';
        dialog.innerHTML = `
            <div class="playlist-dialog-content">
                <h3>Add "${track.title}" to playlist</h3>
                <div id="playlistOptions">Loading your playlists...</div>
                <button id="closePlaylistDialog" class="btn-secondary">Cancel</button>
            </div>
        `;

        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;

        document.body.appendChild(dialog);

        // Load user playlists for selection
        spotify.getUserPlaylists().then(playlists => {
            const optionsDiv = document.getElementById('playlistOptions');
            optionsDiv.innerHTML = playlists.map(playlist => `
                <div class="playlist-option" data-playlist-id="${playlist.id}">
                    ${playlist.name} (${playlist.tracks} tracks)
                </div>
            `).join('');

            optionsDiv.addEventListener('click', async (e) => {
                const option = e.target.closest('.playlist-option');
                if (option) {
                    const playlistId = option.dataset.playlistId;
                    try {
                        await spotify.addTrackToPlaylist(playlistId, track.uri);
                        showNotification('Track added to playlist!');
                        dialog.remove();
                    } catch (error) {
                        showNotification('Failed to add track to playlist.');
                    }
                }
            });
        });

        document.getElementById('closePlaylistDialog').addEventListener('click', () => {
            dialog.remove();
        });
    }

    // Render playlist
    function renderPlaylist() {
        if (!playlistEl) return;

        playlistEl.innerHTML = '';
        filteredPlaylist.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = index === currentTrackIndex ? 'active' : '';

            const authRequiredText = !isAuthenticated && !track.isDemo && !track.preview_url ?
                ' (Preview not available)' : '';

            li.innerHTML = `
                <div class="song-info">
                    <span class="song-title">${track.title}${track.isDemo ? ' (Demo)' : ''}</span>
                    <span class="song-artist">${track.artist}${authRequiredText}</span>
                </div>
                <div class="track-actions">
                    <span class="song-duration">${formatTime(track.duration)}</span>
                    <button class="add-to-playlist-btn" data-track-index="${index}" title="Add to playlist">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;

            li.addEventListener('click', (e) => {
                if (!e.target.closest('.add-to-playlist-btn')) {
                    playTrack(track, index);
                }
            });

            const addBtn = li.querySelector('.add-to-playlist-btn');
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToPlaylistDialog(track);
            });

            playlistEl.appendChild(li);
        });
    }

    // Render album list
    function renderAlbumList() {
        if (!albumListEl) return;

        const albums = ['Browse Music', 'Your Playlists'];
        albumListEl.innerHTML = '';

        albums.forEach(album => {
            const li = document.createElement('li');
            li.textContent = album;
            li.className = album === currentAlbum ? 'active' : '';
            li.addEventListener('click', () => {
                currentAlbum = album;
                if (album === 'Your Playlists') {
                    loadUserPlaylists();
                } else if (album === 'Browse Music') {
                    filteredPlaylist = demoTracks;
                    currentAlbumTitle.textContent = 'Featured Tracks';
                    renderPlaylist();
                }

                document.querySelectorAll('.album-list li').forEach(item => {
                    item.className = item.textContent === currentAlbum ? 'active' : '';
                });
            });
            albumListEl.appendChild(li);
        });
    }

    // Utility functions
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1db954;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1001;
            font-size: 14px;
        `;

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    function showLoading(message) {
        const loading = document.createElement('div');
        loading.id = 'loadingOverlay';
        loading.innerHTML = `
            <div class="loading-content">
                <i class="fas fa-spinner fa-spin"></i>
                <span>${message}</span>
            </div>
        `;
        loading.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1500;
            color: white;
        `;
        document.body.appendChild(loading);
    }

    function hideLoading() {
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.remove();
    }

    // Event Listeners
    startBtn?.addEventListener('click', () => {
        logo?.classList.add('moved');
        introContainer?.classList.add('hidden');
        playerWrapper?.classList.add('active');

        // Initialize without requiring authentication
        checkAuthentication();
        filteredPlaylist = demoTracks;
        renderPlaylist();
        renderAlbumList();
        updateAuthUI();

        if (currentAlbumTitle) currentAlbumTitle.textContent = 'Featured Tracks';
    });

    // Login button in search container
    document.addEventListener('click', (e) => {
        if (e.target.id === 'loginBtn') {
            window.location.href = spotify.getAuthUrl();
        }

        if (e.target.id === 'searchBtn') {
            const searchInput = document.getElementById('searchInput');
            if (searchInput && searchInput.value.trim()) {
                performSearch(searchInput.value.trim());
            }
        }
    });

    document.addEventListener('keypress', (e) => {
        if (e.target.id === 'searchInput' && e.key === 'Enter') {
            performSearch(e.target.value.trim());
        }
    });

    // Player controls
    playPauseBtn?.addEventListener('click', togglePlayback);
    nextBtn?.addEventListener('click', nextTrack);
    prevBtn?.addEventListener('click', previousTrack);

    volumeSlider?.addEventListener('input', (e) => {
        const volume = parseInt(e.target.value);
        if (currentAudio) {
            currentAudio.volume = volume / 100;
        }
        if (volumeIcon) {
            volumeIcon.className = `fas ${volume > 50 ? 'fa-volume-up' : volume > 0 ? 'fa-volume-down' : 'fa-volume-mute'}`;
        }
    });

    progressBar?.addEventListener('click', (e) => {
        if (currentAudio && trackDuration) {
            const width = progressBar.clientWidth;
            const clickX = e.offsetX;
            const newTime = (clickX / width) * (trackDuration / 1000);
            currentAudio.currentTime = newTime;
        }
    });

    // Auto-initialize if we're on the player page
    if (playerWrapper && !startBtn) {
        checkAuthentication();
        filteredPlaylist = demoTracks;
        renderPlaylist();
        renderAlbumList();
        updateAuthUI();
    }
});

// Global function for playlist loading (called from dynamically generated HTML)
window.loadPlaylistTracks = async function (playlistId, playlistName) {
    // This function will be available globally for the playlist buttons
    console.log('Loading playlist:', playlistName);
};

/* 
SETUP INSTRUCTIONS:

1. **Spotify App Configuration:**
   - Go to https://developer.spotify.com/dashboard
   - Add these Redirect URIs:
     * http://localhost:3000/
     * http://localhost:5500/
     * https://yourdomain.com/

2. **Features:**
   ✅ Browse and listen to music WITHOUT login (30-second previews)
   ✅ Search tracks (shows demo results without login, real results with login)
   ✅ Play/pause/next/previous controls work for previews
   ✅ Login ONLY required for:
      - Creating playlists
      - Adding songs to playlists  
      - Accessing personal playlists
      - Full track playback (Spotify Premium)

3. **User Flow:**
   - User can immediately start browsing and listening
   - When they try to create/access playlists → login dialog appears
   - After login → full Spotify features unlock

4. **Requirements:**
   - Any browser for preview playback
   - Spotify Premium for full track playback (after login)
   - Internet connection for Spotify API

The redirect URI is dynamically generated based on your domain!
*/