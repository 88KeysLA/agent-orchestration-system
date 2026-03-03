/**
 * Villa Portal — Images Module
 * Gallery of generated images with thumbnails + fullscreen lightbox
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  let images = [];
  let els = {};

  function renderGrid() {
    if (images.length === 0) {
      els.grid.innerHTML = '<div class="image-empty">No generated images yet.<br>Try: <code>imagen:a beautiful sunset over mountains</code></div>';
      return;
    }
    els.grid.innerHTML = images.map(img =>
      `<div class="image-thumb" data-name="${esc(img.name)}">
        <img src="/api/images/${encodeURIComponent(img.name)}" alt="${esc(img.name)}" loading="lazy">
      </div>`
    ).join('');
    els.count.textContent = `${images.length} images`;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openLightbox(name) {
    const src = `/api/images/${encodeURIComponent(name)}`;
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<button class="lightbox-close">&times;</button><img src="${src}" alt="${esc(name)}">`;
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.classList.contains('lightbox-close')) lb.remove();
    });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', handler); }
    });
    document.body.appendChild(lb);
  }

  async function fetchImages() {
    try {
      const data = await VP.apiFetch('/api/images');
      images = data.images || [];
      renderGrid();
    } catch {}
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  VP.modules.images = {
    init() {
      const panel = document.getElementById('panel-images');
      panel.innerHTML = `
        <div class="images-container">
          <div class="images-toolbar">
            <h2><span id="images-count">--</span></h2>
            <button id="images-refresh">Refresh</button>
          </div>
          <div class="image-grid" id="image-grid"></div>
        </div>
      `;

      els.grid = document.getElementById('image-grid');
      els.count = document.getElementById('images-count');

      document.getElementById('images-refresh').addEventListener('click', fetchImages);

      // Click handler for thumbnails
      els.grid.addEventListener('click', (e) => {
        const thumb = e.target.closest('.image-thumb');
        if (thumb) openLightbox(thumb.dataset.name);
      });
    },

    onActivate() {
      fetchImages();
    },

    refresh() {
      fetchImages();
    }
  };
})();
