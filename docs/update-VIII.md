# Válka růží — Update VIII (2026-10-15): nová Špionáž, chytřejší boti, tutorial, „hospodský“ zvuk

Navazuje na `claude/simulace-1000-her-balance.md` (Updates I–VII). Tabletop verze artefaktu: Version 5.

## 1) Zelená schopnost (Špionáž) — pátý redesign: nucené bankování

**Proč:** štít na vlastní kartu byl nudný a nic neměnil na stole. Cíl: něco invazivního jako ostatní barvy, ne OP, neopakující se (Vražda ničí, Svatba mění, Podpora církve přidává, Úplatky zamyká), a proveditelné i ve fyzické hře.

**Pravidlo:** vyber soupeře; ten musí hned banknout **náhodnou** kartu ze své ruky (vezmeš mu ji vslepo a položíš lícem dolů na jeho stůl). Počítá se jako běžná banknutá karta (hodnota 1 do součtu, po kole do jeho victory poolu). Propadá bez karet v ruce soupeře a při zákazu bankování (Henry VI.). Pod Edwardem IV. má banknutá karta hodnotu 0.

**Proč náhodná karta:** kdyby si soupeř kartu vybíral sám, vybral by nejslabší a ještě na bankování vydělal (bankování je jeho nejlepší tah). Takhle může přijít o eso, nebo o kartu barvy, kterou nesbírá (po bankování k ničemu), ale může taky trefit kartu své barvy a pomoct mu, takže je to riziko pro útočníka. Banknutá karta zůstane ležet na stole a je terčem Úplatků i Vraždy.

**Engine:** `triggerAbility` větev `G`, `spyWasteFraction` (podíl karet na ruce soupeře, které by bankováním zbyly bez užitku), `botSpyTargetScore`, `estimateAbilityValue('G')`, `botUseFavorTokenByGenome('G')`. Testy: `test_overhaul.js` (60 PASS), `test_ai_smartness.js` (11 PASS).

## 2) Chytřejší boti

Benchmark `bench_bots.js`: 1 „chytrý“ bot proti třem starým (se stejným natrénovaným genomem), sedadla rotují, 12–20 tisíc her (±0,7–0,9 p.b.). Základ je 25 % (4 hráči) / 33,3 % (3 hráči).

| Změna | Přínos (4 hráči) |
|---|---|
| Remízy při zamykání výhry (bot už nepassuje při shodě součtu, kterou by prohrál podle pořadí) | ~+2 p.b. |
| „Dorážka“: když všichni ostatní passli, bot spočítá nejlevnější sadu karet (zahrání / bankování = +1) na převzetí vedení | ~+3,5 p.b. |
| „Beznadějné kolo“: bot passne (a případně bankne), když soupeřovo vedení nedoženě ani svou nejvyšší kartou (+2 rezerva, když soupeři ještě hrají) | ~+8 p.b. |
| Soupeř bez karet a hrdiny se počítá jako zamčený | ~+0,6 p.b. |
| Banknutí v pořadí podle počtu polí dané barvy, výběr nejlevnější dostatečné karty, hodnota pole | ~+1 p.b. dohromady |

**Výsledek:** 1 chytrý bot vyhrává **38,6 %** her (4 hráči, baseline 25 %) a **50,2 %** (3 hráči, baseline 33,3 %). Dva chytří proti dvěma starým: 64 % pro dvojici. Logika je od teď zapnutá u všech botů (`player.smart`), obtížnost (50–100 %) funguje stejně jako dřív.

**Co nezabralo:** endgame „stakes“ (all-in, když hra končí) bylo horší, o 1–2 p.b. Lock-in margin při vedení je plochý. Hrubá koordinátní optimalizace 47 parametrů genomu (~2 × 8000 her na parametr) nic nad šum nenašla, takže genom zůstává.

**Hlavní poučení:** v téhle hře je rozhodující ekonomika karet (balíček má 32 karet, dobírá se 2 za kolo). Včasné vzdání beznadějného kola a přesné dorážení jsou silnější než ladění prahů.

## 3) Tutorial

Nový soubor `tutorial.js` (overlay `#tutorial`), 14 kroků ze skutečných karet (včetně kroku o remíze), polí a erbů: cíl hry, první tah (přetažení karty), pass a výhra kola, remíza (klikni na vítěze podle pořadí od začínajícího hráče), pole pod nohama, schopnost zdarma, pět schopností, žeton přízně, banknutí, počítání bodů (interaktivní), karta 1, hrdinové, konec kola/hry, shrnutí rad. Úkoly se plní přetažením (nebo klikem na kartu a pak na okno) a odemykají „Další“. Spouští se z úvodní obrazovky a z přehledu pravidel.

## 4) Zvuk

Efekty přepsány do „hospody u krbu“: šustění papíru (filtrovaný šum, měkký náběh), dřevěné „tok“ o stůl, hliněné cinknutí mincí, teplý zvonek ze sinusů, hrací skříňka; žádné ostré náběhy ani kovové zvonění, navíc dolní propust na sběrnici efektů. V hudbě (beze změny melodie) přidáno tiché praskání ohně. Offline měření (`test_audio.js`): podíl energie nad 3 kHz ~0 %, špička ≤ 0,5, žádné chyby.

## 5) Drobnosti

Tooltip hrdiny po zahrání ukazuje celý popis. Zelená má nové texty (banner, dlaždice).

## 6) Nová terminologie a náhled vlastní karty

- **Bankování → „Uschovat do truhly“** (karta „v truhle“), **victory pool → „Panství“**. Přejmenováno všude v UI, tutorialu, popisech schopností a hrdinů i v herním logu. Interní identifikátory v kódu (`bank`, `bankedPool`) zůstaly.
- Skóre barvy: **pole × (1 + karty v truhle té barvy)**, např. 2 pole × (1 + 3 karty v truhle) = 8.
- **Náhled vlastní karty v truhle:** po najetí myší (na dotyku podržením prstu) na svou kartu v truhle se na okamžik zvětší a ukáže barvu i hodnotu (v tutorialu také). Soupeřovy karty v truhle zůstávají rubem nahoru bez náhledu.

