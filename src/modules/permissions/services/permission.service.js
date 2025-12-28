const { Permission } = require("../../../database/associations");

/**
 * Obtiene el catálogo completo de permisos disponibles (ver, editar, imprimir...)
 */
exports.getAllPermissions = async () => {
    return await Permission.findAll({
        where: { active: true },
        attributes: ['id', 'name', 'description'],
        order: [['id', 'ASC']]
    });
};