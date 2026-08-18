/* MakanMana landing page — GSAP motion layer */
(function () {
  'use strict';

  if (!window.gsap || !window.ScrollTrigger) {
    console.warn('[MakanMana] GSAP or ScrollTrigger failed to load.');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Existing .reveal CSS starts hidden. Hand visibility over to GSAP.
  gsap.set('.reveal', { opacity: 1, y: 0 });

  if (reduceMotion) {
    ScrollTrigger.getAll().forEach(t => t.kill());
    gsap.set('*', { clearProps: 'transform,opacity' });
    return;
  }

  gsap.defaults({ ease: 'power3.out', duration: 0.85 });

  // HERO
  const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  heroTl
    .from('.hero-content .eyebrow', { y: 20, opacity: 0, duration: 0.55 })
    .from('.hero-title', { y: 44, opacity: 0, duration: 0.9 }, '-=0.28')
    .from('.hero-sub', { y: 24, opacity: 0, duration: 0.65 }, '-=0.48')
    .from('.hero-actions > *', { y: 18, opacity: 0, stagger: 0.1, duration: 0.5 }, '-=0.4')
    .from('.hero-phone-real', {
      x: 55, y: 24, rotate: 2.5, scale: 0.94, opacity: 0, duration: 1.05
    }, '-=0.92')
    .from('.hero-photo-main', {
      x: 55, scale: 0.94, opacity: 0, duration: 0.95
    }, '-=0.86');

  // HERO PARALLAX — desktop/tablet
  gsap.matchMedia().add('(min-width: 768px)', () => {
    gsap.to('.hero-phone-real', {
      yPercent: -7,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8
      }
    });

    gsap.to('.hero-photo-main', {
      yPercent: 8,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8
      }
    });
  });

  function revealEach(selector, vars = {}) {
    gsap.utils.toArray(selector).forEach((el) => {
      gsap.from(el, {
        y: 34,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: el,
          start: 'top 86%',
          once: true
        },
        ...vars
      });
    });
  }

  // MAIN TEXT
  revealEach('.split-text', { y: 38 });
  revealEach('.problem-grid > div:first-child', { x: -28, y: 0 });
  revealEach('#explore > .wrap > h2', { y: 32 });
  revealEach('.pro-section h2', { y: 35 });
  revealEach('.final-cta .wrap', { y: 36 });

  // PHONE SCREENS
  gsap.utils.toArray('.phone-visual').forEach((visual) => {
    const phone = visual.querySelector('.phone-shot');
    const caption = visual.querySelector('.phone-caption');
    if (!phone) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: visual,
        start: 'top 84%',
        once: true
      }
    });

    tl.from(phone, {
      y: 72,
      rotate: 1.7,
      scale: 0.95,
      opacity: 0,
      duration: 0.9
    });

    if (caption) {
      tl.from(caption, { y: 12, opacity: 0, duration: 0.45 }, '-=0.38');
    }
  });

  // PROBLEM PHOTOS
  gsap.from('.problem-photo', {
    x: 42,
    y: 24,
    opacity: 0,
    stagger: 0.14,
    duration: 0.85,
    scrollTrigger: {
      trigger: '.problem-grid',
      start: 'top 78%',
      once: true
    }
  });

  gsap.from('.quote-bubble', {
    y: 18,
    scale: 0.96,
    opacity: 0,
    stagger: 0.07,
    duration: 0.45,
    scrollTrigger: {
      trigger: '.quote-cloud',
      start: 'top 88%',
      once: true
    }
  });

  // CITY EXPANSION
  gsap.from('.expand-card', {
    y: 34,
    opacity: 0,
    stagger: 0.12,
    duration: 0.72,
    scrollTrigger: {
      trigger: '.expand-grid',
      start: 'top 84%',
      once: true
    }
  });

  // EXPLORE
  gsap.from('.photo-duo .sq', {
    y: 40,
    rotate: (i) => i === 0 ? -1.5 : 1.5,
    opacity: 0,
    stagger: 0.12,
    duration: 0.8,
    scrollTrigger: {
      trigger: '.photo-duo',
      start: 'top 84%',
      once: true
    }
  });

  gsap.from('.check-list li', {
    x: 28,
    opacity: 0,
    stagger: 0.1,
    duration: 0.55,
    scrollTrigger: {
      trigger: '.check-list',
      start: 'top 84%',
      once: true
    }
  });

  // GROUP STEPS
  gsap.from('.step-item', {
    y: 28,
    opacity: 0,
    stagger: 0.09,
    duration: 0.62,
    scrollTrigger: {
      trigger: '.step-strip',
      start: 'top 86%',
      once: true
    }
  });

  // HOW IT WORKS
  gsap.from('.how-row', {
    x: -24,
    opacity: 0,
    stagger: 0.12,
    duration: 0.65,
    scrollTrigger: {
      trigger: '.how-list',
      start: 'top 84%',
      once: true
    }
  });

  // PRO
  gsap.from('.pro-col', {
    y: 34,
    opacity: 0,
    stagger: 0.12,
    duration: 0.72,
    scrollTrigger: {
      trigger: '.pro-cols',
      start: 'top 84%',
      once: true
    }
  });

  // FULL PHOTO PARALLAX
  gsap.utils.toArray('.full-photo').forEach((section) => {
    const image = section.querySelector('img');
    const overlay = section.querySelector('.overlay-text');

    if (image) {
      gsap.fromTo(image,
        { yPercent: -5, scale: 1.04 },
        {
          yPercent: 5,
          scale: 1.04,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.8
          }
        }
      );
    }

    if (overlay) {
      gsap.from(overlay, {
        y: 42,
        opacity: 0,
        duration: 0.85,
        scrollTrigger: {
          trigger: section,
          start: 'top 72%',
          once: true
        }
      });
    }
  });

  // NAV DEPTH
  ScrollTrigger.create({
    start: 60,
    end: 99999,
    onEnter: () => {
      gsap.to('header.nav', {
        boxShadow: '0 10px 28px rgba(23,19,16,0.08)',
        duration: 0.25,
        overwrite: true
      });
    },
    onLeaveBack: () => {
      gsap.to('header.nav', {
        boxShadow: '0 0 0 rgba(23,19,16,0)',
        duration: 0.25,
        overwrite: true
      });
    }
  });

  // IMPORTANT FOR PHONE MOCKUPS / IMAGES
  if (document.readyState === 'complete') {
    ScrollTrigger.refresh();
  } else {
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  }
})();
