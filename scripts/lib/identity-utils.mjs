export const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = new Map();
for (let first = 65; first <= 90; first++) for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    const name = regions.of(code);
    if (name !== code) countries.set(normalize(name), code.toLowerCase());
}
const aliases = { british: 'gb', unitedkingdom: 'gb', uk: 'gb', greatbritain: 'gb', english: 'gb', australian: 'au', dutch: 'nl', german: 'de', italian: 'it', french: 'fr', monegasque: 'mc', monaco: 'mc', spanish: 'es', canadian: 'ca', finnish: 'fi', danish: 'dk', mexican: 'mx', brazilian: 'br', argentine: 'ar', argentinian: 'ar', newzealander: 'nz', thai: 'th', japanese: 'jp', american: 'us', unitedstatesofamerica: 'us' };
const racingCodes = { GBR: 'gb', NED: 'nl', MON: 'mc', MCO: 'mc', GER: 'de', DEU: 'de', ITA: 'it', FIN: 'fi', BRA: 'br', ARG: 'ar', AUS: 'au', NZL: 'nz', JPN: 'jp', FRA: 'fr', CAN: 'ca', MEX: 'mx', ESP: 'es', THA: 'th', SWE: 'se', USA: 'us', SUI: 'ch', CHE: 'ch', CHN: 'cn', POL: 'pl', DEN: 'dk', DNK: 'dk', IND: 'in', BEL: 'be', RUS: 'ru', INA: 'id', IDN: 'id' };
export const flagCode = nationality => racingCodes[String(nationality).toUpperCase()] || aliases[normalize(nationality)] || countries.get(normalize(nationality)) || null;
