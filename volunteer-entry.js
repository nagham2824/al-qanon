(() => {
  const page = document.getElementById('page-volunteer');
  const entry = document.getElementById('aqVolunteerEntry');
  if (!page || !entry) return;

  entry.addEventListener('click', () => {
    page.classList.add('aq-volunteer-login-requested');
    page.querySelector('.aq-volunteer-activation').open = false;
  }, { capture: true });

  new MutationObserver(() => {
    if (!page.classList.contains('active') && page.classList.contains('aq-volunteer-login-requested')) {
      page.classList.remove('aq-volunteer-login-requested');
    }
  }).observe(page, { attributes: true, attributeFilter: ['class'] });
})();
