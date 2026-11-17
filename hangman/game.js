// Hangman rules and word lists (no DOM). A game is a plain object (stored as is):
//   { word, lang, cat, hint, source: 'list'|'own', lives, guessed: ['A', …], hints: n, gaveUp: bool }
// word: upper case, letters of the game's alphabet plus spaces and hyphens (shown right away).
// Mistakes = wrong letters + tips taken; the game is lost when mistakes reach lives.
(function (root) {
  'use strict';
  const PARTS = 11; // hill, pole, beam, strut, rope, head, body, 2 arms, 2 legs
  const LIVES = { easy: 11, medium: 8, hard: 6 };
  const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const ALPHABET = { de: [...BASE, 'Ä', 'Ö', 'Ü'], en: [...BASE] };
  const CATEGORIES = ['animals', 'food', 'home', 'nature', 'vehicles', 'play'];
  const MAX_LEN = 30;

  const list = s => s.trim().split(/\s*,\s*/);
  const WORDS = {
    de: {
      animals: list('HUND, KATZE, PFERD, ELEFANT, GIRAFFE, KROKODIL, PINGUIN, SCHMETTERLING, EICHHÖRNCHEN, IGEL, FUCHS, HASE, KÄNGURU, LÖWE, TIGER, ZEBRA, DELFIN, WAL, SCHILDKRÖTE, EULE, PAPAGEI, FROSCH, SCHNECKE, MAUS, NASHORN, NILPFERD, AFFE, BIENE, MARIENKÄFER, KAMEL, ESEL, ZIEGE, SCHAF, DACHS, OTTER, FLAMINGO, REGENWURM, SEEHUND, KRAKE, QUALLE'),
      food: list('APFEL, BANANE, ERDBEERE, KIRSCHE, BIRNE, ZITRONE, ANANAS, WASSERMELONE, KAROTTE, GURKE, TOMATE, KARTOFFEL, ZWIEBEL, BROT, BRÖTCHEN, BUTTER, KÄSE, JOGHURT, NUDELN, PIZZA, PFANNKUCHEN, SCHOKOLADE, KEKS, KUCHEN, HONIG, MARMELADE, MÜSLI, SUPPE, SALAT, POMMES, BREZEL, HIMBEERE, PAPRIKA, BROKKOLI, SPAGHETTI, WAFFEL, KAKAO, LIMONADE, ORANGE, MANDARINE'),
      home: list('TISCH, STUHL, SOFA, BETT, LAMPE, SCHRANK, SPIEGEL, TEPPICH, FENSTER, TÜR, KÜHLSCHRANK, HERD, BACKOFEN, WASCHMASCHINE, BADEWANNE, DUSCHE, ZAHNBÜRSTE, HANDTUCH, KISSEN, DECKE, REGAL, VORHANG, TELEFON, FERNSEHER, UHR, SCHLÜSSEL, BESEN, EIMER, GABEL, LÖFFEL, MESSER, TELLER, TASSE, KOCHTOPF, PFANNE, KERZE, TREPPE, BRIEFKASTEN, STAUBSAUGER, WECKER'),
      nature: list('BAUM, BLUME, SONNE, MOND, STERN, WOLKE, REGEN, REGENBOGEN, GEWITTER, SCHNEE, BERG, WALD, WIESE, FLUSS, MEER, INSEL, STRAND, VULKAN, WÜSTE, HÖHLE, WASSERFALL, BLATT, WURZEL, PILZ, GRAS, STEIN, SAND, NEBEL, WIND, BLITZ, GLETSCHER, TANNE, SONNENBLUME, LÖWENZAHN, TULPE, ROSE, KASTANIE, EICHEL, MOOS, QUELLE'),
      vehicles: list('AUTO, BUS, ZUG, FAHRRAD, FLUGZEUG, HUBSCHRAUBER, SCHIFF, BOOT, RAKETE, TRAKTOR, BAGGER, LASTWAGEN, MOTORRAD, ROLLER, U-BAHN, TAXI, KRANKENWAGEN, FEUERWEHRAUTO, POLIZEIAUTO, SEGELBOOT, KANU, U-BOOT, SKATEBOARD, ZEPPELIN, KUTSCHE, SCHLITTEN, TRETROLLER, WOHNMOBIL, MÜLLAUTO, LOKOMOTIVE, GONDEL, FÄHRE, KIPPLASTER, SEILBAHN, SCHUBKARRE, KRAN, LIEFERWAGEN, STRASSENKEHRER, HEISSLUFTBALLON, RIKSCHA'),
      play: list('HANDBALL, TENNIS, SCHWIMMEN, REITEN, TURNEN, KLETTERN, SKIFAHREN, BASKETBALL, VOLLEYBALL, TISCHTENNIS, BADMINTON, JUDO, KARATE, LAUFEN, TANZEN, SEGELN, RUDERN, SURFEN, EISHOCKEY, SCHACH, TRAMPOLIN, SCHAUKEL, RUTSCHE, DRACHEN, PUZZLE, MURMELN, VERSTECKEN, SEILSPRINGEN, KEGELN, BOWLING, GOLF, HOCKEY, RADFAHREN, WANDERN, ANGELN, ZELTEN, MEMORY, WÜRFEL, SANDKASTEN, HÜPFBURG'),
    },
    en: {
      animals: list('DOG, CAT, HORSE, ELEPHANT, GIRAFFE, CROCODILE, PENGUIN, BUTTERFLY, SQUIRREL, HEDGEHOG, FOX, RABBIT, KANGAROO, LION, TIGER, ZEBRA, DOLPHIN, WHALE, TURTLE, OWL, PARROT, FROG, SNAIL, MOUSE, RHINO, HIPPO, MONKEY, BEE, LADYBIRD, CAMEL, DONKEY, GOAT, SHEEP, BADGER, OTTER, FLAMINGO, EARTHWORM, SEAL, OCTOPUS, JELLYFISH'),
      food: list('APPLE, BANANA, STRAWBERRY, CHERRY, PEAR, LEMON, PINEAPPLE, WATERMELON, CARROT, CUCUMBER, TOMATO, POTATO, ONION, BREAD, BUTTER, CHEESE, YOGURT, NOODLES, PIZZA, PANCAKE, CHOCOLATE, COOKIE, CAKE, HONEY, JAM, CEREAL, SOUP, SALAD, PRETZEL, ICE CREAM, RASPBERRY, BROCCOLI, SPAGHETTI, WAFFLE, SANDWICH, POPCORN, LEMONADE, ORANGE, MUFFIN, PEANUT'),
      home: list('TABLE, CHAIR, SOFA, BED, LAMP, CUPBOARD, MIRROR, CARPET, WINDOW, DOOR, FRIDGE, STOVE, OVEN, WASHING MACHINE, BATHTUB, SHOWER, TOOTHBRUSH, TOWEL, PILLOW, BLANKET, SHELF, CURTAIN, TELEPHONE, TELEVISION, CLOCK, KEY, BROOM, BUCKET, FORK, SPOON, KNIFE, PLATE, CUP, SAUCEPAN, CANDLE, STAIRS, MAILBOX, VACUUM CLEANER, ALARM CLOCK, DOORBELL'),
      nature: list('TREE, FLOWER, SUN, MOON, STAR, CLOUD, RAIN, RAINBOW, THUNDERSTORM, SNOW, MOUNTAIN, FOREST, MEADOW, RIVER, LAKE, SEA, ISLAND, BEACH, VOLCANO, DESERT, CAVE, WATERFALL, LEAF, ROOT, MUSHROOM, GRASS, STONE, SAND, FOG, WIND, LIGHTNING, GLACIER, FIR TREE, SUNFLOWER, DANDELION, TULIP, ROSE, CHESTNUT, ACORN, MOSS'),
      vehicles: list('CAR, BUS, TRAIN, BICYCLE, AIRPLANE, HELICOPTER, SHIP, BOAT, ROCKET, TRACTOR, EXCAVATOR, TRUCK, MOTORCYCLE, SCOOTER, TRAM, SUBWAY, TAXI, AMBULANCE, FIRE ENGINE, POLICE CAR, SAILBOAT, CANOE, SUBMARINE, SKATEBOARD, ZEPPELIN, CARRIAGE, SLED, CAMPER VAN, GARBAGE TRUCK, LOCOMOTIVE, GONDOLA, FERRY, DUMP TRUCK, CABLE CAR, WHEELBARROW, CRANE, VAN, HOT AIR BALLOON, RICKSHAW, KAYAK'),
      play: list('HANDBALL, TENNIS, SWIMMING, RIDING, GYMNASTICS, CLIMBING, SKIING, BASKETBALL, VOLLEYBALL, TABLE TENNIS, BADMINTON, JUDO, KARATE, RUNNING, DANCING, SAILING, ROWING, SURFING, ICE HOCKEY, CHESS, TRAMPOLINE, SWING, SLIDE, KITE, PUZZLE, MARBLES, HIDE AND SEEK, SKIPPING, BOWLING, GOLF, HOCKEY, CYCLING, HIKING, FISHING, CAMPING, FOOTBALL, DOMINOES, DICE, SANDPIT, BOUNCY CASTLE'),
    },
  };

  const langOf = l => (l === 'en' ? 'en' : 'de');
  // Upper case (ß becomes SS), single spaces, no spaces around hyphens
  const normalize = s => String(s || '').toLocaleUpperCase('de').replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim();
  const isLetter = (ch, lang) => ALPHABET[langOf(lang)].includes(ch);

  // Error code for a word the players typed, or '' if it can be played
  function check(word, lang) {
    const w = normalize(word);
    if (!w) return 'empty';
    if (w.length > MAX_LEN) return 'long';
    if ([...w].some(ch => ch !== ' ' && ch !== '-' && !isLetter(ch, lang))) return 'chars';
    if (/^[ -]|[ -]$|[ -]{2}/.test(w)) return 'chars';
    if (new Set([...w].filter(ch => isLetter(ch, lang))).size < 2) return 'short';
    return '';
  }

  const create = ({ word, lang, cat = '', hint = '', source = 'list', lives = LIVES.medium }) =>
    ({ word: normalize(word), lang: langOf(lang), cat, hint: String(hint || '').trim().slice(0, 40), source, lives, guessed: [], hints: 0, gaveUp: false });

  const letters = g => [...new Set([...g.word].filter(ch => isLetter(ch, g.lang)))];
  const wrong = g => g.guessed.filter(ch => !g.word.includes(ch));
  const mistakes = g => wrong(g).length + g.hints;
  const missing = g => letters(g).filter(ch => !g.guessed.includes(ch));
  function status(g) {
    if (!missing(g).length) return 'won';
    if (g.gaveUp || mistakes(g) >= g.lives) return 'lost';
    return 'playing';
  }
  // Characters as shown: a letter, or null for a gap; spaces and hyphens as they are
  const mask = g => [...g.word].map(ch => (!isLetter(ch, g.lang) || g.guessed.includes(ch) || status(g) !== 'playing' ? ch : null));
  // How many parts of the drawing are visible (fewer lives = the gallows stands from the start)
  const parts = g => Math.min(PARTS, PARTS - g.lives + mistakes(g));

  // Throws an error code ('over', 'letter', 'guessed'); returns true for a hit
  function guess(g, letter) {
    const ch = normalize(letter);
    if (status(g) !== 'playing') throw new Error('over');
    if (ch.length !== 1 || !isLetter(ch, g.lang)) throw new Error('letter');
    if (g.guessed.includes(ch)) throw new Error('guessed');
    g.guessed.push(ch);
    return g.word.includes(ch);
  }
  // Uncovers one missing letter at the cost of one mistake; never the last life
  const canTip = g => status(g) === 'playing' && g.lives - mistakes(g) > 1 && missing(g).length > 1;
  function tip(g, rnd = Math.random) {
    if (!canTip(g)) throw new Error('tip');
    const m = missing(g), ch = m[Math.floor(rnd() * m.length)];
    g.guessed.push(ch); g.hints++;
    return ch;
  }

  // A random word of the category ('all' = any), avoiding the recently played ones while possible
  function pick(lang, cat, recent = [], rnd = Math.random) {
    const L = langOf(lang), cats = CATEGORIES.includes(cat) ? [cat] : CATEGORIES;
    const all = cats.flatMap(c => WORDS[L][c].map(word => ({ word, cat: c })));
    const fresh = all.filter(x => !recent.includes(x.word));
    const from = fresh.length ? fresh : all;
    return from[Math.floor(rnd() * from.length)];
  }

  root.Hangman = { PARTS, LIVES, ALPHABET, CATEGORIES, WORDS, MAX_LEN, normalize, isLetter, check, create, letters, wrong, mistakes, missing, status, mask, parts, guess, canTip, tip, pick };
})(typeof window !== 'undefined' ? window : globalThis);
