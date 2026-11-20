(() => {
  'use strict';
  const app = window.TimeExperience;

  // Crea elementos del DOM y asigna el contenido textual como texto.
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach(child => {
      if (child === null || child === undefined) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }
  // Partes comunes del diseño: hojas de fondo, marco de 1920 × 1080 y franja inferior.
  const leaves = () => h('span', { class: 'design-leaves', 'aria-hidden': 'true' });
  const footer = () => h('p', { class: 'design-footer' }, h('span', {}, 'El paso del tiempo'));
  const designButton = (props, label) => h('button', { type: 'button', ...props, class: `design-button ${props.class}` }, h('span', {}, label));

  /* Coordina reflexión, aportes y agradecimiento tras la vejez. */
  class ClosingFlow {
    constructor({ sections, onRepeat, onExit } = {}) {
      this.content = app.ClosingContent;
      this.sections = sections;
      this.onRepeat = onRepeat;
      this.onExit = onExit;
      this.current = null;
      this.timeline = null;
      this.openCard = null;
      this.pointerType = 'mouse';
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.buildReflection();
      this.buildContribute();
      this.buildThanks();
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.openCard) this.closeCards();
      });
    }

    get busy() { return Boolean(this.timeline) || app.runtime.transitioning; }

    // El reloj a la izquierda y el texto a la derecha, como en el diseño.
    buildReflection() {
      const text = this.content.reflection;
      const section = this.sections.reflection;
      this.reflectionHourglass = h('div', { class: 'reflection-hourglass hourglass-stage', role: 'img', 'aria-label': text.hourglass, 'data-reveal': 'art' });
      section.replaceChildren(
        leaves(),
        h('div', { class: 'design-frame' },
          this.reflectionHourglass,
          h('div', { class: 'reflection-copy' },
            h('h2', { class: 'reflection-title', id: 'reflectionTitle', tabindex: '-1', 'data-reveal': '' }, text.title, ' ', h('span', {}, text.subtitle)),
            h('p', { class: 'reflection-lead', 'data-reveal': '' }, text.description.flatMap((line, index) => [index ? ' ' : null, h('span', {}, line)])),
            h('p', { class: 'reflection-question', 'data-reveal': '' }, text.question),
            h('button', { class: 'design-link reflection-decline', type: 'button', 'data-reveal': '', dataset: { closingGo: 'thanks' } }, text.decline),
            designButton({ class: 'reflection-start', 'data-reveal': '', dataset: { closingGo: 'contribute' } }, text.accept)
          )
        ),
        footer()
      );
      section.setAttribute('aria-labelledby', 'reflectionTitle');
      this.bindNavigation(section);
    }

    // Crea el reloj al mostrar la reflexión y lo gira tras la espera configurada.
    showHourglass() {
      if (this.hourglass !== undefined || !app.IntroHourglass) return;
      try {
        this.hourglass = new app.IntroHourglass(this.reflectionHourglass, {
          cover: this.sections.reflection, overflow: .45, fit: { height: .9, width: .9 },
          flipAfter: app.Config.closing?.hourglass?.flipAfterSeconds ?? 3
        });
      } catch (error) {
        this.hourglass = null;
        console.warn('No fue posible crear el reloj de arena del cierre', error);
      }
    }

    // Cada tarjeta muestra su resumen y, al abrirse, su foto y su detalle.
    buildContribute() {
      const text = this.content.contribute;
      const section = this.sections.contribute;
      this.cards = text.cards.map(card => h('article', { class: 'contribute-card', tabindex: '0', 'data-reveal': 'card', 'aria-labelledby': `card-${card.id}` },
        h('div', { class: 'contribute-sheet' },
          h('img', { class: 'contribute-photo', src: card.photo, alt: '' }),
          h('div', { class: 'contribute-summary' },
            h('h3', { class: 'contribute-card__title', id: `card-${card.id}` }, card.title),
            h('p', { class: 'contribute-card__text' }, card.description)
          ),
          h('p', { class: 'contribute-detail' }, card.detail)
        )
      ));
      section.replaceChildren(
        leaves(),
        h('div', { class: 'design-frame' },
          h('h2', { class: 'contribute-title', id: 'contributeTitle', tabindex: '-1', 'data-reveal': '' }, text.title, ' ', h('span', {}, text.subtitle)),
          this.cards,
          designButton({ class: 'contribute-continue', 'data-reveal': 'after', dataset: { closingGo: 'thanks' } }, text.continueLabel)
        ),
        footer()
      );
      section.setAttribute('aria-labelledby', 'contributeTitle');
      this.bindCards(section);
      this.bindNavigation(section);
    }

    // Abre una tarjeta con puntero, teclado o toque; solo una permanece abierta.
    bindCards(section) {
      section.addEventListener('pointerdown', event => {
        this.pointerType = event.pointerType;
        if (event.pointerType === 'touch' && !event.target.closest('.contribute-card')) this.closeCards();
      });
      this.cards.forEach(card => {
        card.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') this.setCard(card, true); });
        card.addEventListener('pointerleave', event => {
          if (event.pointerType !== 'touch' && !card.matches(':focus-visible')) this.setCard(card, false);
        });
        card.addEventListener('focus', () => { if (card.matches(':focus-visible')) this.setCard(card, true); });
        card.addEventListener('blur', () => this.setCard(card, false));
        card.addEventListener('click', () => { if (this.pointerType === 'touch') this.setCard(card, !card.hasAttribute('data-open')); });
      });
    }

    // Una sola abierta a la vez; las transiciones están en styles.css y las hojas siguen a data-active.
    setCard(card, open) {
      if (open === card.hasAttribute('data-open')) return;
      if (open && this.openCard) this.setCard(this.openCard, false);
      card.toggleAttribute('data-open', open);
      if (open) this.openCard = card;
      else if (this.openCard === card) this.openCard = null;
      const section = this.sections.contribute;
      if (this.openCard) section.dataset.active = String(this.cards.indexOf(this.openCard) + 1);
      else delete section.dataset.active;
    }

    closeCards() {
      if (this.openCard) this.setCard(this.openCard, false);
    }

    // El título centrado, «Ver formas de aportar» y los dos enlaces.
    buildThanks() {
      const text = this.content.thanks;
      const section = this.sections.thanks;
      section.replaceChildren(
        leaves(),
        h('div', { class: 'design-frame' },
          h('h2', { class: 'thanks-title', id: 'thanksTitle', tabindex: '-1', 'data-reveal': '' }, text.title.flatMap((line, index) => [index ? ' ' : null, h('span', {}, line)])),
          designButton({ class: 'thanks-contribute', 'data-reveal': '', dataset: { closingGo: 'contribute' } }, text.contribute),
          h('button', { class: 'design-link thanks-repeat', type: 'button', 'data-reveal': '', dataset: { closingAction: 'repeat' } }, text.repeat),
          h('button', { class: 'design-link thanks-exit', type: 'button', 'data-reveal': '', dataset: { closingAction: 'exit' } }, text.exit)
        ),
        footer()
      );
      section.setAttribute('aria-labelledby', 'thanksTitle');
      section.addEventListener('click', event => {
        const action = event.target.closest('[data-closing-action]')?.dataset.closingAction;
        if (!action || this.busy) return;
        if (action === 'repeat') this.onRepeat?.();
        else if (action === 'exit') this.onExit?.();
      });
      this.bindNavigation(section);
    }

    bindNavigation(section) {
      section.addEventListener('click', event => {
        const target = event.target.closest('[data-closing-go]')?.dataset.closingGo;
        if (target) this.go(target);
      });
    }

    // Desvanece la vejez y muestra la reflexión.
    enter(fromSection, onLeft) {
      if (this.busy) return false;
      app.Interface.setLocked(true);
      app.Interface.setPhase('closing-enter');
      this.timeline = gsap.timeline({ onComplete: () => this.settle('reflection') });
      this.timeline
        .to(fromSection, { autoAlpha: 0, y: -18, duration: this.reduced ? .15 : 1.1, ease: 'power2.inOut' })
        .call(() => {
          onLeft?.();
          fromSection.hidden = true;
          gsap.set(fromSection, { clearProps: 'opacity,visibility,transform' });
          this.show('reflection');
        })
        .add(this.reveal('reflection'));
      return true;
    }

    go(name) {
      if (this.busy || name === this.current || !this.sections[name]) return false;
      const from = this.sections[this.current];
      this.closeCards();
      app.Interface.setLocked(true);
      app.Interface.setPhase(`closing-${name}`);
      this.timeline = gsap.timeline({ onComplete: () => this.settle(name) });
      if (from) {
        this.timeline.to(from, { autoAlpha: 0, y: -14, duration: this.reduced ? .12 : .55, ease: 'power2.in' })
          .call(() => {
            from.hidden = true;
            gsap.set(from, { clearProps: 'opacity,visibility,transform' });
          });
      }
      this.timeline.call(() => this.show(name)).add(this.reveal(name));
      return true;
    }

    show(name) {
      this.current = name;
      const section = this.sections[name];
      section.hidden = false;
      section.scrollTop = 0;
      gsap.set(section.querySelectorAll('[data-reveal]'), { autoAlpha: 0 });
      if (name === 'reflection') this.showHourglass();
    }

    // Muestra arte, textos y tarjetas con una entrada suave y escalonada.
    reveal(name) {
      const section = this.sections[name];
      const timeline = gsap.timeline();
      const items = [...section.querySelectorAll('[data-reveal]')];
      const art = items.filter(item => item.dataset.reveal === 'art');
      const cards = items.filter(item => item.dataset.reveal === 'card');
      const after = items.filter(item => item.dataset.reveal === 'after');
      const rest = items.filter(item => !item.dataset.reveal);
      const d = this.reduced ? .1 : 1;
      timeline.call(() => gsap.set(section.querySelectorAll('[data-reveal]'), { autoAlpha: 0 }));
      // Limpia la transformación para integrar la luz del reloj con la página.
      if (art.length) timeline.fromTo(art, { autoAlpha: 0, scale: .9, rotate: -4 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 1.4 * d, ease: 'power3.out', clearProps: 'transform' }, 0);
      timeline.fromTo(rest, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .8 * d, stagger: .13 * d, ease: 'power2.out', clearProps: 'transform' }, art.length ? .35 * d : 0);
      if (cards.length) timeline.fromTo(cards, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .75 * d, stagger: .14 * d, ease: 'power2.out', clearProps: 'transform' }, '-=.35');
      if (after.length) timeline.fromTo(after, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .6 * d, ease: 'power2.out', clearProps: 'transform' }, '-=.25');
      return timeline;
    }

    settle(name) {
      this.timeline = null;
      app.Interface.setLocked(false);
      app.Interface.setPhase(`closing-${name}`);
      this.sections[name].querySelector('h2')?.focus({ preventScroll: true });
    }

    // Oculta la sección y detiene las animaciones al repetir o salir.
    reset() {
      this.timeline?.kill();
      this.timeline = null;
      this.closeCards();
      Object.values(this.sections).forEach(section => {
        gsap.killTweensOf(section);
        gsap.set([section, ...section.querySelectorAll('[data-reveal]')], { clearProps: 'all' });
        section.hidden = true;
      });
      this.current = null;
    }
  }

  app.ClosingFlow = ClosingFlow;
})();
