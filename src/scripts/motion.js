// Motion layer for The Paddle House.
// All animation is gated on prefers-reduced-motion: reduce — if the user opts
// out, elements simply stay in their "reveal" states (visible), no JS runs.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion && window.gsap && window.ScrollTrigger) {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  // 1. Headline char-split reveal.
  // Hand-rolled splitter. Characters animate individually (stagger), but
  // each WORD is an inline-block/nowrap wrapper so the browser never breaks
  // a word mid-character. Explicit newlines (\n from `<br>` or raw text)
  // become hard breaks; spaces between words become normal break points.
  const splitChars = (el) => {
    // Preserve original text for screen readers before we tear it apart.
    const originalText = el.textContent ?? "";

    // Normalize: replace <br> with \n so we can segment on it.
    el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const text = el.textContent ?? "";

    el.textContent = "";
    const frag = document.createDocumentFragment();

    // Split on explicit newlines first; each line holds words.
    const lines = text.split("\n");
    lines.forEach((line, lineIdx) => {
      const words = line.split(/(\s+)/); // keep whitespace as separators
      words.forEach((chunk) => {
        if (chunk === "") return;
        if (/^\s+$/.test(chunk)) {
          frag.appendChild(document.createTextNode(" "));
          return;
        }
        const wordEl = document.createElement("span");
        wordEl.style.display = "inline-block";
        wordEl.style.whiteSpace = "nowrap";
        for (const ch of chunk) {
          const charEl = document.createElement("span");
          charEl.textContent = ch;
          charEl.setAttribute("aria-hidden", "true");
          charEl.setAttribute("data-char", "");
          charEl.style.display = "inline-block";
          wordEl.appendChild(charEl);
        }
        frag.appendChild(wordEl);
      });
      if (lineIdx < lines.length - 1) {
        frag.appendChild(document.createElement("br"));
      }
    });

    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    sr.textContent = originalText;
    el.appendChild(sr);
    el.appendChild(frag);
  };

  document.querySelectorAll(".reveal-chars").forEach((el) => {
    splitChars(el);
    gsap.to(el.querySelectorAll("[data-char]"), {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: "expo.out",
      stagger: 0.022,
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        once: true,
      },
    });
  });

  // 2. Image mask reveals — clip-path unveil on scroll.
  document.querySelectorAll(".reveal-mask").forEach((el) => {
    gsap.to(el, {
      clipPath: "inset(0% 0 0 0)",
      duration: 1.4,
      ease: "expo.out",
      scrollTrigger: {
        trigger: el,
        start: "top 80%",
        once: true,
      },
    });
  });

  // 3. Standard fade-up for everything with .reveal (kept as a fallback
  // choreography for secondary content — used more sparingly than before).
  document.querySelectorAll(".reveal").forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 32 },
      {
        opacity: 1,
        y: 0,
        duration: 1.0,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          once: true,
        },
      }
    );
  });

  // 4. Pinned horizontal scroll for [data-pinned-scroll] containers.
  // The container is pinned to the viewport while the inner .pinned-track
  // translates horizontally — a scrub-driven reveal through the grounds.
  document.querySelectorAll("[data-pinned-scroll]").forEach((container) => {
    const track = container.querySelector(".pinned-track");
    if (!track) return;
    const getShift = () => track.scrollWidth - container.offsetWidth;
    gsap.to(track, {
      x: () => -getShift(),
      ease: "none",
      scrollTrigger: {
        trigger: container,
        start: "top top",
        end: () => "+=" + getShift(),
        pin: true,
        scrub: 0.6,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });
  });

  // 5. Parallax on any [data-parallax] element. A gentle drift, not a
  // theme-park ride. Keep yPercent small; scrub for buttery feel.
  document.querySelectorAll("[data-parallax]").forEach((el) => {
    const amount = Number(el.dataset.parallax) || 12;
    gsap.to(el, {
      yPercent: amount,
      ease: "none",
      scrollTrigger: {
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        scrub: 0.6,
      },
    });
  });
} else {
  // Reduced-motion: make sure reveal primitives are visible.
  document
    .querySelectorAll(".reveal, .reveal-chars, .reveal-mask")
    .forEach((el) => {
      el.style.opacity = "1";
      el.style.clipPath = "none";
    });
}
