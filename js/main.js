document.documentElement.classList.add('js');
(function () {
  // hlavička: linka po odscrollování, burger
  var hl = document.querySelector('.hlavicka');
  var onScroll = function () { hl.classList.toggle('posunuto', window.scrollY > 8); };
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  var burger = document.querySelector('.burger'), menu = document.getElementById('menu');
  if (burger) burger.addEventListener('click', function () {
    var o = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!o)); menu.classList.toggle('otevreno', !o);
  });

  // kopec: kameny jako záložky
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.kopec-cesta [role=tab]'));
  function vyber(t, fokus) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
      var p = document.getElementById(x.getAttribute('aria-controls'));
      if (on) p.removeAttribute('data-skryt'); else p.setAttribute('data-skryt', '');
    });
    if (fokus) t.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      vyber(t);
      if (window.matchMedia('(max-width: 56rem)').matches) {
        document.getElementById(t.getAttribute('aria-controls')).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    t.addEventListener('keydown', function (e) {
      var d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (d) { e.preventDefault(); vyber(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  // zisky: filtr kurz/koučing a podle oblasti
  function filtr(skupina, attr) {
    var btns = document.querySelectorAll(skupina + ' button');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var v = b.dataset[attr];
        document.querySelectorAll('[data-zisky] .zisk').forEach(function (z) {
          z.hidden = !(v === 'vse' || z.dataset[attr === 'filtr' ? 'typ' : 'oblast'] === v);
        });
      });
    });
  }
  filtr('.prepinac', 'filtr');
  filtr('.filtr-oblasti', 'oblast');

  // reveal
  var cile = document.querySelectorAll('.kopec-cesta, .cesta-blok, .policka li');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('videt'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    cile.forEach(function (c) { if (!c.classList.contains('kopec-cesta')) c.classList.add('odhal'); io.observe(c); });
  } else {
    cile.forEach(function (c) { c.classList.add('videt'); });
  }

  // formulář: předvyplnění zájmu z ?zajem=
  var q = new URLSearchParams(location.search).get('zajem');
  var sel = document.querySelector('.formular select[name=zajem]');
  if (q && sel && sel.querySelector('option[value="' + q + '"]')) sel.value = q;
})();
// Formulář: demo režim neodesílá nic, ostrý režim posílá na endpoint ze site.json (data-endpoint).
(function () {
  document.querySelectorAll('form.formular').forEach(function (f) {
    var stav = f.querySelector('.formular-stav');
    f.addEventListener('submit', function (e) {
      var endpoint = f.getAttribute('data-endpoint');
      var demo = f.getAttribute('data-demo') === '1';
      if (f.querySelector('.past input').value) { e.preventDefault(); return; }
      if (demo || !endpoint) {
        e.preventDefault();
        stav.textContent = 'Ukázka formuláře: v návrhu se nic neodesílá. Po spuštění webu přijde zpráva na info@life-pwr.cz.';
        return;
      }
      e.preventDefault();
      stav.textContent = 'Odesílám…';
      fetch(endpoint, { method: 'POST', body: new FormData(f), headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); f.reset(); stav.textContent = 'Díky, zpráva odešla. Ozveme se ti.'; })
        .catch(function () { stav.textContent = 'Odeslání se nepodařilo. Napiš nám prosím na info@life-pwr.cz.'; });
    });
  });
})();
