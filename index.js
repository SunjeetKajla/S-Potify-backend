// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const yts = require('yt-search');   // 🔄 new search lib
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* ─── Spotify setup ─────────────────────────────────────────── */
const spotify = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

async function refreshToken() {
  try {
    const { body } = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(body.access_token);
    console.log('✅ Spotify token refreshed');
    setTimeout(refreshToken, (body.expires_in - 300) * 1000);
  } catch (err) {
    console.error('❌ Token refresh failed', err);
  }
}
refreshToken();

function ensureSpotifyReady(res) {
  if (!spotify.getAccessToken()) {
    res.status(503).json({ error: "Spotify auth not ready – try again in a few seconds" });
    return false;
  }
  return true;
}

const msToMinSec = ms => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
  return `${m}:${s}`;
};

/* ─── 1)  Spotify playlist → tracks ─────────────────────────── */
app.post('/api/playlist', async (req, res) => {
  if (!ensureSpotifyReady(res)) return;
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing playlist URL' });

  const idMatch = url.match(/playlist\/([a-zA-Z0-9]+)(?:\?|$)/i);
  const id = idMatch ? idMatch[1] : null;

  if (!id) {
    return res.status(400).json({ error: 'Invalid playlist URL format' });
  }

  try {
    // 🔹 Get playlist metadata (name, description, etc.)
    const meta = await spotify.getPlaylist(id);
    const playlistName = meta.body.name || "Untitled Playlist";

    // 🔸 Fetch all tracks
    let tracks = [];
    for (let offset = 0, chunk = 100, total = 1; offset < total; offset += chunk) {
      const resp = await spotify.getPlaylistTracks(id, { offset, limit: chunk });
      total = resp.body.total;

      tracks.push(...resp.body.items.map(it => {
        const t = it.track;
        return {
          title: t.name,
          artist: t.artists.map(a => a.name).join(', '),
          album: t.album.name,
          added: (it.added_at || '').split('T')[0],
          duration: msToMinSec(t.duration_ms)
        };
      }));
    }

    res.json({ name: playlistName, tracks });
  } catch (err) {
    console.error('🔴 Spotify API error', err.body || err);
    res.status(500).json({ error: 'Spotify fetch failed' });
  }
});

/* ─── 2)  Query YouTube → top video id  ─────────────────────── */
app.post('/api/youtube', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    const results = await yts(query);
    const video = results.videos[0];
    if (!video) return res.status(404).json({ error: 'No video found' });

    res.json({ videoId: video.videoId, title: video.title });
  } catch (err) {
    console.error('🔴 yt-search error', err);
    res.status(500).json({ error: 'YouTube search failed' });
  }
});

/* ─── 3)  Stream audio for chosen video id  ─────────────────── */
// server/index.js
const pump = require('pump');         // tiny util to pipe with error handling

app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  if (!ytdl.validateID(id)) return res.status(400).send('Bad video id');

  const range = req.headers.range || "bytes=0-";
  const info = await ytdl.getInfo(id);
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio', filter: 'audioonly'
  });

  // Parse range
  const [start, end] = range.replace(/bytes=/, "").split("-").map(Number);
  const total = Number(format.contentLength);
  const chunkEnd = end || total - 1;
  const chunkSize = chunkEnd - start + 1;

  res.status(206)
    .set({
      "Content-Range": `bytes ${start}-${chunkEnd}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "audio/webm"
    });

  // Pipe only the requested slice
  const stream = ytdl.downloadFromInfo(info, {
    quality: format.itag,
    range: { start, end: chunkEnd }
  });

  pump(stream, res);
});


/* ─── Launch ───────────────────────────────────────────────── */
app.listen(PORT, () =>
  console.log(`🎧 S-Potify backend running → http://localhost:${PORT}`)
);
