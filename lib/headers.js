// Header di sicurezza, unica fonte per il server locale e per le funzioni.
// Per i file statici Netlify li legge da netlify.toml: i test controllano che le due liste coincidano.
module.exports = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
};
