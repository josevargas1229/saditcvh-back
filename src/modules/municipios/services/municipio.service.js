const { Municipio } = require("../../../database/associations");

/**
 * Obtiene todos los municipios ordenados por número
 */
exports.getAllMunicipios = async () => {
    return await Municipio.findAll({
        order: [['num', 'ASC']]
    });
};

exports.getMunicipioById = async (id) => {
    const municipio = await Municipio.findByPk(id);
    if (!municipio) throw new Error("Municipio no encontrado");
    return municipio;
};