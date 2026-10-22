(() => {
  'use strict';
  const app = window.TimeExperience;
  const introSection = document.querySelector('[data-scene="intro"]');
  const childSection = document.querySelector('[data-scene="childhood"]');
  const message = document.getElementById('childhoodMessage');
  const arrow = document.getElementById('continueArrow');
  const sound = document.getElementById('soundToggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let messageShown = false, arrowShown = false;
  const adultSection = document.querySelector('[data-scene="adulthood"]');
  const adultMessage = document.getElementById('adulthoodMessage');
  const adultArrow = document.getElementById('adulthoodArrow');
  const adultSound = document.getElementById('adulthoodSoundToggle');
  const adultConfig = app.Config.adulthood;
  let adultMessageShown = false, adultArrowShown = false;
  const oldSection = document.querySelector('[data-scene="oldage"]');
  const oldMessage = document.getElementById('oldageMessage');
  const oldArrow = document.getElementById('oldageArrow');
  const oldSound = document.getElementById('oldageSoundToggle');
  const oldConfig = app.Config.oldage;
  let oldMessageShown = false, oldArrowShown = false;

  app.audio = new app.AudioSystem({
    ...app.Config.assets.audio,
    onStateChange(state) {
      const enabled = state.enabled && !state.blocked;
      sound.setAttribute('aria-pressed', String(enabled));
      sound.setAttribute('aria-label', enabled ? 'Silenciar sonido' : 'Activar sonido');
    }
  });
  // Scenario 2 keeps the same audio system: looping music plus one-shot prop effects.
  app.adulthoodAudio = new app.AudioSystem({
    musicSrc: adultConfig.audio.musicSrc,
    effects: { thermos: adultConfig.audio.thermosSrc, clock: adultConfig.audio.clockSrc },
    onStateChange(state) {
      const enabled = state.enabled && !state.blocked;
      adultSound.setAttribute('aria-pressed', String(enabled));
      adultSound.setAttribute('aria-label', enabled ? 'Silenciar sonido' : 'Activar sonido');
    }
  });
  // Scenario 3: looping ambient music (Config.oldage.audio.musicSrc) and an optional water effect.
  app.oldageAudio = new app.AudioSystem({
    musicSrc: oldConfig.audio.musicSrc,
    effects: { water: oldConfig.audio.waterSrc },
    onStateChange(state) {
      const enabled = state.enabled && !state.blocked;
      oldSound.setAttribute('aria-pressed', String(enabled));
      oldSound.setAttribute('aria-label', enabled ? 'Silenciar sonido' : 'Activar sonido');
    }
  });
  adultMessage.querySelector('p').textContent = adultConfig.message;
  oldMessage.querySelector('p').textContent = oldConfig.message;
  app.scenes = new Map();
  const intro = new app.IntroScene(document.getElementById('intro3d'), { photoSources: app.Config.assets.photos });
  app.scenes.set('intro', intro);
  // Portada: reloj de arena 3D junto a la pregunta. Si el navegador no puede crear este segundo
  // contexto WebGL, la portada y el resto de la experiencia siguen funcionando sin él.
  try { app.introHourglass = new app.IntroHourglass(document.getElementById('introHourglass')); }
  catch (error) { console.warn('No fue posible crear el reloj de arena 3D', error); }

  // Scenario 1 completes when its progress bar reaches 100 % (five milestones): the phrase
  // appears below the bar, then the arrow; after a few seconds the phrase fades away.
  function completeChildhood() {
    if (arrowShown) return;
    messageShown = true;
    message.hidden = false;
    gsap.timeline()
      .fromTo(message, { autoAlpha: 0, y: -9 }, { autoAlpha: 1, y: 0, duration: reduced ? .1 : .75, ease: 'power2.out' })
      .call(() => { arrowShown = true; arrow.hidden = false; }, null, reduced ? '>' : '+=.6')
      .fromTo(arrow, { autoAlpha: 0, scale: .85 }, { autoAlpha: 1, scale: 1, duration: reduced ? .1 : .55, ease: 'back.out(1.8)' })
      .to(message, { autoAlpha: 0, y: -9, duration: reduced ? .1 : .8, ease: 'power2.in', onComplete: () => { message.hidden = true; } }, reduced ? '+=3' : '+=4');
  }
  function prepareChildhood() {
    if (!app.scenes.has('childhood')) {
      app.scenes.set('childhood', new app.ChildhoodScene(document.getElementById('childhood3d'), {
        audio: app.audio,
        progressBar: document.getElementById('childhoodProgress'),
        palette: document.getElementById('crayonPalette'),
        onComplete: completeChildhood
      }));
    }
    return app.scenes.get('childhood');
  }
  function enterChildhood() {
    introSection.hidden = true;
    childSection.hidden = false;
    document.body.classList.remove('intro-active');
    prepareChildhood().enter();
  }
  function showBoard() {
    app.scenes.get('childhood')?.exit();
    app.scenes.get('adulthood')?.exit();
    app.scenes.get('oldage')?.exit();
    childSection.hidden = true;
    adultSection.hidden = true;
    oldSection.hidden = true;
    introSection.hidden = false;
    document.body.classList.add('intro-active');
  }
  // Scenario 2 completes when its progress bar reaches 100 % (checklist + secondary props) and
  // the sheet is back on the desk: the phrase appears, then the arrow, and as in scenario 1
  // the phrase fades out slowly a few seconds later.
  function completeAdulthood() {
    if (adultMessageShown) return;
    adultMessageShown = true;
    adultMessage.hidden = false;
    gsap.timeline()
      .fromTo(adultMessage, { autoAlpha: 0, y: -9 }, { autoAlpha: 1, y: 0, duration: reduced ? .1 : .75, delay: reduced ? 0 : .45, ease: 'power2.out' })
      .call(() => { adultArrowShown = true; adultArrow.hidden = false; }, null, reduced ? '>' : '+=.6')
      .fromTo(adultArrow, { autoAlpha: 0, scale: .9 }, { autoAlpha: 1, scale: 1, duration: reduced ? .1 : .55, ease: 'power2.out' })
      .to(adultMessage, { autoAlpha: 0, y: -9, duration: reduced ? .1 : 1.4, ease: 'power1.inOut', onComplete: () => { adultMessage.hidden = true; } }, reduced ? '+=3' : '+=4');
  }
  function prepareAdulthood() {
    if (!app.scenes.has('adulthood')) {
      app.scenes.set('adulthood', new app.AdulthoodScene(document.getElementById('adulthood3d'), {
        audio: app.adulthoodAudio,
        progressBar: document.getElementById('adulthoodProgress'),
        onComplete: completeAdulthood
      }));
    }
    return app.scenes.get('adulthood');
  }
  function enterAdulthood() {
    introSection.hidden = true;
    adultSection.hidden = false;
    document.body.classList.remove('intro-active');
    prepareAdulthood().enter();
  }
  // Scenario 3 completes when its bar reaches 100 % (glasses, chosen pot, full watering and the
  // cup or the radio) and the can is back in place: phrase first, then the arrow.
  function completeOldAge() {
    if (oldMessageShown) return;
    oldMessageShown = true;
    oldMessage.hidden = false;
    gsap.timeline()
      .fromTo(oldMessage, { autoAlpha: 0, y: -9 }, { autoAlpha: 1, y: 0, duration: reduced ? .1 : .85, delay: reduced ? 0 : .4, ease: 'power2.out' })
      .call(() => { oldArrowShown = true; oldArrow.hidden = false; }, null, reduced ? '>' : '+=1.3')
      .fromTo(oldArrow, { autoAlpha: 0, scale: .9 }, { autoAlpha: 1, scale: 1, duration: reduced ? .1 : .55, ease: 'power2.out' });
  }
  function prepareOldAge() {
    if (!app.scenes.has('oldage')) {
      app.scenes.set('oldage', new app.OldAgeScene(document.getElementById('oldage3d'), {
        audio: app.oldageAudio,
        progressBar: document.getElementById('oldageProgress'),
        sceneProgress: document.getElementById('oldageSceneProgress'),
        onComplete: completeOldAge
      }));
    }
    return app.scenes.get('oldage');
  }
  function enterOldAge() {
    introSection.hidden = true;
    oldSection.hidden = false;
    document.body.classList.remove('intro-active');
    prepareOldAge().enter();
  }
  function requestScene(stage) {
    // Future scene entry (vejez): called only after the unlocked photograph fills the frame.
    window.dispatchEvent(new CustomEvent('experience:request-scene', {
      detail: { from: 'intro', to: stage, memory: app.memory, adulthood: app.adulthoodMemory }
    }));
  }
  app.introTransition = new app.SceneTransition({
    intro, prepareChildhood, enterChildhood, enterAdulthood, enterOldAge, requestScene, showBoard,
    beforeStart: () => app.audio.unlock(),
    afterEnter: stage => app.scenes.get(stage).ready()
  });

  sound.addEventListener('click', () => {
    app.audio.toggle();
    app.scenes.get('childhood')?.interact();
  });
  adultSound.addEventListener('click', () => {
    app.adulthoodAudio.toggle();
    app.scenes.get('adulthood')?.interact();
  });
  oldSound.addEventListener('click', () => app.oldageAudio.toggle());

  app.transitions = {
    returnToBoard() {
      const childhood = app.scenes.get('childhood');
      if (!childhood?.active || app.runtime.transitioning || !arrowShown) return false;
      const memory = childhood.getMemory();
      if (!memory.complete) return false;
      app.memory = memory;
      return app.introTransition.returnToBoard({ unlockAdulthood: true });
    },
    toAdulthood() {
      return app.introTransition.enterPhoto('adulthood');
    },
    returnFromAdulthood() {
      const adulthood = app.scenes.get('adulthood');
      if (!adulthood?.active || app.runtime.transitioning || !adultArrowShown) return false;
      const memory = adulthood.getMemory();
      if (!memory.complete) return false;
      app.adulthoodMemory = memory;
      // Unlocks the third photograph (vejez) once; later returns do not repeat it.
      return app.introTransition.returnToBoard({ unlock: 'oldage' });
    },
    toOldAge() {
      return app.introTransition.enterPhoto('oldage');
    },
    leaveOldAge() {
      const oldage = app.scenes.get('oldage');
      if (!oldage?.active || app.runtime.transitioning || !oldArrowShown) return false;
      const memory = oldage.getMemory();
      if (!memory.complete) return false;
      app.oldageMemory = memory;
      window.dispatchEvent(new CustomEvent('experience:scene-complete', { detail: { from: 'oldage', memory } }));
      // SALIDA DEL ESCENARIO 3 → reflexión final (no vuelve al tablero). La escena se
      // desvanece y, al ocultarse, detiene su render y su música.
      return app.closing.enter(oldSection, () => oldage.exit());
    }
  };

  // Cierre: reflexión → formas de aportar → agradecimiento (js/closing-screens.js).
  const veil = document.getElementById('transitionVeil');
  // «Repetir experiencia»: reinicia internamente todo el recorrido (escenas, progreso, candados)
  // y muestra la pantalla introductoria original, sin recargar la página.
  function restartExperience() {
    if (app.runtime.transitioning) return;
    app.Interface.setLocked(true);
    gsap.timeline()
      .to(veil, { opacity: 1, duration: reduced ? .12 : .8, ease: 'power2.inOut' })
      .call(() => {
        app.reset();
        gsap.set(veil, { opacity: 1 });
        app.Interface.setLocked(true);
      })
      .to(veil, { opacity: 0, duration: reduced ? .12 : .8, ease: 'power2.inOut', onComplete: () => app.Interface.setLocked(false) });
  }
  // «Salir de la experiencia»: usa el destino configurado en Config.closing (onExit o exitUrl).
  // Sin destino, vuelve con seguridad a la pantalla inicial sin iniciar ninguna escena.
  function exitExperience() {
    const { exitUrl, onExit } = app.Config.closing;
    if (typeof onExit === 'function') { onExit(); return; }
    if (typeof exitUrl === 'string' && exitUrl.trim()) { location.assign(exitUrl); return; }
    restartExperience();
  }
  app.closing = new app.ClosingFlow({
    sections: {
      reflection: document.querySelector('[data-scene="closing-reflection"]'),
      contribute: document.querySelector('[data-scene="closing-contribute"]'),
      thanks: document.querySelector('[data-scene="closing-thanks"]')
    },
    onRepeat: restartExperience,
    onExit: exitExperience
  });
  app.transitions.restartExperience = restartExperience;
  app.transitions.exitExperience = exitExperience;
  arrow.addEventListener('click', () => {
    if (!app.transitions.returnToBoard()) return;
    gsap.fromTo(arrow, { scale: .91 }, { scale: 1, duration: .3, ease: 'power2.out', overwrite: true });
  });

  adultArrow.addEventListener('click', () => {
    if (!app.transitions.returnFromAdulthood()) return;
    gsap.fromTo(adultArrow, { scale: .91 }, { scale: 1, duration: .3, ease: 'power2.out', overwrite: true });
  });

  oldArrow.addEventListener('click', () => {
    if (!app.transitions.leaveOldAge()) return;
    gsap.fromTo(oldArrow, { scale: .91 }, { scale: 1, duration: .3, ease: 'power2.out', overwrite: true });
  });

  // Reset is a technical API, not an extra button in this phase's interface.
  app.reset = () => {
    app.closing.reset();
    app.scenes.get('oldage')?.exit();
    app.scenes.get('oldage')?.reset();
    oldMessageShown = oldArrowShown = false;
    gsap.killTweensOf([oldMessage, oldArrow]);
    oldMessage.hidden = oldArrow.hidden = true;
    oldSection.hidden = true;
    app.oldageMemory = null;
    app.scenes.get('childhood')?.exit();
    app.scenes.get('adulthood')?.exit();
    app.scenes.get('adulthood')?.reset();
    adultMessageShown = adultArrowShown = false;
    gsap.killTweensOf([adultMessage, adultArrow]);
    adultMessage.hidden = adultArrow.hidden = true;
    adultSection.hidden = true;
    app.adulthoodMemory = null;
    messageShown = arrowShown = false;
    gsap.killTweensOf([message, arrow]);
    message.hidden = arrow.hidden = true;
    app.scenes.get('childhood')?.reset();
    app.memory = null;
    childSection.hidden = true; introSection.hidden = false;
    document.body.classList.add('intro-active');
    app.introTransition.reset();
    intro.resize();
  };
  window.addEventListener('pagehide', () => { app.audio.exit(); app.adulthoodAudio.exit(); app.oldageAudio.exit(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && app.scenes.get('oldage')?.active && !app.runtime.transitioning) app.oldageAudio.enter();
    if (event.persisted && app.scenes.get('childhood')?.active && !app.runtime.transitioning) app.audio.enter();
    if (event.persisted && app.scenes.get('adulthood')?.active && !app.runtime.transitioning) app.adulthoodAudio.enter();
  });

  // Local inspection shortcut; the normal experience always begins at the board.
  const inspect = new URLSearchParams(location.search).get('scene');
  if (inspect === 'childhood') {
    enterChildhood();
    app.Interface.setPhase('childhood');
    prepareChildhood().ready();
  } else if (inspect === 'adulthood') {
    enterAdulthood();
    app.Interface.setPhase('adulthood');
    prepareAdulthood().ready();
  } else if (inspect === 'closing') {
    introSection.hidden = true;
    document.body.classList.remove('intro-active');
    app.closing.go('reflection');
  } else if (inspect === 'oldage') {
    enterOldAge();
    app.Interface.setPhase('oldage');
    prepareOldAge().ready();
  }
})();
