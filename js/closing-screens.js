(() => {
  'use strict';
  const app = window.TimeExperience;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Small DOM helper: h('p', { class: 'x' }, 'text', child, ...). Text is always set as text.
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
  function svg(markup, className) {
    const holder = document.createElementNS(SVG_NS, 'svg');
    holder.setAttribute('viewBox', '0 0 24 24');
    holder.setAttribute('aria-hidden', 'true');
    if (className) holder.setAttribute('class', className);
    holder.innerHTML = markup;
    return holder;
  }
  // Title parts → text with the highlighted fragment wrapped in a <span>.
  function titleParts(parts) {
    return parts.map(part => part.highlight ? h('span', { class: 'closing-highlight' }, part.text) : part.text);
  }

  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    infinity: '<path d="M12 12c-1.8-2.4-3.3-3.6-5-3.6a3.6 3.6 0 0 0 0 7.2c1.7 0 3.2-1.2 5-3.6Zm0 0c1.8 2.4 3.3 3.6 5 3.6a3.6 3.6 0 0 0 0-7.2c-1.7 0-3.2 1.2-5 3.6Z"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>'
  };
  const ARROW = '<path d="M4 12h16m-6-6 6 6-6 6"/>';
  const ARROW_UP = '<path d="M7 17 17 7M8 7h9v9"/>';
  const REPEAT = '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>';
  const CLOSE = '<path d="m6 6 12 12M18 6 6 18"/>';
  const STAR = '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z"/>';

  /**
   * Final section of the experience, after scenario 3:
   *   reflection ──«Sí, quiero conocer»──▶ contribute ──«Continuar al cierre»──▶ thanks
   *        └────────────«Ahora no»─────────────────────────────────────────────▲
   *   thanks: «Ver formas de aportar» → contribute · «Repetir experiencia» / «Salir» → callbacks.
   * Every screen is a full-viewport <section>; contents come from TimeExperience.ClosingContent.
   */
  class ClosingFlow {
    constructor({ sections, onRepeat, onExit } = {}) {
      this.content = app.ClosingContent;
      this.sections = sections;
      this.onRepeat = onRepeat;
      this.onExit = onExit;
      this.current = null;
      this.timeline = null;
      this.ambient = [];
      this.modal = null;
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.buildReflection();
      this.buildContribute();
      this.buildThanks();
      this.buildModal();
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && this.modal.open) this.closeModal();
      });
    }

    get busy() { return Boolean(this.timeline) || app.runtime.transitioning; }

    // ---------- Construction ----------
    buildReflection() {
      const text = this.content.reflection;
      const section = this.sections.reflection;
      section.replaceChildren(
        h('div', { class: 'reflection-art', 'data-reveal': 'art', 'aria-hidden': 'true' }, this.reflectionArt()),
        h('div', { class: 'reflection-copy' },
          h('p', { class: 'closing-eyebrow', 'data-reveal': '' }, text.eyebrow),
          h('h2', { class: 'closing-title reflection-title', id: 'reflectionTitle', tabindex: '-1', 'data-reveal': '' }, titleParts(text.title)),
          h('p', { class: 'closing-lead', 'data-reveal': '' }, text.description),
          h('hr', { class: 'closing-rule', 'data-reveal': '' }),
          h('p', { class: 'reflection-question', 'data-reveal': '' }, text.question),
          h('div', { class: 'closing-actions', 'data-reveal': '' },
            h('button', { class: 'closing-button closing-button--primary', type: 'button', dataset: { closingGo: 'contribute' } }, text.accept, svg(ARROW)),
            h('button', { class: 'closing-link', type: 'button', dataset: { closingGo: 'thanks' } }, text.decline)
          )
        )
      );
      section.setAttribute('aria-labelledby', 'reflectionTitle');
      this.bindNavigation(section);
    }

    // Large warm circle with two slow clock hands and faint orbits (time, without numbers).
    reflectionArt() {
      const art = document.createElementNS(SVG_NS, 'svg');
      art.setAttribute('viewBox', '0 0 400 400');
      art.innerHTML = `
        <defs>
          <radialGradient id="closingSun" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stop-color="#fbe3a2"/>
            <stop offset="55%" stop-color="#f6c95a"/>
            <stop offset="100%" stop-color="#f2bb31"/>
          </radialGradient>
          <radialGradient id="closingHalo" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stop-color="#c0dea4" stop-opacity=".18"/>
            <stop offset="100%" stop-color="#c0dea4" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="198" fill="url(#closingHalo)"/>
        <g class="art-orbits" fill="none" stroke-width="1.2">
          <ellipse class="art-orbit art-orbit--a" cx="200" cy="200" rx="188" ry="150" stroke="#c0dea4" stroke-opacity=".45"/>
          <ellipse class="art-orbit art-orbit--b" cx="200" cy="200" rx="170" ry="196" stroke="#47acc2" stroke-opacity=".4"/>
        </g>
        <circle class="art-sun" cx="200" cy="200" r="140" fill="url(#closingSun)"/>
        <circle cx="200" cy="200" r="118" fill="none" stroke="#fff8e6" stroke-opacity=".35" stroke-width="1.5"/>
        <g class="art-hand art-hand--long"><path d="M200 196 L352 186 Q360 192 352 202 L200 206 Z" fill="#c0dea4"/></g>
        <g class="art-hand art-hand--short"><path d="M200 195 L80 172 Q70 180 78 190 L200 206 Z" fill="#a8835a"/></g>
        <circle cx="200" cy="200" r="9" fill="#604427"/>
        <path class="art-spark" d="M200 182c1.6 10.6 6.8 15.8 17.4 17.4-10.6 1.6-15.8 6.8-17.4 17.4-1.6-10.6-6.8-15.8-17.4-17.4 10.6-1.6 15.8-6.8 17.4-17.4Z" fill="#fffaf0"/>
        <circle class="art-dot" cx="356" cy="122" r="6" fill="#47acc2"/>`;
      return art;
    }

    buildContribute() {
      const text = this.content.contribute;
      const section = this.sections.contribute;
      const cards = text.cards.map(card => h('article', { class: `closing-card closing-card--${card.accent}`, 'data-reveal': 'card', 'aria-labelledby': `card-${card.id}` },
        h('p', { class: 'closing-card__number' }, card.number),
        h('span', { class: 'closing-card__icon' }, svg(ICONS[card.icon] || ICONS.sun)),
        h('p', { class: 'closing-card__category' }, card.category),
        h('h3', { class: 'closing-card__title', id: `card-${card.id}` }, card.title),
        h('p', { class: 'closing-card__description' }, card.description),
        h('div', { class: 'closing-card__impact' },
          h('p', { class: 'closing-card__impact-label' }, text.impactLabel),
          h('p', { class: 'closing-card__impact-text' }, card.impact)
        ),
        h('button', { class: 'closing-card__more', type: 'button', 'aria-haspopup': 'dialog', dataset: { card: card.id } }, card.action, svg(ARROW_UP))
      ));
      this.contributeBody = h('div', { class: 'contribute-body' },
        h('header', { class: 'contribute-header' },
          h('h2', { class: 'closing-title contribute-title', id: 'contributeTitle', tabindex: '-1', 'data-reveal': '' }, titleParts(text.title)),
          h('p', { class: 'closing-lead', 'data-reveal': '' }, text.description)
        ),
        h('div', { class: 'closing-cards' }, cards),
        h('div', { class: 'contribute-footer', 'data-reveal': '' },
          h('button', { class: 'closing-button closing-button--dark', type: 'button', dataset: { closingGo: 'thanks' } }, text.continueLabel, svg(ARROW))
        )
      );
      section.replaceChildren(this.contributeBody);
      section.setAttribute('aria-labelledby', 'contributeTitle');
      section.addEventListener('click', event => {
        const button = event.target.closest('[data-card]');
        if (button) this.openModal(button.dataset.card, button);
      });
      this.bindNavigation(section);
    }

    buildThanks() {
      const text = this.content.thanks;
      const section = this.sections.thanks;
      const rings = h('div', { class: 'thanks-rings', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(index => h('span', { class: `thanks-ring thanks-ring--${index}` })));
      section.replaceChildren(
        rings,
        h('div', { class: 'thanks-copy' },
          h('span', { class: 'thanks-badge', 'data-reveal': '' }, svg(STAR)),
          h('p', { class: 'closing-eyebrow', 'data-reveal': '' }, text.eyebrow),
          h('h2', { class: 'closing-title thanks-title', id: 'thanksTitle', tabindex: '-1', 'data-reveal': '' }, titleParts(text.title)),
          h('p', { class: 'closing-lead', 'data-reveal': '' }, text.description),
          h('div', { class: 'closing-actions thanks-actions', 'data-reveal': '' },
            h('button', { class: 'closing-button closing-button--dark', type: 'button', dataset: { closingAction: 'repeat' } }, svg(REPEAT), text.repeat),
            h('button', { class: 'closing-button closing-button--light', type: 'button', dataset: { closingGo: 'contribute' } }, text.contribute),
            h('button', { class: 'closing-link', type: 'button', dataset: { closingAction: 'exit' } }, text.exit)
          ),
          h('p', { class: 'thanks-line', 'data-reveal': '' }, text.closingLine)
        )
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

    // One dialog reused by the three cards; its text is filled from the card's `modal`.
    buildModal() {
      const title = h('h3', { class: 'closing-modal__title', id: 'closingModalTitle' });
      const eyebrow = h('p', { class: 'closing-eyebrow closing-modal__eyebrow' });
      const description = h('p', { class: 'closing-modal__description' });
      const list = h('ul', { class: 'closing-modal__list' });
      const close = h('button', { class: 'closing-modal__close', type: 'button', 'aria-label': this.content.closeLabel }, svg(CLOSE));
      const dialog = h('div', { class: 'closing-modal__dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'closingModalTitle' },
        close, eyebrow, title, description, list);
      const backdrop = h('div', { class: 'closing-modal', hidden: true }, dialog);
      this.sections.contribute.append(backdrop);
      close.addEventListener('click', () => this.closeModal());
      backdrop.addEventListener('click', event => { if (event.target === backdrop) this.closeModal(); });
      this.modal = { backdrop, dialog, title, eyebrow, description, list, close, open: false, trigger: null, tween: null };
    }

    // ---------- Modals ----------
    openModal(cardId, trigger) {
      const card = this.content.contribute.cards.find(item => item.id === cardId);
      const modal = this.modal;
      if (!card || this.busy || this.current !== 'contribute') return;
      modal.eyebrow.textContent = card.modal.eyebrow;
      modal.title.textContent = card.modal.title;
      modal.description.textContent = card.modal.description;
      modal.list.replaceChildren(...card.modal.examples.map(item => h('li', {}, item)));
      modal.dialog.dataset.accent = card.accent;
      modal.trigger = trigger || null;
      modal.open = true;
      modal.backdrop.hidden = false;
      this.contributeBody.inert = true;
      modal.tween?.kill();
      const quick = this.reduced ? .12 : null;
      modal.tween = gsap.timeline()
        .fromTo(modal.backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: quick || .35, ease: 'power1.out' })
        .fromTo(modal.dialog, { autoAlpha: 0, scale: .94, y: 14 }, { autoAlpha: 1, scale: 1, y: 0, duration: quick || .45, ease: 'power3.out' }, '<.05');
      modal.close.focus({ preventScroll: true });
    }

    closeModal({ immediate = false } = {}) {
      const modal = this.modal;
      if (!modal.open) return;
      modal.open = false;
      modal.tween?.kill();
      const done = () => {
        modal.backdrop.hidden = true;
        gsap.set([modal.backdrop, modal.dialog], { clearProps: 'all' });
        this.contributeBody.inert = false;
        if (!immediate) modal.trigger?.focus({ preventScroll: true });
        modal.tween = null;
      };
      if (immediate) { done(); return; }
      modal.tween = gsap.timeline({ onComplete: done })
        .to(modal.dialog, { autoAlpha: 0, scale: .96, y: 8, duration: this.reduced ? .1 : .28, ease: 'power2.in' })
        .to(modal.backdrop, { autoAlpha: 0, duration: this.reduced ? .1 : .3, ease: 'power1.in' }, '<.08');
    }

    // ---------- Navigation ----------
    // Entry from scenario 3: the 3D scene fades out with a slight lift, then the reflection appears.
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
      this.closeModal({ immediate: true });
      app.Interface.setLocked(true);
      app.Interface.setPhase(`closing-${name}`);
      this.timeline = gsap.timeline({ onComplete: () => this.settle(name) });
      if (from) {
        this.timeline.to(from, { autoAlpha: 0, y: -14, duration: this.reduced ? .12 : .55, ease: 'power2.in' })
          .call(() => {
            this.stopAmbient();
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
    }

    // Staggered, gentle entrance of the elements marked with data-reveal.
    reveal(name) {
      const section = this.sections[name];
      const timeline = gsap.timeline();
      const items = [...section.querySelectorAll('[data-reveal]')];
      const art = items.filter(item => item.dataset.reveal === 'art');
      const cards = items.filter(item => item.dataset.reveal === 'card');
      const rest = items.filter(item => !art.includes(item) && !cards.includes(item));
      const d = this.reduced ? .1 : 1;
      timeline.call(() => gsap.set(section.querySelectorAll('[data-reveal]'), { autoAlpha: 0 }));
      if (art.length) timeline.fromTo(art, { autoAlpha: 0, scale: .9, rotate: -4 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 1.4 * d, ease: 'power3.out' }, 0);
      const header = name === 'contribute' ? rest.slice(0, 2) : rest;
      timeline.fromTo(header, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .8 * d, stagger: .13 * d, ease: 'power2.out', clearProps: 'transform' }, art.length ? .35 * d : 0);
      if (cards.length) {
        timeline.fromTo(cards, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: .75 * d, stagger: .14 * d, ease: 'power2.out', clearProps: 'transform' }, '-=.35');
        timeline.fromTo(rest.slice(2), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .6 * d, ease: 'power2.out', clearProps: 'transform' }, '-=.25');
      }
      return timeline;
    }

    settle(name) {
      this.timeline = null;
      app.Interface.setLocked(false);
      app.Interface.setPhase(`closing-${name}`);
      this.startAmbient(name);
      this.sections[name].querySelector('h2')?.focus({ preventScroll: true });
    }

    // Slow, contemplative motion: the hands turn, the orbits drift, the rings breathe.
    startAmbient(name) {
      this.stopAmbient();
      if (this.reduced) return;
      const section = this.sections[name];
      if (name === 'reflection') {
        const q = selector => section.querySelector(selector);
        this.ambient.push(
          gsap.to(q('.art-hand--long'), { rotation: 360, svgOrigin: '200 200', duration: 90, ease: 'none', repeat: -1 }),
          gsap.to(q('.art-hand--short'), { rotation: 360, svgOrigin: '200 200', duration: 240, ease: 'none', repeat: -1 }),
          gsap.to(q('.art-orbit--a'), { rotation: 360, svgOrigin: '200 200', duration: 120, ease: 'none', repeat: -1 }),
          gsap.to(q('.art-orbit--b'), { rotation: -360, svgOrigin: '200 200', duration: 160, ease: 'none', repeat: -1 }),
          gsap.to(q('.art-sun'), { scale: 1.025, svgOrigin: '200 200', duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
          gsap.to(q('.art-spark'), { opacity: .45, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 })
        );
      } else if (name === 'thanks') {
        section.querySelectorAll('.thanks-ring').forEach((ring, index) => {
          this.ambient.push(gsap.to(ring, { scale: 1.035, duration: 6 + index, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: index * .8 }));
        });
      }
    }

    stopAmbient() {
      this.ambient.forEach(tween => tween.kill());
      this.ambient = [];
    }

    // Hides the whole section and clears every animation (used by «Repetir» and «Salir»).
    reset() {
      this.timeline?.kill();
      this.timeline = null;
      this.closeModal({ immediate: true });
      this.stopAmbient();
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
