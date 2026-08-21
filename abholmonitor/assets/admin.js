/* ============================================================
   ABHOLMONITOR — Administration
   Jede Schreiboperation geht als POST an api.php und traegt das
   CSRF-Token. Die Berechtigung prueft ausschliesslich der Server.
   ============================================================ */
(function () {
  'use strict';

  var csrf = window.AM_CSRF;
  var listPrep = document.getElementById('adm-prep');
  var listReady = document.getElementById('adm-ready');
  var emptyPrep = document.getElementById('adm-prep-empty');
  var emptyReady = document.getElementById('adm-ready-empty');
  var msg = document.getElementById('msg');
  var formAdd = document.getElementById('form-add');
  var inputNr = document.getElementById('nr');
  var btnClear = document.getElementById('btn-clear');

  if (!listPrep || !csrf) return;

  function say(text, ok) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'adm__msg ' + (ok ? 'adm__msg--ok' : 'adm__msg--fail');
  }

  function send(action, nr) {
    var body = new URLSearchParams();
    body.set('action', action);
    body.set('csrf', csrf);
    if (nr) body.set('nr', nr);
    return fetch('../api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: body.toString()
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        if (!res.data.ok) {
          say(res.data.error || 'Aktion fehlgeschlagen.', false);
          if (res.status === 401 || res.status === 403) {
            say('Sitzung abgelaufen — bitte Seite neu laden und erneut anmelden.', false);
          }
          return false;
        }
        say(res.data.message || 'Erledigt.', true);
        return true;
      })
      .catch(function () { say('Server nicht erreichbar.', false); return false; });
  }

  function row(o, ready) {
    var li = document.createElement('li');
    li.className = 'adm__item' + (ready ? ' adm__item--ready' : '');

    var nr = document.createElement('span');
    nr.className = 'adm__itemnr';
    nr.textContent = o.nr;
    li.appendChild(nr);

    var actions = document.createElement('div');
    actions.className = 'adm__itemactions';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'adm__btn ' + (ready ? 'adm__btn--ghost' : 'adm__btn--primary');
    toggle.textContent = ready ? 'Zurück in Vorbereitung' : 'Abholbereit';
    toggle.setAttribute('aria-label',
      (ready ? 'Nummer ' + o.nr + ' zurück in Vorbereitung setzen'
             : 'Nummer ' + o.nr + ' als abholbereit melden'));
    toggle.addEventListener('click', function () {
      toggle.disabled = true;
      send(ready ? 'prep' : 'ready', o.nr).then(refresh);
    });
    actions.appendChild(toggle);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'adm__btn adm__btn--danger';
    del.style.width = 'auto';
    del.textContent = 'Löschen';
    del.setAttribute('aria-label', 'Nummer ' + o.nr + ' löschen');
    del.addEventListener('click', function () {
      del.disabled = true;
      send('delete', o.nr).then(refresh);
    });
    actions.appendChild(del);

    li.appendChild(actions);
    return li;
  }

  function refresh() {
    return fetch('../api.php?action=state', { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        listPrep.replaceChildren.apply(listPrep, (d.prep || []).map(function (o) { return row(o, false); }));
        listReady.replaceChildren.apply(listReady, (d.ready || []).map(function (o) { return row(o, true); }));
        if (emptyPrep)  emptyPrep.hidden  = (d.prep || []).length > 0;
        if (emptyReady) emptyReady.hidden = (d.ready || []).length > 0;
      })
      .catch(function () { say('Server nicht erreichbar.', false); });
  }

  if (formAdd) {
    formAdd.addEventListener('submit', function (e) {
      e.preventDefault();
      var nr = (inputNr.value || '').trim();
      if (!nr) return;
      send('add', nr).then(function (ok) {
        if (ok) { inputNr.value = ''; }
        inputNr.focus();
        return refresh();
      });
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', function () {
      if (!window.confirm('Wirklich alle Nummern vom Monitor entfernen?')) return;
      send('clear').then(refresh);
    });
  }

  refresh();
  setInterval(refresh, 10000);
})();
