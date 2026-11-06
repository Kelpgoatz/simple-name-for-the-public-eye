import {officialNationality as commonNationality} from './f2-source.mjs';
export {embeddedObjects,findObject,normalizeSession,normalizeResult,image} from './f2-source.mjs';
export function officialNationality(html) {
    const common=commonNationality(html);if(common)return common;
    const nationality=html.match(/<title>Flag of ([^<]+)<\/title>/)?.[1];
    const countryCode=({'Sri Lanka':'lk',China:'cn','People’s Republic of China':'cn',"People's Republic of China":'cn',Singapore:'sg','South Korea':'kr','Republic of Korea':'kr',Korea:'kr'})[nationality];
    return countryCode?{nationality,countryCode,flagUrl:`https://flagcdn.com/w160/${countryCode}.png`}:null;
}
