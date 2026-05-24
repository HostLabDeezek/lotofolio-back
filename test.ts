import tirageService from './src/services/tirage.service.js';

console.log(tirageService.getNextTirageUTC().toISOString());
console.log("le tableau", tirageService.drawRandomNumbers(5, 50));