document.addEventListener('DOMContentLoaded', () => {
  const year = new Date().getFullYear();
  // Keep the copyright fixed to 2026 as requested; this script is intentionally light.
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
