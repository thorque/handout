// Applies a stored theme before the first paint. Without a stored value nothing is set and
// CSS decides via prefers-color-scheme, so a system change takes effect immediately.
//
// A separate file rather than an inline snippet: the server-rendered password page needs
// the identical behaviour and would otherwise have to carry a copy of it.
(function () {
  try {
    var stored = localStorage.getItem('handout.theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch {
    /* localStorage can throw (private mode, blocked storage) — system theme is the fallback */
  }
})();
