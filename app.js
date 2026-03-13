const APP = (() => {
  const DB_NAME = 'ai-art-vote-v3';
  const DB_VERSION = 1;
  const STORE_ARTWORKS = 'artworks';
  const STORE_META = 'meta';
  const LS_VOTES = 'ai_vote_records_v3';
  const LS_SETTINGS = 'ai_vote_settings_v3';
  const defaultSettings = {
    eventName: '未來畫境之AI創作大賽',
    adminPin: '123456',
    showRanking: true,
    allowVoting: true,
    wallSeconds: 6,
  };

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function getSettings() {
    const saved = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
    return { ...defaultSettings, ...saved };
  }

  function saveSettings(next) {
    localStorage.setItem(LS_SETTINGS, JSON.stringify({ ...getSettings(), ...next }));
  }

  function getVotes() {
    return JSON.parse(localStorage.getItem(LS_VOTES) || '[]');
  }

  function saveVotes(votes) {
    localStorage.setItem(LS_VOTES, JSON.stringify(votes));
  }

  function emailKey(email) {
    return String(email || '').trim().toLowerCase();
  }

  function formatDate(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function scoreOptions(selected = 10) {
    return Array.from({ length: 10 }, (_, i) => {
      const v = i + 1;
      return `<option value="${v}" ${Number(selected) === v ? 'selected' : ''}>${v}</option>`;
    }).join('');
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_ARTWORKS)) {
          const store = db.createObjectStore(STORE_ARTWORKS, { keyPath: 'id' });
          store.createIndex('order', 'order', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeName, mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = action(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllArtworks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ARTWORKS, 'readonly');
      const store = tx.objectStore(STORE_ARTWORKS);
      const req = store.getAll();
      req.onsuccess = () => {
        const data = (req.result || []).sort((a,b)=> (a.order ?? 0) - (b.order ?? 0));
        resolve(data);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function addArtwork(artwork) {
    const list = await getAllArtworks();
    const order = list.length ? Math.max(...list.map(x => x.order || 0)) + 1 : 1;
    const record = {
      id: uid(),
      title: artwork.title,
      author: artwork.author || '',
      description: artwork.description || '',
      image: artwork.image || '',
      order,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await tx(STORE_ARTWORKS, 'readwrite', (store) => store.put(record));
    return record;
  }

  async function updateArtwork(id, patch) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tr = db.transaction(STORE_ARTWORKS, 'readwrite');
      const store = tr.objectStore(STORE_ARTWORKS);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const current = getReq.result;
        if (!current) return reject(new Error('作品不存在'));
        const next = { ...current, ...patch, updatedAt: Date.now() };
        store.put(next);
        resolve(next);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function deleteArtwork(id) {
    await tx(STORE_ARTWORKS, 'readwrite', (store) => store.delete(id));
  }

  async function reorderArtworks(ids) {
    const list = await getAllArtworks();
    const map = new Map(list.map(x => [x.id, x]));
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tr = db.transaction(STORE_ARTWORKS, 'readwrite');
      const store = tr.objectStore(STORE_ARTWORKS);
      ids.forEach((id, idx) => {
        const item = map.get(id);
        if (item) store.put({ ...item, order: idx + 1, updatedAt: Date.now() });
      });
      tr.oncomplete = () => resolve(true);
      tr.onerror = () => reject(tr.error);
    });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailKey(email));
  }

  function hasVoted(email, artworkId) {
    return getVotes().some(v => emailKey(v.email) === emailKey(email) && v.artworkId === artworkId);
  }

  function submitVote({ email, artworkId, creative, technical, overall, concept }) {
    const votes = getVotes();
    if (hasVoted(email, artworkId)) throw new Error('此 Email 已經投過這件作品。');
    const record = {
      id: uid(),
      email: emailKey(email),
      artworkId,
      creative: Number(creative),
      technical: Number(technical),
      overall: Number(overall),
      concept: Number(concept),
      total: Number(creative) + Number(technical) + Number(overall) + Number(concept),
      votedAt: Date.now(),
    };
    votes.push(record);
    saveVotes(votes);
    return record;
  }

  async function getRanking() {
    const artworks = await getAllArtworks();
    const votes = getVotes();
    const map = new Map();
    artworks.forEach(a => map.set(a.id, {
      id: a.id,
      title: a.title,
      author: a.author,
      image: a.image,
      description: a.description,
      voteCount: 0,
      totalSum: 0,
      creativeAvg: 0,
      technicalAvg: 0,
      overallAvg: 0,
      conceptAvg: 0,
      average: 0,
    }));

    const sums = {};
    votes.forEach(v => {
      if (!map.has(v.artworkId)) return;
      const item = map.get(v.artworkId);
      item.voteCount += 1;
      item.totalSum += v.total;
      sums[v.artworkId] ||= {creative:0, technical:0, overall:0, concept:0};
      sums[v.artworkId].creative += v.creative;
      sums[v.artworkId].technical += v.technical;
      sums[v.artworkId].overall += v.overall;
      sums[v.artworkId].concept += v.concept;
    });

    const arr = Array.from(map.values()).map(item => {
      if (item.voteCount > 0) {
        item.average = Number((item.totalSum / item.voteCount).toFixed(2));
        item.creativeAvg = Number((sums[item.id].creative / item.voteCount).toFixed(2));
        item.technicalAvg = Number((sums[item.id].technical / item.voteCount).toFixed(2));
        item.overallAvg = Number((sums[item.id].overall / item.voteCount).toFixed(2));
        item.conceptAvg = Number((sums[item.id].concept / item.voteCount).toFixed(2));
      }
      return item;
    });

    arr.sort((a,b) => b.average - a.average || b.voteCount - a.voteCount || a.title.localeCompare(b.title, 'zh-Hant'));
    return arr;
  }

  async function getDashboardData() {
    const artworks = await getAllArtworks();
    const votes = getVotes();
    const ranking = await getRanking();
    const uniqueVoters = new Set(votes.map(v => emailKey(v.email))).size;
    return {
      artworks,
      votes,
      ranking,
      stats: {
        artworkCount: artworks.length,
        voteCount: votes.length,
        voterCount: uniqueVoters,
      },
    };
  }

  function exportCSV(rows, filename = 'vote-results.csv') {
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  function toast(message, type = 'ok') {
    const box = document.createElement('div');
    box.className = `toast ${type}`;
    box.textContent = message;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('show'));
    setTimeout(() => {
      box.classList.remove('show');
      setTimeout(() => box.remove(), 250);
    }, 2200);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function setEventTitle() {
    document.querySelectorAll('[data-event-name]').forEach(el => el.textContent = getSettings().eventName);
    document.title = `${getSettings().eventName}｜投票系統`;
  }

  function nav(active) {
    return `
      <div class="nav-shell">
        <a class="brand" href="index.html">✨ <span data-event-name></span></a>
        <nav>
          <a class="${active==='vote'?'active':''}" href="index.html">投票頁</a>
          <a class="${active==='ranking'?'active':''}" href="ranking.html">排行榜</a>
          <a class="${active==='wall'?'active':''}" href="wall.html">作品牆</a>
          <a class="${active==='admin'?'active':''}" href="admin.html">管理入口</a>
        </nav>
      </div>
    `;
  }

  function isAdminAuthed() {
    return sessionStorage.getItem('ai_vote_admin_ok') === '1';
  }

  return {
    uid,
    getSettings,
    saveSettings,
    getVotes,
    saveVotes,
    formatDate,
    scoreOptions,
    getAllArtworks,
    addArtwork,
    updateArtwork,
    deleteArtwork,
    reorderArtworks,
    validateEmail,
    hasVoted,
    submitVote,
    getRanking,
    getDashboardData,
    exportCSV,
    toast,
    escapeHtml,
    setEventTitle,
    nav,
    emailKey,
    isAdminAuthed,
  };
})();
