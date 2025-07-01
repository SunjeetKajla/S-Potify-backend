/* --------------------------------------------------
   DOM shortcuts
-------------------------------------------------- */
const $ = id => document.getElementById(id);

const input         = $("playlistInput");
const saveBtn       = $("savePlaylistBtn");
const fetchBtn      = $("submitPlaylist");
const playlistList  = $("savedPlaylistList");
const trackList     = $("track-list");

/* play‑bar elements */
const bigPlayBtn  = document.querySelector(".center-controls .play");
const shuffleBtn  = document.querySelector(".center-controls .shuffle");
const repeatBtn   = document.querySelector(".center-controls .repeat");
const prevBtns    = [...document.querySelectorAll(".prev, #prevBtn")];
const nextBtns    = [...document.querySelectorAll(".next, #nextBtn")];
const smallPlayBtn = $("playPauseBtn");
const seekBar     = $("seek-bar");
const curTimeTxt  = $("current-time");
const durTimeTxt  = $("total-duration");
const volumeBar   = document.querySelector(".volume-bar");

/* track‑info */
const trackInfoDiv = document.querySelector(".left-info");
const titleSpan    = trackInfoDiv.querySelector(".title");
const artistSpan   = trackInfoDiv.querySelector(".artist");

/* --------------------------------------------------
   Audio & State
-------------------------------------------------- */
const audio       = new Audio();
audio.volume      = 1;
let currentTracks = [];
let currentIndex  = 0;

let shuffleMode = false;
let repeatMode  = "none";  // "none" | "all" | "one"

/* --------------------------------------------------
   Helpers
-------------------------------------------------- */
const msToMin = sec =>
  `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;

function setPlaying(t, a) {
  titleSpan.textContent  = t;
  artistSpan.textContent = a;
  trackInfoDiv.style.display = "flex";
  bigPlayBtn .innerHTML = playPauseSVG("pause");
  smallPlayBtn.innerHTML = playPauseSVG("pause");
}
function setPaused() {
  bigPlayBtn .innerHTML = playPauseSVG("play");
  smallPlayBtn.innerHTML = playPauseSVG("play");
}

/* dynamic SVG */
const playPauseSVG = type => type === "pause" ? `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="40" height="40">
    <circle fill="#1db954" cx="256" cy="256" r="256"/>
    <g fill="black">
      <rect x="180" y="150" width="40" height="200" rx="8"/>
      <rect x="292" y="150" width="40" height="200" rx="8"/>
    </g>
  </svg>` : `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="40" height="40">
    <circle fill="#1db954" cx="256" cy="256" r="256"/>
    <polygon fill="black" points="200,160 352,256 200,352"/>
  </svg>`;

/* --------------------------------------------------
   Play one track
-------------------------------------------------- */
async function playTrack(track) {
  const already = titleSpan.textContent === track.title && !audio.paused;
  if (already) return;

  try {
    const { videoId } = await fetch("https://s-potify-backend.onrender.com/api/youtube", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ query: `${track.title} ${track.artist}` })
    }).then(r => r.json());

    audio.src = `https://s-potify-backend.onrender.com/api/stream/${videoId}`;
    await audio.play().catch(e => {
      if (e.name !== "AbortError") throw e;
    });
    setPlaying(track.title, track.artist);
  } catch (err) {
    console.error(err);
    alert("Could not load this track 😢");
  }
}

/* --------------------------------------------------
   Render tracklist
-------------------------------------------------- */
function renderTracks(tracks) {
  trackList.innerHTML = "";
  tracks.forEach((t, i) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="track-index" data-index="${i}">${i + 1}</td>
      <td>${t.title}<br><small>${t.artist}</small></td>
      <td>${t.album}</td>
      <td>${t.added}</td>
      <td>${t.duration}</td>`;
    row.onclick = () => { currentIndex = i; playTrack(t); };
    trackList.appendChild(row);
  });
}

/* --------------------------------------------------
   Controls
-------------------------------------------------- */
bigPlayBtn.onclick = smallPlayBtn.onclick = () => {
  if (!audio.src) return;
  audio.paused ? audio.play().then(()=>setPlaying(titleSpan.textContent, artistSpan.textContent))
               : (audio.pause(), setPaused());
};

prevBtns.forEach(b=> b.onclick = () => {
  currentIndex = currentIndex<=0 ? (repeatMode==="all"?currentTracks.length-1:0)
                                 : currentIndex-1;
  playTrack(currentTracks[currentIndex]);
});
nextBtns.forEach(b=> b.onclick = () => nextTrack());

function nextTrack() {
  if (repeatMode === "one") return playTrack(currentTracks[currentIndex]);

  if (shuffleMode) {
    let nxt;
    do { nxt = Math.floor(Math.random()*currentTracks.length); }
    while (nxt === currentIndex && currentTracks.length>1);
    currentIndex = nxt;
  } else {
    currentIndex++;
    if (currentIndex >= currentTracks.length){
      if(repeatMode==="all") currentIndex=0; else return;
    }
  }
  playTrack(currentTracks[currentIndex]);
}

/* Shuffle toggle + glow */
shuffleBtn.onclick = () => {
  shuffleMode = !shuffleMode;
  shuffleBtn.classList.toggle("glow", shuffleMode);
};

/* Repeat toggle */
repeatBtn.onclick = () => {
  repeatMode = repeatMode==="none" ? "all" : repeatMode==="all" ? "one" : "none";
  repeatBtn.style.color = repeatMode!=="none" ? "#1db954" : "";
  repeatBtn.textContent = repeatMode==="one" ? "🔂" : "🔁";
};

/* --------------------------------------------------
   Seek / Time
-------------------------------------------------- */
let isSeeking = false;

seekBar.oninput = () => {
  if (!audio.duration) return;
  isSeeking = true;
  curTimeTxt.textContent = msToMin((seekBar.value/100)*audio.duration);
};

seekBar.onchange = () => {
  if (!audio.duration) return;
  audio.currentTime = (seekBar.value/100)*audio.duration;
  isSeeking = false;
};

audio.ontimeupdate = () => {
  if (!audio.duration) return;
  if (!isSeeking) {
    seekBar.value = (audio.currentTime/audio.duration)*100;
    curTimeTxt.textContent = msToMin(audio.currentTime);
  }
  durTimeTxt.textContent = msToMin(audio.duration);
};

/* Volume */
volumeBar.oninput = () => { audio.volume = parseFloat(volumeBar.value); };

/* Auto‑advance */
audio.onended = () => nextTrack();

/* --------------------------------------------------
   Save playlist & fetch
-------------------------------------------------- */
saveBtn.addEventListener("click", () => {
  const url = input.value.trim();
  if (!url) return alert("Paste a playlist link first!");

  fetch("https://s-potify-backend.onrender.com/api/playlist",{
    method:"POST",headers:{ "Content-Type":"application/json"},
    body:JSON.stringify({url})
  })
  .then(r=>r.json())
  .then(data=>{
    const li = document.createElement("li");
    li.className = "saved-playlist"; li.dataset.url = url;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = data.name;
    nameSpan.style.flexGrow="1"; nameSpan.style.cursor="pointer";

    const removeBtn = document.createElement("button");
    removeBtn.textContent="−"; removeBtn.style.cssText=
      "margin-left:10px;background:transparent;color:#888;" +
      "border:none;cursor:pointer;font-size:1.2rem";
    removeBtn.onclick = e => { e.stopPropagation(); playlistList.removeChild(li); };

    nameSpan.onclick = () => {
      fetch("https://s-potify-backend.onrender.com/api/playlist",{
        method:"POST",headers:{ "Content-Type":"application/json"},
        body:JSON.stringify({url: li.dataset.url})
      })
      .then(r=>r.json())
      .then(d=>{
        currentTracks = d.tracks;
        currentIndex  = shuffleMode ? Math.floor(Math.random()*d.tracks.length) : 0;
        renderTracks(d.tracks);
        document.querySelector(".playlist-header h1").textContent = d.name;
      })
      .catch(err=>{console.error(err); alert("Couldn't load playlist");});
    };

    li.append(nameSpan,removeBtn); playlistList.appendChild(li); input.value="";
  })
  .catch(err=>{console.error(err); alert("Failed to save playlist");});
});

/* Fetch from input */
fetchBtn.onclick = () => {
  const url = input.value.trim();
  if (!url) return alert("Paste a playlist link first!");

  fetch("https://s-potify-backend.onrender.com/api/playlist",{
    method:"POST",headers:{ "Content-Type":"application/json"},
    body:JSON.stringify({url})
  })
  .then(r=>r.json())
  .then(data=>{
    currentTracks = data.tracks;
    currentIndex  = shuffleMode ? Math.floor(Math.random()*data.tracks.length) : 0;
    renderTracks(data.tracks);
    document.querySelector(".playlist-header h1").textContent = data.name;
  })
  .catch(err=>{console.error(err); alert("Failed to fetch playlist");});
};
