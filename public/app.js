const form = document.getElementById('scrape-form');
const usernameInput = document.getElementById('username');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const profileCard = document.getElementById('profile-card');
const statsEl = document.getElementById('stats');
const tweetsList = document.getElementById('tweets-list');

function setStatus(message, type) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.className = `status ${type || ''}`;
}

function formatNumber(n) {
  return Number(n).toLocaleString('es-ES');
}

function renderResults(data) {
  const { profile, tweets, stats } = data;

  profileCard.innerHTML = `
    <img src="${profile.profilePicture}" alt="" onerror="this.style.display='none'" />
    <div class="meta">
      <h2>${escapeHtml(profile.name)}</h2>
      <div class="handle">@${escapeHtml(profile.username)}</div>
      <p class="bio">${escapeHtml(profile.bio)}</p>
      <div class="counts">
        <span>${formatNumber(profile.following)} siguiendo</span>
        · <span>${formatNumber(profile.followers)} seguidores</span>
        ${profile.location !== 'No especificada' ? ` · ${escapeHtml(profile.location)}` : ''}
      </div>
    </div>
  `;

  statsEl.innerHTML = `
    <span>${stats.totalTweetsExtracted} tweets</span>
    <span>${formatNumber(stats.totalLikes)} likes</span>
    <span>${formatNumber(stats.totalRetweets)} retweets</span>
    <span>${formatNumber(stats.totalReplies)} respuestas</span>
    <span>${formatNumber(stats.totalViews)} views</span>
  `;

  tweetsList.innerHTML = tweets.length
    ? tweets.map((t) => `
        <li class="tweet">
          <div class="date">${escapeHtml(t.displayDate)}</div>
          <p>${escapeHtml(t.text || '(sin texto)')}</p>
          <div class="metrics">
            ❤️ ${formatNumber(t.likes)}
            · 🔁 ${formatNumber(t.retweets)}
            · 💬 ${formatNumber(t.replies)}
            · 👁️ ${formatNumber(t.views)}
          </div>
        </li>
      `).join('')
    : '<li class="tweet"><p>No se encontraron tweets visibles en la carga inicial.</p></li>';

  resultsEl.hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim().replace(/^@/, '');
  if (!username) return;

  submitBtn.disabled = true;
  resultsEl.hidden = true;
  setStatus('Scrapeando perfil… esto puede tardar un minuto.', 'loading');

  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || 'Error al scrapear.', 'error');
      return;
    }

    setStatus('');
    renderResults(data);
  } catch {
    setStatus('No se pudo conectar con el servidor.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
