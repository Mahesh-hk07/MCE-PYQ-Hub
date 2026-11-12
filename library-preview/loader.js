(() => {
  const fallback = document.getElementById('fallback');
  const loading = document.getElementById('loadingPanel');
  const canvas = document.getElementById('libraryCanvas');

  function supportsWebGL() {
    try {
      return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch (_) { return false; }
  }

  function showFallback() {
    document.body.classList.add('fallback-mode');
    fallback.hidden = false;
    loading.hidden = true;
    canvas.hidden = true;
  }

  if (!supportsWebGL()) {
    showFallback();
    return;
  }

  const load = () => import('/library-preview/library.js?v=4.3').catch((error) => {
    console.error('3D library failed to load:', error);
    showFallback();
  });

  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 800 });
  else setTimeout(load, 80);
})();
