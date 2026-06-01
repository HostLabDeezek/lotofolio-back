export default function (plop) {
    plop.setGenerator('endpoint', {
        description: 'Générer route + controller + service',
        prompts: [
            {
                type: 'input',
                name: 'name',
                message: 'Nom de la ressource (ex: grille, partie) ?',
            },
        ],
        actions: [
            {
                type: 'add',
                path: 'src/routes/{{camelCase name}}.routes.ts',
                templateFile: 'plop-templates/route.hbs',
            },
            {
                type: 'add',
                path: 'src/controllers/{{camelCase name}}.controller.ts',
                templateFile: 'plop-templates/controller.hbs',
            },
            {
                type: 'add',
                path: 'src/services/{{camelCase name}}.service.ts',
                templateFile: 'plop-templates/service.hbs',
            },
        ],
    });
}