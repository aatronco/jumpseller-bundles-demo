jQuery(() => {
  console.info(`[${new Date(Date.now()).toLocaleTimeString("en-GB", { hour12: false })}] Loaded custom.js`);

  document.querySelectorAll('.dark-mode-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const isDark = document.body.dataset.bundleColor === 'system-1';
      const next = isDark ? 'default' : 'system-1';
      document.body.dataset.bundleColor = next;
      localStorage.setItem('darkMode', next);
    });
  });
});
