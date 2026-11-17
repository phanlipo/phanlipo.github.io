/* Einheitenrechner – units and conversion without DOM (window.Units). Architecture: unit-converter/README.md.
   Every category has one reference unit (the SI unit where there is one). A unit converts to it with
     linear units:   ref = (value + o) · f           (o = offset, only temperatures)
     inverse units:  ref = inv / value               (fuel consumption: km/L, mpg ↔ L/100 km)
   Factors are exact by definition where a definition exists (inch = 0.0254 m, lb = 0.45359237 kg, …);
   a unit with `approx: true` is a customary value, not a definition.
   Each unit: id (stable, also for WebMCP and storage), sym, de, en, and si: true for the SI unit and SI-prefixed
   units (plus units accepted for use with the SI where the category says so); the others count as "other units".
   A category may set value (start value instead of 1). */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const NA = 6.02214076e23;             // Avogadro constant (exact since 2019)
  const E = 1.602176634e-19;            // elementary charge in C (exact)
  const C = 299792458;                  // speed of light in m/s (exact)
  const GN = 9.80665;                   // standard gravity in m/s² (exact)
  const LB = 0.45359237, FT = 0.3048, IN = 0.0254, MI = 1609.344, NMI = 1852, GAL_US = 3.785411784e-3, GAL_UK = 4.54609e-3;
  const LBF = LB * GN;                  // pound-force in N

  // u(id, sym, de, en, factor, extra)
  const u = (id, sym, de, en, f, x) => Object.assign({ id, sym, de, en, f }, x || {});
  const si = (id, sym, de, en, f, x) => u(id, sym, de, en, f, Object.assign({ si: true }, x || {}));
  // SI-prefixed units of a base symbol: list of [prefix symbol, German/English prefix name, power of ten]
  const P = { Q: ['Quetta', 30], R: ['Ronna', 27], Y: ['Yotta', 24], Z: ['Zetta', 21], E: ['Exa', 18], P: ['Peta', 15], T: ['Tera', 12],
    G: ['Giga', 9], M: ['Mega', 6], k: ['Kilo', 3], h: ['Hekto', 2], da: ['Deka', 1], d: ['Dezi', -1], c: ['Zenti', -2], m: ['Milli', -3],
    µ: ['Mikro', -6], n: ['Nano', -9], p: ['Piko', -12], f: ['Femto', -15], a: ['Atto', -18], z: ['Zepto', -21], y: ['Yokto', -24], r: ['Ronto', -27], q: ['Quekto', -30] };
  const EN_PREFIX = { Hekto: 'hecto', Deka: 'deca', Dezi: 'deci', Zenti: 'centi', Mikro: 'micro', Piko: 'pico', Quekto: 'quecto', Yokto: 'yocto', Ronto: 'ronto' };
  const prefixed = (prefixes, id, sym, de, en, f = 1) => prefixes.map(p => {
    if (p === '') return si(id, sym, de, en, f);
    const [name, exp] = P[p];
    const enName = (EN_PREFIX[name] || name.toLowerCase());
    return si(p.replace('µ', 'u') + id, p + sym, name + de.toLowerCase(), enName + en, f * Math.pow(10, exp));
  });

  const CATEGORIES = [
    /* ---------- SI base quantities ---------- */
    { id: 'length', group: 'base', icon: 'ruler', de: 'Länge', en: 'Length', ref: 'm', from: 'm', to: 'ft', units: [
      ...prefixed(['k', '', 'd', 'c', 'm', 'µ', 'n', 'p'], 'm', 'm', 'Meter', 'metre'),
      u('angstrom', 'Å', 'Ångström', 'ångström', 1e-10),
      u('in', 'in', 'Zoll (inch)', 'inch', IN), u('ft', 'ft', 'Fuß (foot)', 'foot', FT), u('yd', 'yd', 'Yard', 'yard', 0.9144),
      u('mi', 'mi', 'Meile', 'mile', MI), u('nmi', 'sm', 'Seemeile', 'nautical mile', NMI),
      u('au', 'AE', 'Astronomische Einheit', 'astronomical unit', 149597870700), u('ly', 'Lj', 'Lichtjahr', 'light-year', C * 365.25 * 86400),
      u('pc', 'pc', 'Parsec', 'parsec', 149597870700 * 648000 / PI),
    ] },
    { id: 'mass', group: 'base', icon: 'weight', de: 'Masse', en: 'Mass', ref: 'kg', from: 'kg', to: 'lb', siNote: true, units: [
      si('t', 't', 'Tonne', 'tonne', 1000), si('kg', 'kg', 'Kilogramm', 'kilogram', 1), si('g', 'g', 'Gramm', 'gram', 1e-3),
      si('mg', 'mg', 'Milligramm', 'milligram', 1e-6), si('ug', 'µg', 'Mikrogramm', 'microgram', 1e-9), si('ng', 'ng', 'Nanogramm', 'nanogram', 1e-12),
      u('lb', 'lb', 'Pfund (pound)', 'pound', LB), u('oz', 'oz', 'Unze (ounce)', 'ounce', LB / 16), u('st', 'st', 'Stone', 'stone', LB * 14),
      u('ozt', 'oz t', 'Feinunze (troy)', 'troy ounce', 0.0311034768), u('ct', 'ct', 'Karat', 'carat', 2e-4),
      u('ztr', 'Ztr', 'Zentner', 'German hundredweight (Zentner)', 50), u('shortton', 'sh tn', 'US-Tonne (short ton)', 'short ton', LB * 2000),
      u('longton', 'l tn', 'Britische Tonne (long ton)', 'long ton', LB * 2240), u('da', 'u', 'Atomare Masseneinheit', 'dalton', 1.66053906660e-27),
    ] },
    { id: 'time', group: 'base', icon: 'clock', de: 'Zeit', en: 'Time', ref: 's', from: 'h', to: 'min', units: [
      ...prefixed(['', 'm', 'µ', 'n', 'p'], 's', 's', 'Sekunde', 'second'),
      si('min', 'min', 'Minute', 'minute', 60), si('h', 'h', 'Stunde', 'hour', 3600), si('d', 'd', 'Tag', 'day', 86400),
      u('wk', 'Wo', 'Woche', 'week', 604800), u('mo', 'Mon', 'Monat (Mittel)', 'month (mean)', 31557600 / 12),
      u('a', 'a', 'Jahr (365 Tage)', 'year (365 days)', 31536000), u('aj', 'a', 'Julianisches Jahr (365,25 Tage)', 'Julian year (365.25 days)', 31557600),
    ] },
    { id: 'temperature', group: 'base', icon: 'temperature', de: 'Temperatur', en: 'Temperature', ref: 'K', from: 'degC', to: 'degF', value: '20', units: [
      si('K', 'K', 'Kelvin', 'kelvin', 1), si('degC', '°C', 'Grad Celsius', 'degree Celsius', 1, { o: 273.15 }),
      u('degF', '°F', 'Grad Fahrenheit', 'degree Fahrenheit', 5 / 9, { o: 459.67 }), u('degR', '°Ra', 'Grad Rankine', 'degree Rankine', 5 / 9),
      u('degRe', '°Ré', 'Grad Réaumur', 'degree Réaumur', 1.25, { o: 218.52 }),
    ] },
    { id: 'current', group: 'base', icon: 'circuit-ammeter', de: 'Stromstärke', en: 'Electric current', ref: 'A', from: 'mA', to: 'A', units: [
      ...prefixed(['k', '', 'm', 'µ', 'n'], 'A', 'A', 'Ampere', 'ampere'),
      u('abA', 'abA', 'Abampere (CGS)', 'abampere (CGS)', 10), u('statA', 'statA', 'Statampere (CGS)', 'statampere (CGS)', 0.1 / C),
    ] },
    { id: 'amount', group: 'base', icon: 'atom', de: 'Stoffmenge', en: 'Amount of substance', ref: 'mol', from: 'mmol', to: 'mol', units: [
      ...prefixed(['k', '', 'm', 'µ', 'n', 'p'], 'mol', 'mol', 'Mol', 'mole'),
      u('particles', 'Teilchen', 'Anzahl Teilchen', 'number of particles', 1 / NA), u('lbmol', 'lb-mol', 'Pfund-Mol', 'pound-mole', LB * 1000),
    ] },
    { id: 'luminous', group: 'base', icon: 'bulb', de: 'Lichtstärke', en: 'Luminous intensity', ref: 'cd', from: 'cd', to: 'mcd', units: [
      ...prefixed(['k', '', 'm'], 'cd', 'cd', 'Candela', 'candela'),
      u('hk', 'HK', 'Hefnerkerze', 'Hefner candle', 0.903, { approx: true }),
    ] },

    /* ---------- Space and mechanics ---------- */
    { id: 'area', group: 'mech', icon: 'square', de: 'Fläche', en: 'Area', ref: 'm2', from: 'm2', to: 'ft2', units: [
      si('km2', 'km²', 'Quadratkilometer', 'square kilometre', 1e6), si('ha', 'ha', 'Hektar', 'hectare', 1e4), si('are', 'a', 'Ar', 'are', 100),
      si('m2', 'm²', 'Quadratmeter', 'square metre', 1), si('dm2', 'dm²', 'Quadratdezimeter', 'square decimetre', 1e-2),
      si('cm2', 'cm²', 'Quadratzentimeter', 'square centimetre', 1e-4), si('mm2', 'mm²', 'Quadratmillimeter', 'square millimetre', 1e-6),
      u('in2', 'in²', 'Quadratzoll', 'square inch', IN * IN), u('ft2', 'ft²', 'Quadratfuß', 'square foot', FT * FT),
      u('yd2', 'yd²', 'Quadratyard', 'square yard', 0.9144 * 0.9144), u('acre', 'ac', 'Acre', 'acre', 4046.8564224),
      u('mi2', 'mi²', 'Quadratmeile', 'square mile', MI * MI),
    ] },
    { id: 'volume', group: 'mech', icon: 'bucket', de: 'Volumen', en: 'Volume', ref: 'm3', from: 'L', to: 'galUS', units: [
      si('m3', 'm³', 'Kubikmeter', 'cubic metre', 1), si('hl', 'hl', 'Hektoliter', 'hectolitre', 0.1), si('L', 'l', 'Liter', 'litre', 1e-3),
      si('dl', 'dl', 'Deziliter', 'decilitre', 1e-4), si('cl', 'cl', 'Zentiliter', 'centilitre', 1e-5), si('ml', 'ml', 'Milliliter', 'millilitre', 1e-6),
      si('cm3', 'cm³', 'Kubikzentimeter', 'cubic centimetre', 1e-6), si('mm3', 'mm³', 'Kubikmillimeter', 'cubic millimetre', 1e-9),
      u('galUS', 'gal (US)', 'Gallone (US)', 'gallon (US)', GAL_US), u('galUK', 'gal (UK)', 'Gallone (UK)', 'gallon (imperial)', GAL_UK),
      u('qtUS', 'qt (US)', 'Quart (US)', 'quart (US)', GAL_US / 4), u('ptUS', 'pt (US)', 'Pint (US)', 'pint (US)', GAL_US / 8),
      u('ptUK', 'pt (UK)', 'Pint (UK)', 'pint (imperial)', GAL_UK / 8), u('cupUS', 'cup', 'Cup (US)', 'cup (US)', GAL_US / 16),
      u('flozUS', 'fl oz (US)', 'Flüssigunze (US)', 'fluid ounce (US)', GAL_US / 128), u('flozUK', 'fl oz (UK)', 'Flüssigunze (UK)', 'fluid ounce (imperial)', GAL_UK / 160),
      u('tbsp', 'EL', 'Esslöffel (US, 15 ml)', 'tablespoon (US)', GAL_US / 256), u('tsp', 'TL', 'Teelöffel (US, 5 ml)', 'teaspoon (US)', GAL_US / 768),
      u('in3', 'in³', 'Kubikzoll', 'cubic inch', IN * IN * IN), u('ft3', 'ft³', 'Kubikfuß', 'cubic foot', FT * FT * FT),
      u('bbl', 'bbl', 'Barrel (Erdöl)', 'barrel (oil)', GAL_US * 42),
    ] },
    { id: 'speed', group: 'mech', icon: 'run', de: 'Geschwindigkeit', en: 'Speed', ref: 'mps', from: 'kmh', to: 'mph', units: [
      si('mps', 'm/s', 'Meter pro Sekunde', 'metre per second', 1), si('kmh', 'km/h', 'Kilometer pro Stunde', 'kilometre per hour', 1 / 3.6),
      si('cmps', 'cm/s', 'Zentimeter pro Sekunde', 'centimetre per second', 0.01),
      u('mph', 'mph', 'Meilen pro Stunde', 'mile per hour', MI / 3600), u('kn', 'kn', 'Knoten', 'knot', NMI / 3600),
      u('fps', 'ft/s', 'Fuß pro Sekunde', 'foot per second', FT), u('c', 'c', 'Lichtgeschwindigkeit', 'speed of light', C),
    ] },
    { id: 'accel', group: 'mech', icon: 'rocket', de: 'Beschleunigung', en: 'Acceleration', ref: 'mps2', from: 'mps2', to: 'gn', units: [
      si('mps2', 'm/s²', 'Meter pro Sekunde²', 'metre per second squared', 1), si('cmps2', 'cm/s²', 'Gal (cm/s²)', 'gal (cm/s²)', 0.01),
      u('gn', 'g', 'Normfallbeschleunigung', 'standard gravity', GN), u('fps2', 'ft/s²', 'Fuß pro Sekunde²', 'foot per second squared', FT),
    ] },
    { id: 'force', group: 'mech', icon: 'arrow-big-right-lines', de: 'Kraft', en: 'Force', ref: 'N', from: 'N', to: 'kp', units: [
      ...prefixed(['M', 'k', '', 'm'], 'N', 'N', 'Newton', 'newton'),
      u('kp', 'kp', 'Kilopond', 'kilogram-force', GN), u('lbf', 'lbf', 'Pound-force', 'pound-force', LBF), u('dyn', 'dyn', 'Dyn', 'dyne', 1e-5),
    ] },
    { id: 'pressure', group: 'mech', icon: 'gauge', de: 'Druck', en: 'Pressure', ref: 'Pa', from: 'bar', to: 'psi', units: [
      ...prefixed(['M', 'k', 'h', ''], 'Pa', 'Pa', 'Pascal', 'pascal'),
      u('bar', 'bar', 'Bar', 'bar', 1e5), u('mbar', 'mbar', 'Millibar', 'millibar', 100), u('atm', 'atm', 'Physikalische Atmosphäre', 'standard atmosphere', 101325),
      u('at', 'at', 'Technische Atmosphäre', 'technical atmosphere', GN * 1e4), u('torr', 'Torr', 'Torr', 'torr', 101325 / 760),
      u('mmHg', 'mmHg', 'Millimeter Quecksilbersäule', 'millimetre of mercury', 133.322387415), u('psi', 'psi', 'Pfund-Kraft pro Quadratzoll', 'pound-force per square inch', LBF / (IN * IN)),
      u('inHg', 'inHg', 'Zoll Quecksilbersäule', 'inch of mercury', 3386.389), u('mH2O', 'mWS', 'Meter Wassersäule', 'metre of water', GN * 1000),
    ] },
    { id: 'energy', group: 'mech', icon: 'flame', de: 'Energie', en: 'Energy', ref: 'J', from: 'kWh', to: 'kcal', units: [
      ...prefixed(['G', 'M', 'k', '', 'm'], 'J', 'J', 'Joule', 'joule'),
      si('Wh', 'Wh', 'Wattstunde', 'watt-hour', 3600), si('kWh', 'kWh', 'Kilowattstunde', 'kilowatt-hour', 3.6e6), si('MWh', 'MWh', 'Megawattstunde', 'megawatt-hour', 3.6e9),
      u('cal', 'cal', 'Kalorie', 'calorie', 4.184), u('kcal', 'kcal', 'Kilokalorie', 'kilocalorie', 4184), u('eV', 'eV', 'Elektronenvolt', 'electronvolt', E),
      u('btu', 'BTU', 'British Thermal Unit', 'British thermal unit', 1055.05585262), u('ftlbf', 'ft·lbf', 'Foot-pound', 'foot-pound', FT * LBF),
      u('erg', 'erg', 'Erg', 'erg', 1e-7), u('tce', 't SKE', 'Tonne Steinkohleeinheit', 'tonne of coal equivalent', 29.3076e9),
    ] },
    { id: 'power', group: 'mech', icon: 'plug', de: 'Leistung', en: 'Power', ref: 'W', from: 'kW', to: 'PS', units: [
      ...prefixed(['G', 'M', 'k', '', 'm'], 'W', 'W', 'Watt', 'watt'),
      u('PS', 'PS', 'Pferdestärke (PS)', 'metric horsepower', 735.49875), u('hp', 'hp', 'Horsepower (mechanisch)', 'horsepower (mechanical)', 33000 * FT * LBF / 60),
      u('kcalh', 'kcal/h', 'Kilokalorien pro Stunde', 'kilocalorie per hour', 4184 / 3600), u('btuh', 'BTU/h', 'BTU pro Stunde', 'BTU per hour', 1055.05585262 / 3600),
    ] },
    { id: 'torque', group: 'mech', icon: 'rotate-clockwise', de: 'Drehmoment', en: 'Torque', ref: 'Nm', from: 'Nm', to: 'lbfft', units: [
      si('kNm', 'kN·m', 'Kilonewtonmeter', 'kilonewton metre', 1000), si('Nm', 'N·m', 'Newtonmeter', 'newton metre', 1), si('Ncm', 'N·cm', 'Newtonzentimeter', 'newton centimetre', 0.01),
      u('kpm', 'kp·m', 'Kilopondmeter', 'kilogram-force metre', GN), u('lbfft', 'lbf·ft', 'Pound-foot', 'pound-foot', LBF * FT), u('lbfin', 'lbf·in', 'Pound-inch', 'pound-inch', LBF * IN),
    ] },
    { id: 'density', group: 'mech', icon: 'stack-2', de: 'Dichte', en: 'Density', ref: 'kgm3', from: 'gcm3', to: 'kgm3', units: [
      si('kgm3', 'kg/m³', 'Kilogramm pro Kubikmeter', 'kilogram per cubic metre', 1), si('gcm3', 'g/cm³', 'Gramm pro Kubikzentimeter', 'gram per cubic centimetre', 1000),
      si('kgL', 'kg/l', 'Kilogramm pro Liter', 'kilogram per litre', 1000), si('gL', 'g/l', 'Gramm pro Liter', 'gram per litre', 1),
      u('lbft3', 'lb/ft³', 'Pfund pro Kubikfuß', 'pound per cubic foot', LB / (FT * FT * FT)), u('lbgal', 'lb/gal', 'Pfund pro Gallone (US)', 'pound per gallon (US)', LB / GAL_US),
    ] },
    { id: 'angle', group: 'mech', icon: 'angle', de: 'Winkel', en: 'Angle', ref: 'rad', from: 'deg', to: 'rad', units: [
      si('rad', 'rad', 'Radiant', 'radian', 1), si('mrad', 'mrad', 'Milliradiant', 'milliradian', 1e-3),
      u('deg', '°', 'Grad', 'degree', PI / 180), u('arcmin', '′', 'Winkelminute', 'arcminute', PI / 10800), u('arcsec', '″', 'Winkelsekunde', 'arcsecond', PI / 648000),
      u('gon', 'gon', 'Gon', 'gradian', PI / 200), u('turn', 'U', 'Umdrehung', 'turn', 2 * PI),
    ] },
    { id: 'frequency', group: 'mech', icon: 'wave-sine', de: 'Frequenz', en: 'Frequency', ref: 'Hz', from: 'MHz', to: 'kHz', units: [
      ...prefixed(['T', 'G', 'M', 'k', '', 'm'], 'Hz', 'Hz', 'Hertz', 'hertz'),
      u('rpm', '1/min', 'Umdrehungen pro Minute', 'revolutions per minute', 1 / 60), u('rph', '1/h', 'pro Stunde', 'per hour', 1 / 3600),
    ] },

    /* ---------- Electricity and magnetism ---------- */
    { id: 'charge', group: 'elec', icon: 'battery-charging', de: 'Ladung', en: 'Electric charge', ref: 'C', from: 'mAh', to: 'C', units: [
      ...prefixed(['k', '', 'm', 'µ', 'n', 'p'], 'C', 'C', 'Coulomb', 'coulomb'),
      u('Ah', 'Ah', 'Amperestunde', 'ampere-hour', 3600), u('mAh', 'mAh', 'Milliamperestunde', 'milliampere-hour', 3.6), u('e', 'e', 'Elementarladung', 'elementary charge', E),
    ] },
    { id: 'voltage', group: 'elec', icon: 'circuit-voltmeter', de: 'Spannung', en: 'Voltage', ref: 'V', from: 'kV', to: 'V', units: [
      ...prefixed(['M', 'k', '', 'm', 'µ'], 'V', 'V', 'Volt', 'volt'),
      u('statV', 'statV', 'Statvolt (CGS)', 'statvolt (CGS)', C / 1e6), u('abV', 'abV', 'Abvolt (CGS)', 'abvolt (CGS)', 1e-8),
    ] },
    { id: 'resistance', group: 'elec', icon: 'circuit-resistor', de: 'Widerstand', en: 'Resistance', ref: 'ohm', from: 'kohm', to: 'ohm', units: [
      ...prefixed(['G', 'M', 'k', '', 'm'], 'ohm', 'Ω', 'Ohm', 'ohm'),
      u('abohm', 'abΩ', 'Abohm (CGS)', 'abohm (CGS)', 1e-9),
    ] },
    { id: 'capacitance', group: 'elec', icon: 'circuit-capacitor', de: 'Kapazität', en: 'Capacitance', ref: 'F', from: 'uF', to: 'nF', units: [
      ...prefixed(['', 'm', 'µ', 'n', 'p'], 'F', 'F', 'Farad', 'farad'),
      u('abF', 'abF', 'Abfarad (CGS)', 'abfarad (CGS)', 1e9), u('statF', 'statF', 'Statfarad (CGS)', 'statfarad (CGS)', 1e5 / (C * C)),
    ] },
    { id: 'inductance', group: 'elec', icon: 'circuit-inductor', de: 'Induktivität', en: 'Inductance', ref: 'H', from: 'mH', to: 'uH', units: [
      ...prefixed(['', 'm', 'µ', 'n'], 'H', 'H', 'Henry', 'henry'),
      u('abH', 'abH', 'Abhenry (CGS)', 'abhenry (CGS)', 1e-9),
    ] },
    { id: 'flux', group: 'elec', icon: 'magnet', de: 'Magnetischer Fluss', en: 'Magnetic flux', ref: 'Wb', from: 'Wb', to: 'Mx', units: [
      ...prefixed(['', 'm', 'µ'], 'Wb', 'Wb', 'Weber', 'weber'),
      u('Mx', 'Mx', 'Maxwell', 'maxwell', 1e-8),
    ] },
    { id: 'fluxdensity', group: 'elec', icon: 'grid-dots', de: 'Magnetische Flussdichte', en: 'Magnetic flux density', ref: 'T', from: 'mT', to: 'G', units: [
      ...prefixed(['', 'm', 'µ', 'n'], 'T', 'T', 'Tesla', 'tesla'),
      u('G', 'G', 'Gauß', 'gauss', 1e-4), u('gamma', 'γ', 'Gamma', 'gamma', 1e-9),
    ] },

    /* ---------- Light, radiation and chemistry ---------- */
    { id: 'lumflux', group: 'light', icon: 'sun', de: 'Lichtstrom', en: 'Luminous flux', ref: 'lm', from: 'lm', to: 'klm', units: [
      ...prefixed(['k', '', 'm'], 'lm', 'lm', 'Lumen', 'lumen'),
    ] },
    { id: 'illuminance', group: 'light', icon: 'brightness-up', de: 'Beleuchtungsstärke', en: 'Illuminance', ref: 'lx', from: 'lx', to: 'fc', units: [
      ...prefixed(['k', '', 'm'], 'lx', 'lx', 'Lux', 'lux'),
      u('fc', 'fc', 'Foot-candle', 'foot-candle', 1 / (FT * FT)), u('ph', 'ph', 'Phot', 'phot', 1e4),
    ] },
    { id: 'activity', group: 'light', icon: 'radioactive', de: 'Radioaktivität', en: 'Radioactivity', ref: 'Bq', from: 'kBq', to: 'uCi', units: [
      ...prefixed(['G', 'M', 'k', ''], 'Bq', 'Bq', 'Becquerel', 'becquerel'),
      u('Ci', 'Ci', 'Curie', 'curie', 3.7e10), u('mCi', 'mCi', 'Millicurie', 'millicurie', 3.7e7), u('uCi', 'µCi', 'Mikrocurie', 'microcurie', 3.7e4),
      u('nCi', 'nCi', 'Nanocurie', 'nanocurie', 37), u('Rd', 'Rd', 'Rutherford', 'rutherford', 1e6),
    ] },
    { id: 'dose', group: 'light', icon: 'shield-half', de: 'Energiedosis', en: 'Absorbed dose', ref: 'Gy', from: 'mGy', to: 'rad', units: [
      ...prefixed(['', 'm', 'µ'], 'Gy', 'Gy', 'Gray', 'gray'),
      u('rad', 'rd', 'Rad', 'rad', 0.01), u('mrad', 'mrd', 'Millirad', 'millirad', 1e-5),
    ] },
    { id: 'equivdose', group: 'light', icon: 'shield-check', de: 'Äquivalentdosis', en: 'Equivalent dose', ref: 'Sv', from: 'mSv', to: 'rem', units: [
      ...prefixed(['', 'm', 'µ'], 'Sv', 'Sv', 'Sievert', 'sievert'),
      u('rem', 'rem', 'Rem', 'rem', 0.01), u('mrem', 'mrem', 'Millirem', 'millirem', 1e-5),
    ] },
    { id: 'catalytic', group: 'light', icon: 'flask', de: 'Katalytische Aktivität', en: 'Catalytic activity', ref: 'kat', from: 'ukat', to: 'U', units: [
      ...prefixed(['', 'm', 'µ', 'n'], 'kat', 'kat', 'Katal', 'katal'),
      u('U', 'U', 'Enzymeinheit (µmol/min)', 'enzyme unit (µmol/min)', 1e-6 / 60),
    ] },

    /* ---------- Everyday ---------- */
    { id: 'data', group: 'daily', icon: 'device-floppy', de: 'Datenmenge', en: 'Data size', ref: 'B', from: 'GB', to: 'GiB',
      siLabel: { de: 'Dezimal (SI-Präfixe)', en: 'Decimal (SI prefixes)' }, otherLabel: { de: 'Binär (IEC) und Bit', en: 'Binary (IEC) and bits' }, units: [
      ...prefixed(['P', 'T', 'G', 'M', 'k', ''], 'B', 'B', 'Byte', 'byte'),
      u('KiB', 'KiB', 'Kibibyte', 'kibibyte', 1024), u('MiB', 'MiB', 'Mebibyte', 'mebibyte', 1024 ** 2), u('GiB', 'GiB', 'Gibibyte', 'gibibyte', 1024 ** 3),
      u('TiB', 'TiB', 'Tebibyte', 'tebibyte', 1024 ** 4), u('bit', 'bit', 'Bit', 'bit', 1 / 8), u('kbit', 'kbit', 'Kilobit', 'kilobit', 125),
      u('Mbit', 'Mbit', 'Megabit', 'megabit', 125e3), u('Gbit', 'Gbit', 'Gigabit', 'gigabit', 125e6),
    ] },
    { id: 'fuel', group: 'daily', icon: 'gas-station', de: 'Verbrauch', en: 'Fuel consumption', ref: 'l100km', from: 'l100km', to: 'mpgUS', value: '7',
      siLabel: { de: 'Metrisch', en: 'Metric' }, otherLabel: { de: 'USA und Großbritannien', en: 'US and UK' }, units: [
      si('l100km', 'l/100 km', 'Liter pro 100 km', 'litres per 100 km', 1), si('kml', 'km/l', 'Kilometer pro Liter', 'kilometres per litre', 0, { inv: 100 }),
      u('mpgUS', 'mpg (US)', 'Meilen pro Gallone (US)', 'miles per gallon (US)', 0, { inv: 100 * GAL_US * 1e6 / MI }),
      u('mpgUK', 'mpg (UK)', 'Meilen pro Gallone (UK)', 'miles per gallon (UK)', 0, { inv: 100 * GAL_UK * 1e6 / MI }),
    ] },
  ];

  const GROUPS = [
    { id: 'base', de: 'SI-Basisgrößen', en: 'SI base quantities' },
    { id: 'mech', de: 'Raum & Mechanik', en: 'Space & mechanics' },
    { id: 'elec', de: 'Elektrizität & Magnetismus', en: 'Electricity & magnetism' },
    { id: 'light', de: 'Licht, Strahlung & Chemie', en: 'Light, radiation & chemistry' },
    { id: 'daily', de: 'Alltag', en: 'Everyday' },
  ];

  const byId = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  const unitOf = (cat, id) => byId[cat] && byId[cat].units.find(x => x.id === id);

  /** Value in the reference unit of its category */
  function toRef(unit, v) {
    if (unit.inv) return unit.inv / v;
    return (v + (unit.o || 0)) * unit.f;
  }
  function fromRef(unit, r) {
    if (unit.inv) return unit.inv / r;
    return r / unit.f - (unit.o || 0);
  }
  /** Converts v from one unit to another of the same category; NaN when not possible (e.g. 0 mpg) */
  function convert(cat, from, to, v) {
    const a = unitOf(cat, from), b = unitOf(cat, to);
    if (!a || !b || !Number.isFinite(v)) return NaN;
    if (a === b) return v;
    const x = fromRef(b, toRef(a, v));
    return Number.isFinite(x) ? x : NaN;
  }
  /** Finds a unit by id or symbol (case-sensitive first, then case-insensitive), optionally within a category */
  function find(text, cat) {
    const t = String(text || '').trim();
    const cats = cat ? [byId[cat]].filter(Boolean) : CATEGORIES;
    for (const exact of [true, false]) {
      for (const c of cats) for (const x of c.units) {
        const keys = [x.id, x.sym, x.sym.replace('µ', 'u'), x.en, x.de];
        if (keys.some(k => exact ? k === t : k.toLowerCase() === t.toLowerCase())) return { cat: c.id, unit: x.id };
      }
    }
    return null;
  }

  // SI prefixes from quetta to quecto (for the prefix tool)
  const PREFIXES = Object.entries(P).map(([sym, [de, exp]]) => ({ sym, de, en: EN_PREFIX[de] || de.toLowerCase(), exp }))
    .concat([{ sym: '', de: '(ohne)', en: '(none)', exp: 0 }]).sort((a, b) => b.exp - a.exp);

  root.Units = { CATEGORIES, GROUPS, PREFIXES, byId, unitOf, toRef, fromRef, convert, find };
})(typeof window !== 'undefined' ? window : globalThis);
