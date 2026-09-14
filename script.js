/**
 * Pixeboxd - Guess the Movie by Pixelated Poster (Letterboxd Edition)
 * Created by Dave Christopher
 */

const TMDB_API_KEY = '87692c7f22cd4552b549f73bee1829c7';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Official Letterboxd Lists
const OFFICIAL_LISTS = [
  { 
    id: 'top_500', 
    name: "Letterboxd's Top 500 Films", 
    desc: 'The official curated list of top 500 narrative feature films', 
    endpoint: '/movie/top_rated'
  },
  { 
    id: 'top_fans', 
    name: 'Top 250 Films with the Most Fans', 
    desc: 'The most beloved fan favorites on Letterboxd', 
    endpoint: '/movie/popular'
  },
  { 
    id: 'one_million_club', 
    name: 'Letterboxd One Million Watched Club', 
    desc: 'Films watched by over 1,000,000 Letterboxd members', 
    url: 'https://letterboxd.com/alexanderh/list/letterboxd-one-million-watched-club/'
  }
];

// Genre ID to Name map
const GENRES_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
};

// Retro Pixel Particle Confetti Effect
function launchPixelConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.classList.remove('hidden');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#00e461', '#ff8000', '#00b4fc', '#ffffff', '#40bcf4'];
  const particles = [];
  const count = 75;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.35 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -12 - 4,
      size: Math.floor(Math.random() * 5) + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity: 0.32,
      alpha: 1,
      decay: Math.random() * 0.015 + 0.01
    });
  }

  let animationId;
  function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let activeCount = 0;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.alpha -= p.decay;

      if (p.alpha > 0) {
        activeCount++;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    });

    ctx.globalAlpha = 1;

    if (activeCount > 0) {
      animationId = requestAnimationFrame(update);
    } else {
      cancelAnimationFrame(animationId);
      canvas.classList.add('hidden');
    }
  }

  update();
}

// Clean letterboxd title to remove &lrm; and any invisible characters
function sanitizeListName(name) {
  if (!name) return 'Letterboxd List';
  return name
    .replace(/&lrm;/gi, '')
    .replace(/&#8206;/gi, '')
    .replace(/&rlm;/gi, '')
    .replace(/&#8207;/gi, '')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[\u200E\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/\s*[•|—–-]\s*Letterboxd.*$/i, '')
    .replace(/\s+on\s+Letterboxd.*$/i, '')
    .trim() || 'Letterboxd List';
}

// Game State
let gameState = {
  selectedCategory: OFFICIAL_LISTS[0],
  customImportedMovies: null,
  movies: [],
  currentMovieIndex: 0,
  currentMovie: null,
  attemptsLeft: 5,
  maxAttempts: 5,
  pixelBlockSize: 16,
  pixelLevels: [16, 12, 9, 5, 2],
  isGameOver: false,
  isWon: false,
  score: 0,
  streak: 0,
  bestStreak: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  unlockedHintsCount: 0,
  posterImage: null
};

// DOM Elements
const setupView = document.getElementById('setup-view');
const gameView = document.getElementById('game-view');
const categoryGrid = document.getElementById('category-grid');
const startGameBtn = document.getElementById('start-game-btn');
const customListInput = document.getElementById('custom-list-input');
const importListBtn = document.getElementById('import-list-btn');
const importStatusText = document.getElementById('import-status-text');
const currentCategoryName = document.getElementById('current-category-name');
const attemptsIndicators = document.getElementById('attempts-indicators');
const posterCardContainer = document.getElementById('poster-card-container');
const posterCanvas = document.getElementById('poster-canvas');
const posterLoading = document.getElementById('poster-loading');
const pixelLevelBadge = document.getElementById('pixel-level-badge');
const hintsContainer = document.getElementById('hints-container');
const hintsList = document.getElementById('hints-list');
const movieSearchInput = document.getElementById('movie-search-input');
const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
const guessForm = document.getElementById('guess-form');
const resultCard = document.getElementById('result-card');
const resultStatusBadge = document.getElementById('result-status-badge');
const resultTitle = document.getElementById('result-title');
const resultGenres = document.getElementById('result-genres');
const resultRating = document.getElementById('result-rating');
const resultOverview = document.getElementById('result-overview');
const viewLetterboxdBtn = document.getElementById('view-letterboxd-btn');
const nextMovieBtn = document.getElementById('next-movie-btn');
const backToSetupBtn = document.getElementById('back-to-setup-btn');
const streakVal = document.getElementById('streak-val');
const scoreVal = document.getElementById('score-val');

// Modals
const modalBackdrop = document.getElementById('modal-backdrop');
const statsModal = document.getElementById('stats-modal');
const rulesModal = document.getElementById('rules-modal');
const statsBtn = document.getElementById('stats-btn');
const rulesBtn = document.getElementById('rules-btn');
const closeModals = document.querySelectorAll('.close-modal-btn');
const logoBtn = document.getElementById('logo-btn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  loadStatsFromStorage();
  renderCategorySelection();
  setupEventListeners();
});

// Load stats from localStorage
function loadStatsFromStorage() {
  const saved = localStorage.getItem('pixeboxd_stats');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      gameState.score = data.score || 0;
      gameState.streak = data.streak || 0;
      gameState.bestStreak = data.bestStreak || 0;
      gameState.gamesPlayed = data.gamesPlayed || 0;
      gameState.gamesWon = data.gamesWon || 0;
    } catch (e) {
      console.error('Error loading stats', e);
    }
  }
  updateStatsUI();
}

function saveStatsToStorage() {
  const data = {
    score: gameState.score,
    streak: gameState.streak,
    bestStreak: gameState.bestStreak,
    gamesPlayed: gameState.gamesPlayed,
    gamesWon: gameState.gamesWon
  };
  localStorage.setItem('pixeboxd_stats', JSON.stringify(data));
  updateStatsUI();
}

function updateStatsUI() {
  if (streakVal) streakVal.textContent = gameState.streak;
  if (scoreVal) scoreVal.textContent = gameState.score;
  const statPlayed = document.getElementById('stat-played');
  const statWon = document.getElementById('stat-won');
  const statStreak = document.getElementById('stat-streak');
  const statBestStreak = document.getElementById('stat-best-streak');
  if (statPlayed) statPlayed.textContent = gameState.gamesPlayed;
  if (statWon) statWon.textContent = gameState.gamesWon;
  if (statStreak) statStreak.textContent = gameState.streak;
  if (statBestStreak) statBestStreak.textContent = gameState.bestStreak;
}

// Render Category Selection Cards
function renderCategorySelection() {
  categoryGrid.innerHTML = '';
  OFFICIAL_LISTS.forEach((cat, index) => {
    const isSelected = gameState.selectedCategory && gameState.selectedCategory.id === cat.id && !gameState.customImportedMovies;
    const card = document.createElement('div');
    const colSpanClass = index === 2 ? 'sm:col-span-2' : '';
    card.className = `p-3.5 sm:p-4 cursor-pointer transition flex flex-col justify-between active:translate-x-[1px] active:translate-y-[1px] ${colSpanClass} ${
      isSelected ? 'pixel-box-active' : 'pixel-box hover:border-[#4e617d]'
    }`;
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2 gap-2">
          <h3 class="font-pixel text-[9px] sm:text-[10px] md:text-xs text-white leading-snug">${cat.name}</h3>
          ${isSelected ? '<span class="text-[#00e461] font-pixel text-[8px] sm:text-[9px] px-1.5 py-0.5 bg-[#141820] border border-[#00e461] shrink-0">SELECTED</span>' : ''}
        </div>
        <p class="font-pixel text-[8px] sm:text-[9px] text-[#9ab] mb-2 leading-[1.9]">${cat.desc}</p>
      </div>
    `;
    card.addEventListener('click', () => {
      gameState.selectedCategory = cat;
      gameState.customImportedMovies = null;
      customListInput.value = '';
      importStatusText.classList.add('hidden');
      renderCategorySelection();
    });
    categoryGrid.appendChild(card);
  });
}

// Event Listeners Setup
function setupEventListeners() {
  startGameBtn.addEventListener('click', () => {
    startNewGameSession();
  });
  
  backToSetupBtn.addEventListener('click', () => {
    returnToSetup();
  });
  
  logoBtn.addEventListener('click', () => {
    returnToSetup();
  });

  // Custom List Importer
  importListBtn.addEventListener('click', () => {
    handleCustomListImport();
  });
  
  customListInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCustomListImport();
    }
  });

  // Search input & autocomplete
  let searchTimeout = null;
  movieSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    if (query.length < 2) {
      autocompleteDropdown.classList.add('hidden');
      return;
    }
    searchTimeout = setTimeout(() => fetchAutocomplete(query), 180);
  });

  // Hide autocomplete on outside click
  document.addEventListener('click', (e) => {
    if (!guessForm.contains(e.target) && !autocompleteDropdown.contains(e.target)) {
      autocompleteDropdown.classList.add('hidden');
    }
  });

  // Guess submission
  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = movieSearchInput.value.trim();
    if (!query || gameState.isGameOver || gameState.isWon) return;
    submitGuessByName(query);
  });

  const submitGuessBtn = document.getElementById('submit-guess-btn');
  if (submitGuessBtn) {
    submitGuessBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const query = movieSearchInput.value.trim();
      if (!query || gameState.isGameOver || gameState.isWon) return;
      submitGuessByName(query);
    });
  }

  nextMovieBtn.addEventListener('click', () => {
    loadNextMovieInSession();
  });

  // Modals
  statsBtn.addEventListener('click', () => {
    modalBackdrop.classList.remove('hidden');
    statsModal.classList.remove('hidden');
    rulesModal.classList.add('hidden');
  });

  rulesBtn.addEventListener('click', () => {
    modalBackdrop.classList.remove('hidden');
    rulesModal.classList.remove('hidden');
    statsModal.classList.add('hidden');
  });

  closeModals.forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
    });
  });

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });
}

// Handle Custom Letterboxd List URL Import via Backend API
async function handleCustomListImport() {
  const url = customListInput.value.trim();
  if (!url) {
    importStatusText.textContent = 'Please enter a valid Letterboxd list URL.';
    importStatusText.className = 'text-[9px] sm:text-[10px] text-[#ff8000] mt-2.5 font-pixel leading-relaxed';
    importStatusText.classList.remove('hidden');
    return;
  }

  importStatusText.textContent = 'Importing Letterboxd list (30-50 films)...';
  importStatusText.className = 'text-[9px] sm:text-[10px] text-[#9ab] mt-2.5 font-pixel leading-relaxed';
  importStatusText.classList.remove('hidden');
  importListBtn.disabled = true;

  try {
    const res = await fetch('/api/import-letterboxd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.success && data.movies && data.movies.length > 0) {
      const cleanName = sanitizeListName(data.listName);
      gameState.customImportedMovies = data.movies;
      gameState.selectedCategory = {
        name: cleanName,
        url: url,
        desc: `Imported ${data.movies.length} movies from Letterboxd`
      };
      importStatusText.textContent = `Imported "${cleanName}" (${data.movies.length} films)! Click "START CHALLENGE".`;
      importStatusText.className = 'text-[9px] sm:text-[10px] text-[#00e461] mt-2.5 font-pixel leading-relaxed font-bold';
      renderCategorySelection();
    } else {
      throw new Error(data.error || 'Failed to parse movies from this list.');
    }
  } catch (err) {
    console.error('Import error:', err);
    importStatusText.textContent = err.message || 'Failed to import list. Ensure the URL is a public Letterboxd list.';
    importStatusText.className = 'text-[9px] sm:text-[10px] text-[#ff8000] mt-2.5 font-pixel leading-relaxed';
  } finally {
    importListBtn.disabled = false;
  }
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
  statsModal.classList.add('hidden');
  rulesModal.classList.add('hidden');
}

function returnToSetup() {
  setupView.classList.remove('hidden');
  gameView.classList.add('hidden');
  resultCard.classList.add('hidden');
  movieSearchInput.value = '';
  autocompleteDropdown.classList.add('hidden');
}

// Start Game Session
async function startNewGameSession() {
  setupView.classList.add('hidden');
  gameView.classList.remove('hidden');
  currentCategoryName.textContent = gameState.selectedCategory.name;
  
  posterLoading.classList.remove('hidden');
  resultCard.classList.add('hidden');
  movieSearchInput.value = '';
  
  if (gameState.customImportedMovies && gameState.customImportedMovies.length > 0) {
    gameState.movies = [...gameState.customImportedMovies];
    shuffleArray(gameState.movies);
    gameState.currentMovieIndex = 0;
    setupRound();
  } else {
    await fetchMoviesForOfficialList(gameState.selectedCategory);
    if (gameState.movies.length > 0) {
      gameState.currentMovieIndex = 0;
      setupRound();
    } else {
      returnToSetup();
    }
  }
}

// Fetch movies for official lists
async function fetchMoviesForOfficialList(cat) {
  try {
    if (cat.url) {
      const res = await fetch('/api/import-letterboxd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cat.url })
      });
      const data = await res.json();
      if (data.success && data.movies && data.movies.length > 0) {
        gameState.movies = [...data.movies];
        shuffleArray(gameState.movies);
        return;
      }
    }

    // For TMDB endpoint lists, fetch 2 pages to get 30-40 movies
    const randomPage = Math.floor(Math.random() * 4) + 1;
    const page2 = randomPage + 1;
    const [res1, res2] = await Promise.all([
      fetch(`${TMDB_BASE_URL}${cat.endpoint}?api_key=${TMDB_API_KEY}&page=${randomPage}`),
      fetch(`${TMDB_BASE_URL}${cat.endpoint}?api_key=${TMDB_API_KEY}&page=${page2}`)
    ]);
    const data1 = await res1.json();
    const data2 = await res2.json();
    const combined = [...(data1.results || []), ...(data2.results || [])];
    
    const seen = new Set();
    const unique = [];
    combined.forEach(m => {
      if (m && m.poster_path && m.title && m.overview && !seen.has(m.id)) {
        seen.add(m.id);
        unique.push(m);
      }
    });

    gameState.movies = unique.slice(0, 50);
    shuffleArray(gameState.movies);
  } catch (err) {
    console.error('Error fetching official list movies:', err);
    gameState.movies = [];
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Setup a new round for current movie
function setupRound() {
  if (gameState.currentMovieIndex >= gameState.movies.length) {
    shuffleArray(gameState.movies);
    gameState.currentMovieIndex = 0;
  }

  gameState.currentMovie = gameState.movies[gameState.currentMovieIndex];
  gameState.attemptsLeft = gameState.maxAttempts;
  gameState.pixelBlockSize = gameState.pixelLevels[0];
  gameState.isGameOver = false;
  gameState.isWon = false;
  gameState.unlockedHintsCount = 0;

  resultCard.classList.add('hidden');
  hintsContainer.classList.add('hidden');
  hintsList.innerHTML = '';
  movieSearchInput.value = '';
  movieSearchInput.disabled = false;
  autocompleteDropdown.classList.add('hidden');

  if (posterCardContainer) {
    posterCardContainer.classList.remove('animate-pixel-glow');
    posterCardContainer.classList.remove('animate-pixel-shake');
  }

  updateAttemptsUI();
  updatePixelBadge();

  // Load Poster Image
  const posterUrl = `${TMDB_IMAGE_BASE}${gameState.currentMovie.poster_path}`;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    gameState.posterImage = img;
    posterLoading.classList.add('hidden');
    drawPixelatedPoster(gameState.pixelBlockSize);
  };
  img.onerror = () => {
    console.warn('Failed to load poster image, skipping...');
    gameState.currentMovieIndex++;
    setupRound();
  };
  img.src = posterUrl;
}

// Canvas Pixelation Engine
function drawPixelatedPoster(blockSize) {
  const canvas = posterCanvas;
  const ctx = canvas.getContext('2d');
  const img = gameState.posterImage;
  if (!img) return;

  const targetWidth = 300;
  const targetHeight = Math.round((img.height / img.width) * targetWidth);
  
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  if (blockSize <= 1) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return;
  }

  const smallWidth = Math.max(1, Math.floor(targetWidth / blockSize));
  const smallHeight = Math.max(1, Math.floor(targetHeight / blockSize));

  const offscreen = document.createElement('canvas');
  offscreen.width = smallWidth;
  offscreen.height = smallHeight;
  const offCtx = offscreen.getContext('2d');

  offCtx.imageSmoothingEnabled = true;
  offCtx.drawImage(img, 0, 0, smallWidth, smallHeight);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(offscreen, 0, 0, smallWidth, smallHeight, 0, 0, targetWidth, targetHeight);
}

// Update Attempts UI indicators
function updateAttemptsUI() {
  attemptsIndicators.innerHTML = '';
  for (let i = 1; i <= gameState.maxAttempts; i++) {
    const bubble = document.createElement('div');
    const isSpent = i > gameState.attemptsLeft;
    bubble.className = `w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center font-pixel text-[9px] sm:text-[10px] transition-all ${
      isSpent 
        ? 'bg-[#161b24] text-[#678] border border-[#323d4e]' 
        : 'bg-[#00e461] text-[#14181c] border border-[#00a845]'
    }`;
    bubble.textContent = i;
    attemptsIndicators.appendChild(bubble);
  }
}

function updatePixelBadge() {
  const levelNames = ['LVL 1 (BLUR)', 'LVL 2 (SHARP)', 'LVL 3 (CLEAR)', 'LVL 4 (DETAIL)', 'LVL 5 (CLEAR)'];
  const attemptIndex = gameState.maxAttempts - gameState.attemptsLeft;
  pixelLevelBadge.textContent = levelNames[Math.min(attemptIndex, levelNames.length - 1)];
}

// Live Autocomplete Search via TMDB
async function fetchAutocomplete(query) {
  try {
    const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      renderAutocompleteSuggestions(data.results.slice(0, 5));
    } else {
      autocompleteDropdown.classList.add('hidden');
    }
  } catch (err) {
    console.error('Autocomplete error:', err);
    autocompleteDropdown.classList.add('hidden');
  }
}

function renderAutocompleteSuggestions(movies) {
  autocompleteDropdown.innerHTML = '';
  movies.forEach(movie => {
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    const item = document.createElement('div');
    item.className = 'px-3.5 py-2.5 sm:px-4 sm:py-3 hover:bg-[#263141] cursor-pointer flex items-center justify-between font-pixel text-[9px] sm:text-[10px] transition';
    item.innerHTML = `
      <div class="flex items-center space-x-2 sm:space-x-2.5 truncate mr-2">
        <span class="font-bold text-white truncate">${movie.title}</span>
        <span class="text-[#678] shrink-0">(${year})</span>
      </div>
      <span class="text-[#9ab] shrink-0">${movie.vote_average ? movie.vote_average.toFixed(1) : ''}</span>
    `;
    item.addEventListener('click', () => {
      movieSearchInput.value = movie.title;
      autocompleteDropdown.classList.add('hidden');
      submitGuess(movie);
    });
    autocompleteDropdown.appendChild(item);
  });
  autocompleteDropdown.classList.remove('hidden');
}

async function submitGuessByName(query) {
  autocompleteDropdown.classList.add('hidden');
  try {
    const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const targetNorm = normalizeTitle(gameState.currentMovie.title);
      let matchedMovie = data.results.find(m => m.id === gameState.currentMovie.id || normalizeTitle(m.title) === targetNorm);
      
      if (!matchedMovie) {
        matchedMovie = data.results[0];
      }
      submitGuess(matchedMovie);
    } else {
      handleIncorrectGuess();
    }
  } catch {
    handleIncorrectGuess();
  }
}

function submitGuess(guessedMovie) {
  if (gameState.isGameOver || gameState.isWon) return;

  const targetTitle = normalizeTitle(gameState.currentMovie.title);
  const guessedTitle = normalizeTitle(guessedMovie.title);
  
  const isCorrect = (guessedMovie.id === gameState.currentMovie.id) || 
                    (targetTitle === guessedTitle) ||
                    (targetTitle.includes(guessedTitle) && guessedTitle.length >= 4) ||
                    (guessedTitle.includes(targetTitle) && targetTitle.length >= 4);

  if (isCorrect) {
    handleWinGame();
  } else {
    handleIncorrectGuess();
  }
}

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/^a\s+/i, '')
    .replace(/^an\s+/i, '')
    .replace(/[^a-z0-9]/g, '');
}

function handleIncorrectGuess() {
  gameState.attemptsLeft--;
  updateAttemptsUI();

  // Shake poster card and search input
  if (posterCardContainer) {
    posterCardContainer.classList.remove('animate-pixel-shake');
    void posterCardContainer.offsetWidth;
    posterCardContainer.classList.add('animate-pixel-shake');
  }

  if (movieSearchInput) {
    movieSearchInput.classList.remove('animate-pixel-shake');
    void movieSearchInput.offsetWidth;
    movieSearchInput.classList.add('animate-pixel-shake');
    movieSearchInput.classList.add('border-[#ff8000]');
    setTimeout(() => movieSearchInput.classList.remove('border-[#ff8000]'), 400);
    movieSearchInput.value = '';
  }

  if (gameState.attemptsLeft <= 0) {
    handleLossGame();
  } else {
    const attemptIndex = gameState.maxAttempts - gameState.attemptsLeft;
    gameState.pixelBlockSize = gameState.pixelLevels[attemptIndex] || 2;
    drawPixelatedPoster(gameState.pixelBlockSize);
    updatePixelBadge();
    unlockNextHint();
  }
}

function unlockNextHint() {
  gameState.unlockedHintsCount++;
  hintsContainer.classList.remove('hidden');

  const movie = gameState.currentMovie;
  const hints = [];

  if (movie.release_date) {
    hints.push({ label: 'RELEASE YEAR', value: movie.release_date.split('-')[0] });
  }
  if (movie.genre_ids && movie.genre_ids.length > 0) {
    const genreName = GENRES_MAP[movie.genre_ids[0]] || 'Feature Film';
    hints.push({ label: 'PRIMARY GENRE', value: genreName });
  }
  if (movie.original_language) {
    hints.push({ label: 'LANGUAGE', value: movie.original_language.toUpperCase() });
  }

  hintsList.innerHTML = '';
  const currentHints = hints.slice(0, gameState.unlockedHintsCount);
  currentHints.forEach(h => {
    const card = document.createElement('div');
    card.className = 'pixel-box p-2.5 sm:p-3 text-center animate-fadeIn';
    card.innerHTML = `
      <div class="font-pixel text-[8px] sm:text-[9px] text-[#678]">${h.label}</div>
      <div class="font-pixel text-[9px] sm:text-[10px] font-bold text-white mt-1.5">${h.value}</div>
    `;
    hintsList.appendChild(card);
  });
}

function handleWinGame() {
  gameState.isWon = true;
  gameState.isGameOver = true;
  gameState.gamesPlayed++;
  gameState.gamesWon++;
  gameState.streak++;
  if (gameState.streak > gameState.bestStreak) {
    gameState.bestStreak = gameState.streak;
  }
  const points = gameState.attemptsLeft * 100 + 200;
  gameState.score += points;

  launchPixelConfetti();

  if (posterCardContainer) {
    posterCardContainer.classList.add('animate-pixel-glow');
  }

  saveStatsToStorage();
  revealPosterAndShowResult(true);
}

function handleLossGame() {
  gameState.isGameOver = true;
  gameState.gamesPlayed++;
  gameState.streak = 0;

  saveStatsToStorage();
  revealPosterAndShowResult(false);
}

function revealPosterAndShowResult(isWin) {
  drawPixelatedPoster(1);
  pixelLevelBadge.textContent = 'REVEALED';
  pixelLevelBadge.className = 'font-semibold text-white font-pixel';

  movieSearchInput.disabled = true;
  autocompleteDropdown.classList.add('hidden');

  const movie = gameState.currentMovie;
  const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
  
  resultStatusBadge.textContent = isWin ? 'CORRECT GUESS!' : 'GAME OVER — OUT OF ATTEMPTS';
  resultStatusBadge.className = `inline-block px-2.5 py-1 font-pixel text-[8px] uppercase tracking-wider mb-2 ${
    isWin ? 'bg-[#00e461]/20 text-[#00e461] border border-[#00e461]/40' : 'bg-[#ff8000]/20 text-[#ff8000] border border-[#ff8000]/40'
  }`;

  resultTitle.textContent = `${movie.title} (${year})`;
  
  const genreNames = (movie.genre_ids || []).map(id => GENRES_MAP[id]).filter(Boolean).slice(0, 3);
  resultGenres.textContent = genreNames.join(' • ') || 'Feature Film';
  
  resultRating.textContent = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10` : 'N/A';
  resultOverview.textContent = movie.overview || 'No overview available.';
  
  const letterboxdSearchSlug = movie.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  viewLetterboxdBtn.href = `https://letterboxd.com/film/${letterboxdSearchSlug}/`;

  resultCard.classList.remove('hidden');
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function loadNextMovieInSession() {
  gameState.currentMovieIndex++;
  setupRound();
}
