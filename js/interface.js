(() => {
  'use strict';
  const app = window.TimeExperience = window.TimeExperience || {};
  const cursor = document.getElementById('handCursor');
  const experience = document.getElementById('experience');
  app.runtime = { transitioning: false, phase: 'intro', allowedScenes: new Set(['intro', 'childhood', 'adulthood']) };

  document.documentElement.classList.add('hand-cursor-enabled');
  window.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    cursor.style.transform = `translate3d(${event.clientX - 12}px, ${event.clientY - 8}px, 0)`;
    cursor.classList.add('is-visible');
  }, { passive: true, capture: true });
  window.addEventListener('pointerdown', event => {
    if (event.button === 0) cursor.classList.add('is-closed');
  }, true);
  const release = () => cursor.classList.remove('is-closed');
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', () => { release(); cursor.classList.remove('is-visible'); });
  document.addEventListener('pointerleave', () => { release(); cursor.classList.remove('is-visible'); });

  app.Interface = {
    setLocked(locked) {
      app.runtime.transitioning = locked;
      experience.inert = locked;
      experience.setAttribute('aria-busy', String(locked));
      document.body.classList.toggle('is-transitioning', locked);
    },
    setPhase(phase) {
      app.runtime.phase = phase;
      document.body.dataset.transitionPhase = phase;
    }
  };

  // Capture also blocks independent object/palette listeners while the scene changes.
  ['click', 'pointerdown', 'pointermove', 'wheel', 'keydown'].forEach(type => {
    document.addEventListener(type, event => {
      if (!app.runtime.transitioning) return;
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  });
})();
