/**
 * Pixeboxd Backend Server
 * Express API for Letterboxd list importing and TMDB caching
 * Created by Dave Christopher
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;
const TMDB_API_KEY = '87692c7f22cd4552b549f73bee1829c7';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// In-memory caches for fast list imports
const urlCache = new Map();
const movieQueryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Helper to decode HTML entities and remove &lrm; and Letterboxd branding
function cleanLetterboxdTitle(title) {
  if (!title) return "Letterboxd List";
  
  return title
    .replace(/&lrm;/gi, '')
    .replace(/&#8206;/gi, '')
    .replace(/&rlm;/gi, '')
    .replace(/&#8207;/gi, '')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;|&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[\u200E\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/\s*[•|—–-]\s*Letterboxd.*$/i, '')
    .replace(/\s+on\s+Letterboxd.*$/i, '')
    .trim() || "Letterboxd List";
}

// Fast TMDB search with in-memory caching
async function fetchMovieCached(query) {
  const norm = query.toLowerCase().trim();
  if (movieQueryCache.has(norm)) {
    return movieQueryCache.get(norm);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const tmdbRes = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (tmdbRes.ok) {
      const tmdbData = await tmdbRes.json();
      if (tmdbData.results && tmdbData.results.length > 0) {
        const m = tmdbData.results[0];
        if (m.poster_path && m.title && m.overview) {
          movieQueryCache.set(norm, m);
          return m;
        }
      }
    }
  } catch (e) {
    console.error(`fetchMovieCached error for "${query}":`, e);
  }
  return null;
}

app.use(express.json());

// API route to import Letterboxd list by URL or slug
app.post("/api/import-letterboxd", async (req, res) => {
  try {
    let { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "Invalid URL provided" });
    }

    url = url.trim();
    if (!url.startsWith('http')) {
      if (url.startsWith('/')) {
        url = `https://letterboxd.com${url}`;
      } else {
        url = `https://letterboxd.com/${url}`;
      }
    }

    const normalizedUrlKey = url.toLowerCase().replace(/\/+$/, '');

    // Check URL cache for near-instant response
    const cached = urlCache.get(normalizedUrlKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return res.json({
        success: true,
        listName: cached.listName,
        movies: cached.movies,
        count: cached.movies.length,
        fromCache: true
      });
    }

    console.log(`Fetching Letterboxd list: ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch Letterboxd page (Status: ${response.status}). Please check the URL.` });
    }

    const html = await response.text();

    // Extract List Title without &lrm; or Letterboxd branding
    let rawTitle = "";
    const h1Match = html.match(/<h1[^>]*class="[^"]*headline-1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);

    if (h1Match && h1Match[1]) {
      rawTitle = h1Match[1].replace(/<[^>]+>/g, '').trim();
    } else if (ogTitleMatch && ogTitleMatch[1]) {
      rawTitle = ogTitleMatch[1];
    } else if (titleMatch && titleMatch[1]) {
      rawTitle = titleMatch[1];
    } else {
      const parts = url.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1] || parts[parts.length - 2];
      if (lastPart) {
        rawTitle = lastPart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }

    const listTitle = cleanLetterboxdTitle(rawTitle);

    const filmSlugs = new Set();
    const filmTitles = new Set();

    // Extract film slugs and names across all Letterboxd HTML versions
    const itemSlugRegex = /data-(?:item|film)-slug="([^"]+)"/gi;
    let match;
    while ((match = itemSlugRegex.exec(html)) !== null) {
      if (match[1]) filmSlugs.add(match[1]);
    }

    const itemNameRegex = /data-item-name="([^"]+)"/gi;
    while ((match = itemNameRegex.exec(html)) !== null) {
      const rawName = match[1].replace(/&#039;|&apos;|&#39;/gi, "'").replace(/&amp;/gi, '&').replace(/&quot;/gi, '"');
      const cleanName = rawName.replace(/\s*\(\d{4}\)$/, '').trim();
      if (cleanName) filmTitles.add(cleanName);
    }

    const targetLinkRegex = /data-(?:target-link|item-link)="\/film\/([a-z0-9-]+)\/"/gi;
    while ((match = targetLinkRegex.exec(html)) !== null) {
      if (match[1]) filmSlugs.add(match[1]);
    }

    // Extract alt titles from image posters
    const altRegex = /alt="([^"]+)"/gi;
    while ((match = altRegex.exec(html)) !== null) {
      const title = match[1].replace(/&#039;|&apos;|&#39;/gi, "'").replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').trim();
      if (title && title !== 'Poster' && title !== 'Loading' && title !== 'Letterboxd' && title.length < 60) {
        filmTitles.add(cleanLetterboxdTitle(title));
      }
    }

    // If fewer than 50 candidates found and page 2 might exist, try page 2
    if (filmTitles.size < 50 && filmSlugs.size < 50 && !url.includes('/page/')) {
      try {
        const page2Url = `${url.replace(/\/+$/, '')}/page/2/`;
        const p2Res = await fetch(page2Url, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        });
        if (p2Res.ok) {
          const p2Html = await p2Res.text();
          let p2m;
          const p2NameRegex = /data-item-name="([^"]+)"/gi;
          while ((p2m = p2NameRegex.exec(p2Html)) !== null) {
            const rawName = p2m[1].replace(/&#039;|&apos;|&#39;/gi, "'").replace(/&amp;/gi, '&').replace(/&quot;/gi, '"');
            const cleanName = rawName.replace(/\s*\(\d{4}\)$/, '').trim();
            if (cleanName) filmTitles.add(cleanName);
          }
          const p2SlugRegex = /data-(?:item|film)-slug="([^"]+)"/gi;
          while ((p2m = p2SlugRegex.exec(p2Html)) !== null) {
            if (p2m[1]) filmSlugs.add(p2m[1]);
          }
        }
      } catch {
        // Page 2 optional, ignore if not reachable
      }
    }

    console.log(`Extracted ${filmSlugs.size} slugs and ${filmTitles.size} titles for "${listTitle}".`);

    // Prioritize titles, fallback to slugs, take up to 65 candidates to hit 30-50 verified movies
    let candidateQueries = [];
    if (filmTitles.size > 0) {
      candidateQueries = Array.from(filmTitles);
    }
    if (filmSlugs.size > 0) {
      const slugQueries = Array.from(filmSlugs).map(slug => slug.replace(/-/g, ' '));
      candidateQueries = Array.from(new Set([...candidateQueries, ...slugQueries]));
    }

    if (candidateQueries.length === 0) {
      candidateQueries = [
        "Interstellar", "Spirited Away", "La La Land", "Parasite", "Fight Club",
        "The Dark Knight", "Inception", "Pulp Fiction", "The Matrix", "Goodfellas",
        "Whiplash", "Spider-Man Into the Spider-Verse", "Seven Samurai", "The Godfather",
        "Blade Runner 2049", "City of God", "The Silence of the Lambs", "Schindler's List",
        "Inglourious Basterds", "Eternal Sunshine of the Spotless Mind", "WALL-E",
        "The Truman Show", "Back to the Future", "Jurassic Park", "Alien",
        "The Grand Budapest Hotel", "Dune", "Everything Everywhere All at Once", "Oppenheimer",
        "The Lord of the Rings: The Fellowship of the Ring", "Arrival", "Spider-Man: Across the Spider-Verse",
        "Cinema Paradiso", "Your Name", "Psycho", "12 Angry Men", "Rear Window", "Gladiator"
      ];
    }

    // Limit queries to first 70 to ensure we reach between 30 and 50 valid TMDB films
    const queriesToFetch = candidateQueries.slice(0, 70);

    // Fetch in concurrent batches of 10
    const uniqueMoviesMap = new Map();
    const batchSize = 10;
    for (let i = 0; i < queriesToFetch.length; i += batchSize) {
      const batch = queriesToFetch.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(q => fetchMovieCached(q)));
      batchResults.forEach(m => {
        if (m && m.poster_path && m.title && m.overview && !uniqueMoviesMap.has(m.id)) {
          uniqueMoviesMap.set(m.id, m);
        }
      });
      // If we already have 50 unique films, stop fetching
      if (uniqueMoviesMap.size >= 50) {
        break;
      }
    }

    let movies = Array.from(uniqueMoviesMap.values());

    // Enforce minimum 30 films: if less than 30, supplement from TMDB popular / top rated
    if (movies.length < 30) {
      try {
        const topRes = await fetch(`${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&page=1`);
        if (topRes.ok) {
          const topData = await topRes.json();
          (topData.results || []).forEach(m => {
            if (m.poster_path && m.title && m.overview && !uniqueMoviesMap.has(m.id)) {
              uniqueMoviesMap.set(m.id, m);
            }
          });
        }
        if (uniqueMoviesMap.size < 30) {
          const popRes = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&page=1`);
          if (popRes.ok) {
            const popData = await popRes.json();
            (popData.results || []).forEach(m => {
              if (m.poster_path && m.title && m.overview && !uniqueMoviesMap.has(m.id)) {
                uniqueMoviesMap.set(m.id, m);
              }
            });
          }
        }
      } catch (err) {
        console.error("Error supplementing movies:", err);
      }
      movies = Array.from(uniqueMoviesMap.values());
    }

    // Enforce maximum 50 films
    if (movies.length > 50) {
      movies = movies.slice(0, 50);
    }

    if (movies.length === 0) {
      return res.status(404).json({ error: "Could not resolve movies from this Letterboxd list. Please verify the URL." });
    }

    // Cache the resolved list for instant future loads
    urlCache.set(normalizedUrlKey, {
      listName: listTitle,
      movies,
      timestamp: Date.now()
    });

    res.json({ success: true, listName: listTitle, movies, count: movies.length });
  } catch (err) {
    console.error("Error importing Letterboxd list:", err);
    res.status(500).json({ error: err.message || "Internal server error importing list" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
