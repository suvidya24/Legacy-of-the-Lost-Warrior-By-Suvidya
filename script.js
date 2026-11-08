/**
 * Legacy of the Lost Warrior – Season 1
 * Official Website JavaScript
 * Author: Suvidya Rahul Sonawane
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     1. Navigation & Mobile Menu
     ========================================================================== */
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const allNavLinks = document.querySelectorAll('.nav-link, .nav-btn-cta');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close mobile menu when any nav link is clicked
    allNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Active link indicator on scroll
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      const targetNav = document.querySelector(`.nav-links a[href*="${sectionId}"]`);
      
      if (targetNav && scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        targetNav.classList.add('active');
      }
    });
  }, { passive: true });


  /* ==========================================================================
     2. PDF.js Novel Reader Engine
     ========================================================================== */
  const PDF_URL = 'Ebook/Legacy%20of%20The%20Lost%20Warrior%20Season%20one.pdf';

  // Elements
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const readerViewport = document.getElementById('reader-viewport');
  const readerCard = document.getElementById('novel-reader-wrapper');
  const loadingOverlay = document.getElementById('reader-loading');
  const errorOverlay = document.getElementById('reader-error');
  const errorMessageText = document.getElementById('error-message-text');
  const retryBtn = document.getElementById('retry-load-btn');
  const nativeFrameWrapper = document.getElementById('native-frame-wrapper');
  const nativeIframe = document.getElementById('pdf-native-iframe');

  // Controls
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  const pageNumInput = document.getElementById('page-num-input');
  const pageJumpBtn = document.getElementById('page-jump-btn');
  const pageCountSpan = document.getElementById('page-count');
  const pageSlider = document.getElementById('page-slider');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const fitWidthBtn = document.getElementById('fit-width-btn');
  const zoomLevelText = document.getElementById('zoom-level-text');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  // State variables
  let pdfDoc = null;
  let pageNum = 1;
  let totalPages = 100;
  let pageRendering = false;
  let pageNumPending = null;
  let currentRenderTask = null;
  let scale = 1.15; // Default scale
  let isFitWidth = false;

  // Initialize PDF.js worker
  function setupWorker() {
    if (typeof pdfjsLib !== 'undefined') {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      } catch (e) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    }
  }

  /**
   * Calculate automatic fit-to-width scale
   */
  async function calculateFitScale(num) {
    if (!pdfDoc) return 1.0;
    try {
      const page = await pdfDoc.getPage(num);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const availableWidth = readerViewport.clientWidth - 40; // padding
      const calculated = Math.max(0.6, Math.min(2.5, availableWidth / unscaledViewport.width));
      return calculated;
    } catch (e) {
      return 1.0;
    }
  }

  /**
   * Render a specific page onto the canvas
   */
  async function renderPage(num) {
    if (!pdfDoc || !canvas || !ctx) return;
    
    pageRendering = true;
    updateControls();

    try {
      // If fit width mode is active, recalculate scale
      if (isFitWidth) {
        scale = await calculateFitScale(num);
        updateZoomText();
      }

      // Cancel any ongoing render task
      if (currentRenderTask) {
        currentRenderTask.cancel();
      }

      const page = await pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: scale });

      // Support high-resolution/Retina displays
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : null;

      const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
      };

      currentRenderTask = page.render(renderContext);

      await currentRenderTask.promise;
      currentRenderTask = null;
      pageRendering = false;

      // Check if another page was requested while rendering
      if (pageNumPending !== null) {
        const nextNum = pageNumPending;
        pageNumPending = null;
        renderPage(nextNum);
      }
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') {
        // Expected when switching pages quickly; ignore
      } else {
        console.error('Page render error:', err);
      }
      pageRendering = false;
    }
  }

  /**
   * Queue page for rendering (prevents concurrent rendering collision)
   */
  function queueRenderPage(num) {
    if (pageRendering) {
      pageNumPending = num;
      if (currentRenderTask) {
        try {
          currentRenderTask.cancel();
        } catch (e) {}
      }
    } else {
      renderPage(num);
    }
  }

  /**
   * Go to previous page
   */
  function onPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
  }

  /**
   * Go to next page
   */
  function onNextPage() {
    if (!pdfDoc || pageNum >= totalPages) return;
    pageNum++;
    queueRenderPage(pageNum);
  }

  /**
   * Jump to target page
   */
  function goToPage(target) {
    const num = parseInt(target, 10);
    if (isNaN(num)) return;
    if (num < 1) pageNum = 1;
    else if (num > totalPages) pageNum = totalPages;
    else pageNum = num;

    queueRenderPage(pageNum);
  }

  /**
   * Update all UI controls (buttons, input, slider)
   */
  function updateControls() {
    if (pageNumInput) pageNumInput.value = pageNum;
    if (pageSlider) pageSlider.value = pageNum;
    if (prevBtn) prevBtn.disabled = pageNum <= 1;
    if (nextBtn) nextBtn.disabled = !pdfDoc || pageNum >= totalPages;
  }

  /**
   * Update zoom level percentage display
   */
  function updateZoomText() {
    if (zoomLevelText) {
      zoomLevelText.textContent = Math.round(scale * 100) + '%';
    }
  }

  /**
   * Change zoom level
   */
  function changeZoom(delta) {
    isFitWidth = false;
    scale = Math.max(0.5, Math.min(2.5, +(scale + delta).toFixed(2)));
    updateZoomText();
    queueRenderPage(pageNum);
  }

  /**
   * Fallback to native embedded reader (e.g. if file:// protocol blocks fetch)
   */
  function activateNativeFallback(msg) {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (canvasWrapper) canvasWrapper.style.display = 'none';
    
    // Set native iframe source
    if (nativeIframe && nativeFrameWrapper) {
      nativeIframe.src = PDF_URL;
      nativeFrameWrapper.style.display = 'block';
    }

    if (errorOverlay) {
      errorOverlay.style.display = 'flex';
      if (msg && errorMessageText) {
        errorMessageText.textContent = msg;
      }
    }
  }

  /**
   * Load the PDF Document
   */
  function loadPdf() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    if (errorOverlay) errorOverlay.style.display = 'none';

    // If PDF.js library isn't loaded yet, retry shortly
    if (typeof pdfjsLib === 'undefined') {
      setTimeout(loadPdf, 300);
      return;
    }

    setupWorker();

    const loadingTask = pdfjsLib.getDocument({
      url: PDF_URL,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true
    });

    loadingTask.promise.then(
      function(pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;

        if (pageCountSpan) pageCountSpan.textContent = totalPages;
        if (pageNumInput) {
          pageNumInput.max = totalPages;
          pageNumInput.value = 1;
        }
        if (pageSlider) {
          pageSlider.max = totalPages;
          pageSlider.value = 1;
        }

        // Auto-fit scale on initial load for optimal responsive view
        if (window.innerWidth < 768) {
          isFitWidth = true;
        } else {
          scale = 1.15;
        }
        updateZoomText();

        // Render page 1
        pageNum = 1;
        renderPage(pageNum).then(() => {
          if (loadingOverlay) loadingOverlay.style.display = 'none';
        });
      },
      function(reason) {
        console.warn('PDF.js loading notice/error:', reason);
        const isLocalFile = window.location.protocol === 'file:';
        let notice = 'Could not load PDF in the canvas reader.';
        if (isLocalFile) {
          notice = 'Note: Your browser blocks embedded canvas fetching when running locally via file:// due to CORS security. You can read the novel below via the native viewer, or click "Open PDF Directly" to read in full-page mode. (When deployed on GitHub Pages or a web server, the custom canvas viewer runs seamlessly).';
        }
        activateNativeFallback(notice);
      }
    );
  }

  /* --- Event Listeners for Reader Controls --- */
  if (prevBtn) prevBtn.addEventListener('click', onPrevPage);
  if (nextBtn) nextBtn.addEventListener('click', onNextPage);

  if (pageJumpBtn && pageNumInput) {
    pageJumpBtn.addEventListener('click', () => goToPage(pageNumInput.value));
  }

  if (pageNumInput) {
    pageNumInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        goToPage(pageNumInput.value);
      }
    });
  }

  if (pageSlider) {
    pageSlider.addEventListener('input', (e) => {
      goToPage(e.target.value);
    });
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => changeZoom(0.15));
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => changeZoom(-0.15));
  }

  if (fitWidthBtn) {
    fitWidthBtn.addEventListener('click', async () => {
      isFitWidth = true;
      scale = await calculateFitScale(pageNum);
      updateZoomText();
      queueRenderPage(pageNum);
    });
  }

  // Toggle Fullscreen
  if (fullscreenBtn && readerCard) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        if (readerCard.requestFullscreen) {
          readerCard.requestFullscreen().catch(() => {
            readerCard.classList.toggle('fullscreen-mode');
          });
        } else {
          readerCard.classList.toggle('fullscreen-mode');
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
        readerCard.classList.remove('fullscreen-mode');
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const isFull = !!document.fullscreenElement;
      readerCard.classList.toggle('fullscreen-mode', isFull);
      const span = fullscreenBtn.querySelector('span');
      if (span) {
        span.textContent = isFull ? 'Exit' : 'Fullscreen';
      }
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (errorOverlay) errorOverlay.style.display = 'none';
      if (nativeFrameWrapper) nativeFrameWrapper.style.display = 'none';
      if (canvasWrapper) canvasWrapper.style.display = 'flex';
      loadPdf();
    });
  }

  // Keyboard navigation for reader
  window.addEventListener('keydown', (e) => {
    // Avoid triggering when user is typing in an input
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'ArrowLeft') {
      onPrevPage();
    } else if (e.key === 'ArrowRight') {
      onNextPage();
    } else if (e.key === '+' || e.key === '=') {
      changeZoom(0.15);
    } else if (e.key === '-' || e.key === '_') {
      changeZoom(-0.15);
    } else if (e.key === 'f' || e.key === 'F') {
      if (fullscreenBtn) fullscreenBtn.click();
    }
  });

  // Mobile Touch Swipe support for page navigation
  if (readerViewport) {
    let touchStartX = 0;
    let touchEndX = 0;

    readerViewport.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    readerViewport.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      const diffX = touchEndX - touchStartX;
      // Only register as swipe if horizontal motion is significant
      if (Math.abs(diffX) > 60) {
        if (diffX < 0) {
          // Swiped Left -> Next page
          onNextPage();
        } else {
          // Swiped Right -> Previous page
          onPrevPage();
        }
      }
    }, { passive: true });
  }

  // Window resize handler: adjust fit-to-width if active
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isFitWidth && pdfDoc) {
        calculateFitScale(pageNum).then(s => {
          scale = s;
          updateZoomText();
          queueRenderPage(pageNum);
        });
      }
    }, 200);
  });

  // Start initial PDF load
  loadPdf();

});
