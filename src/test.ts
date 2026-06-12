import tirageService from './services/tirage.service.js';
import { AppError } from './errors/AppError.js';
import { prisma } from './lib/prisma.js';

async function run() {
    try {
        //const result = await tirageService.getCurrentTirageByJeuId(99999);
        const partie = await prisma.partie.findFirst({
      where: {
        userId: 100,
        tirageId: 1,
      },
    }); // id inexistant
        //console.log('Tirage retourné :', result);
        console.log('Partie retournée :', partie);
    } catch (err) {
        if (err instanceof AppError) {
            console.log('AppError attrapée :');
            console.log('  code       :', err.code);       // 'JEU_NOT_FOUND'
            console.log('  statusCode :', err.statusCode); // 404
            console.log('  message    :', err.message);    // 'Jeu avec id 99999 non trouvé'
        } else {
            console.error('Erreur inattendue :', err);
        }
    } finally {
        process.exit(0); // ferme la connexion Prisma proprement
    }
}

run();