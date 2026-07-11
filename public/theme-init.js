// Prevent flash of wrong theme on load. Loaded synchronously from <head> as an
// external same-origin file so it passes the CSP's script-src 'self' (an inline
// script would need a hash that CRA's HTML minification invalidates).
(function () {
  var theme = localStorage.getItem('theme');
  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
