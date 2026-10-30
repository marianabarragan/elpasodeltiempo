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
  // Gold paperclip of the contribute cards, drawn in its own frame (wide end up, neck of its
  // narrow end at y = 33) and tilted 41° over the card's top-left corner. The front part goes
  // over the paper; the back leg goes under it, so the clip looks clipped onto the sheet.
  const CLIP = { front: 'M4 0A4 4 0 0 0-4 0V33A2.5 2.5 0 0 0 1 33V13', back: 'M4 0V24' };
  function paperclip(index, part) {
    const gold = `clip-gold-${index}-${part}`, path = CLIP[part];
    const holder = document.createElementNS(SVG_NS, 'svg');
    holder.setAttribute('viewBox', '-18 -4 36 40');
    holder.setAttribute('aria-hidden', 'true');
    holder.setAttribute('class', `contribute-clip contribute-clip--${part}`);
    holder.innerHTML = `
      <defs><linearGradient id="${gold}" gradientUnits="userSpaceOnUse" x1="0" y1="-5" x2="0" y2="37">
        <stop offset="0" stop-color="#b07d22"/><stop offset=".25" stop-color="#e6bf5e"/><stop offset=".5" stop-color="#a6751c"/>
        <stop offset=".75" stop-color="#e2b955"/><stop offset="1" stop-color="#9a6a18"/>
      </linearGradient></defs>
      <g transform="rotate(41 0 16)" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="${path}" stroke="#5c3d0a" stroke-width="1.7"/>
        <path d="${path}" stroke="url(#${gold})" stroke-width="1.15"/>
        <path d="${path}" stroke="#fff1b8" stroke-width=".36" stroke-opacity=".9" transform="translate(-.28 -.1)"/>
      </g>`;
    return holder;
  }

  /**
   * Final section of the experience, after scenario 3:
   *   reflection ──«Quiero aprender»──▶ contribute ──«Continuar al cierre»──▶ thanks
   *        └───────────«Ahora no.»────────────────────────────────────────────▲
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

    // ---------- Construction ----------
    // Like the start cover: the glowing hourglass on the left (it turns over a few seconds after
    // the screen appears, see showHourglass) and, on the right, the title with its handwritten
    // line, the description and, further down, the question with «Quiero aprender» and «Ahora no.».
    buildReflection() {
      const text = this.content.reflection;
      const section = this.sections.reflection;
      this.reflectionHourglass = h('div', { class: 'reflection-hourglass hourglass-stage', role: 'img', 'aria-label': text.hourglass, 'data-reveal': 'art' });
      section.replaceChildren(
        this.reflectionHourglass,
        h('div', { class: 'reflection-copy' },
          h('div', { class: 'reflection-heading' },
            h('h2', { class: 'closing-title reflection-title', id: 'reflectionTitle', tabindex: '-1', 'data-reveal': '' },
              text.title, ' ', h('span', { class: 'reflection-script' }, text.script)),
            h('p', { class: 'closing-lead', 'data-reveal': '' }, text.description)
          ),
          h('div', { class: 'reflection-call' },
            h('p', { class: 'reflection-question', 'data-reveal': '' }, text.question),
            h('div', { class: 'closing-actions', 'data-reveal': '' },
              h('span', { class: 'reflection-glow' },
                h('button', { class: 'reflection-start glow-button', type: 'button', dataset: { closingGo: 'contribute' } }, text.accept)),
              h('button', { class: 'closing-link', type: 'button', dataset: { closingGo: 'thanks' } }, text.decline)
            )
          )
        )
      );
      section.setAttribute('aria-labelledby', 'reflectionTitle');
      this.bindNavigation(section);
    }

    // The start cover's hourglass (js/intro-hourglass.js), created the first time the reflection
    // shows. It turns over Config.closing.hourglass.flipAfterSeconds after each appearance. It
    // almost fills the height, as in the design; its canvas has room on both sides, so its flowers
    // may go past its column and it is not cut while it turns.
    showHourglass() {
      if (this.hourglass !== undefined || !app.IntroHourglass) return;
      try {
        this.hourglass = new app.IntroHourglass(this.reflectionHourglass, {
          cover: this.sections.reflection, overflow: .45, fit: { height: .92, width: 1.1 },
          flipAfter: app.Config.closing?.hourglass?.flipAfterSeconds ?? 3
        });
      } catch (error) {
        this.hourglass = null;
        console.warn('No fue posible crear el reloj de arena del cierre', error);
      }
    }

    // The title with its handwritten line, three paper cards clipped at their corner and
    // «Continuar al cierre» at the bottom right. Each card shows its title and description and,
    // when it opens (bindCards), grows, loses its clip and shows its `detail` instead.
    buildContribute() {
      const text = this.content.contribute;
      const section = this.sections.contribute;
      this.cards = text.cards.map((card, index) => h('article', { class: 'contribute-card', tabindex: '0', 'data-reveal': 'card', 'aria-labelledby': `card-${card.id}` },
        paperclip(index + 1, 'back'),
        h('div', { class: 'contribute-sheet' },
          h('div', { class: 'contribute-summary' },
            h('h3', { class: 'contribute-card__title', id: `card-${card.id}` }, card.title),
            h('p', { class: 'contribute-card__text' }, card.description)
          ),
          h('div', { class: 'contribute-detail' },
            h('p', { class: 'contribute-card__title' }, card.detail.title),
            h('p', { class: 'contribute-card__text' }, card.detail.description),
            h('ul', { class: 'contribute-card__list' }, card.detail.examples.map(example => h('li', {}, example)))
          )
        ),
        paperclip(index + 1, 'front')
      ));
      section.replaceChildren(h('div', { class: 'contribute-body' },
        h('h2', { class: 'contribute-title', id: 'contributeTitle', tabindex: '-1', 'data-reveal': '' },
          text.title, ' ', h('span', { class: 'contribute-script' }, text.script)),
        h('div', { class: 'contribute-cards' }, this.cards),
        h('button', { class: 'contribute-continue', type: 'button', 'data-reveal': 'after', dataset: { closingGo: 'thanks' } }, text.continueLabel)
      ));
      section.setAttribute('aria-labelledby', 'contributeTitle');
      this.bindCards(section);
      this.bindNavigation(section);
    }

    // A card opens on mouse hover, on keyboard focus or with a tap (a second tap, or a tap
    // elsewhere, closes it). Only one is open at a time.
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

    // Opens or closes a card. The sheet grows from its centre (wider and as tall as its detail),
    // animated from its current size (FLIP), so it can be interrupted at any moment; the clip,
    // the text and the shadow fade in CSS. The section's data-active (1–3) moves the darker
    // background shape and lightens «Continuar al cierre».
    setCard(card, open, immediate = false) {
      if (open === card.hasAttribute('data-open')) return;
      if (open && this.openCard) this.setCard(this.openCard, false, immediate);
      const sheet = card.querySelector('.contribute-sheet');
      const box = () => {
        const style = getComputedStyle(sheet);
        return { left: parseFloat(style.left), right: parseFloat(style.right), height: sheet.offsetHeight };
      };
      const from = box();
      gsap.killTweensOf(sheet);
      gsap.set(sheet, { clearProps: 'left,right,height' });
      card.toggleAttribute('data-open', open);
      if (open) this.openCard = card;
      else if (this.openCard === card) this.openCard = null;
      const section = this.sections.contribute;
      if (this.openCard) section.dataset.active = String(this.cards.indexOf(this.openCard) + 1);
      else delete section.dataset.active;
      if (immediate || this.reduced) return;
      gsap.fromTo(sheet, from, { ...box(), duration: .55, ease: 'power3.out', clearProps: 'left,right,height' });
    }

    closeCards({ immediate = false } = {}) {
      if (this.openCard) this.setCard(this.openCard, false, immediate);
    }

    // Everything centred: the eyebrow over a thin line, the title (one line per item), «Ver
    // formas de aportar» with the two links and, below them, the description.
    buildThanks() {
      const text = this.content.thanks;
      const section = this.sections.thanks;
      const lines = [].concat(text.title).flatMap((line, index) => [index ? ' ' : null, h('span', { class: 'thanks-line' }, line)]);
      section.replaceChildren(
        h('div', { class: 'thanks-copy' },
          h('p', { class: 'thanks-eyebrow', 'data-reveal': '' }, text.eyebrow),
          h('h2', { class: 'thanks-title', id: 'thanksTitle', tabindex: '-1', 'data-reveal': '' }, lines),
          h('div', { class: 'thanks-actions', 'data-reveal': '' },
            h('button', { class: 'thanks-contribute', type: 'button', dataset: { closingGo: 'contribute' } }, text.contribute),
            h('button', { class: 'thanks-link', type: 'button', dataset: { closingAction: 'repeat' } }, text.repeat),
            h('button', { class: 'thanks-link', type: 'button', dataset: { closingAction: 'exit' } }, text.exit)
          ),
          h('p', { class: 'thanks-description', 'data-reveal': '' }, text.description)
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
      this.closeCards({ immediate: true });
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

    // Staggered, gentle entrance of the elements marked with data-reveal: the art, the text, the
    // cards and, last, what is marked 'after'.
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
      // The transform is cleared at the end so the hourglass's light blends with the page again.
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

    // Hides the whole section and clears every animation (used by «Repetir» and «Salir»).
    reset() {
      this.timeline?.kill();
      this.timeline = null;
      this.closeCards({ immediate: true });
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
