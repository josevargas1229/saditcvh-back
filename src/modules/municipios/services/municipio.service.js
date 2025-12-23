/**
 * SERVICIO: MunicipioService
 * DESCRIPCIÓN: Lógica de negocio para la gestión y consulta del catálogo de municipios.
 */
const { Municipio } = require("../../../database/associations");

/**
 * Recupera el catálogo completo de municipios registrados.
 * @returns {Promise<Array>} Listado de municipios ordenados ascendentemente por su identificador numérico.
 */
exports.getAllMunicipios = async () => {
    return await Municipio.findAll({
        order: [['num', 'ASC']]
    });
};

/**
 * Localiza un municipio específico mediante su identificador primario.
 * @param {number} id - Identificador único de la entidad.
 * @throws {Error} Si el registro no existe en la base de datos.
 * @returns {Promise<Object>} Instancia de la entidad Municipio.
 */
exports.getMunicipioById = async (id) => {
    const municipio = await Municipio.findByPk(id);
    if (!municipio) {
        throw new Error("Municipio no localizado en el catálogo actual.");
    }
    return municipio;
};