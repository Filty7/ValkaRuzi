# Válka růží

Strategická karetní hra pro 2–4 hráče (jednosouborový HTML/JS prototyp, česky).

- `dist/index.html` – hotová hra, stačí otevřít v prohlížeči
- `game.js` – pravidla a AI botů, `ui.js` + `art.js` + `audio.js` + `style.css` + `template.html` – rozhraní, `tutorial.js` – interaktivní tutorial
- `node build.js` – sestaví `valka_ruzi_stul.html` (a fragment); `dist/index.html` je jeho kopie
- `tests/` – regresní testy (`cat game.js tests/test_stubs.js tests/test_overhaul.js | node`), `tools/` – benchmark botů a testovací hra
- `docs/update-VIII.md` – poslední změny (nová Špionáž, chytřejší boti, tutorial, zvuk, truhla a Panství)

Terminologie: karta „v truhle“ (uschovaná lícem dolů), „Panství“ (získaná pole + truhla). Skóre barvy = pole × (1 + karty v truhle té barvy).
