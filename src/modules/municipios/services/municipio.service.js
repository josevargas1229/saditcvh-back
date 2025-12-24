/**
 * SERVICIO: MunicipioService
 * DESCRIPCIÓN: Lógica de negocio para la gestión y consulta del catálogo de municipios.
 */
const { Municipio } = require("../../../database/associations");

/**
 * Recupera el catálogo completo de municipios registrados.
 * OPTIMIZACIÓN: Se usa raw: true para evitar sobrecarga de memoria en listas largas.
 * @returns {Promise<Array>} Listado de municipios ordenados.
 */
exports.getAllMunicipios = async () => {
    return await Municipio.findAll({
        attributes: ['id', 'num', 'nombre'], // Solo traemos lo que usa el modal
        order: [['num', 'ASC']],
        raw: true // <--- ¡ESTO ES LA CLAVE! Devuelve JSON simple, no objetos Sequelize pesados.
    });
};

/**
 * Localiza un municipio específico mediante su identificador primario.
 */
exports.getMunicipioById = async (id) => {
    const municipio = await Municipio.findByPk(id, {
        raw: true // También aquí ayuda si solo vas a leer datos
    });
    
    if (!municipio) {
        throw new Error("Municipio no localizado en el catálogo actual.");
    }
    return municipio;
};