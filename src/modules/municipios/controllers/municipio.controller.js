/**
 * CONTROLADOR: MunicipioController
 * DESCRIPCIÓN: Interfaz de comunicación entre las peticiones HTTP y la lógica de negocio de municipios.
 */
const municipioService = require("../services/municipio.service");

/**
 * Manejador para la obtención de todos los municipios.
 * @param {Request} req - Objeto de petición Express.
 * @param {Response} res - Objeto de respuesta Express.
 * @param {Function} next - Función para propagación de middleware de errores.
 */
exports.getMunicipios = async (req, res, next) => {
    try {
        const municipios = await municipioService.getAllMunicipios();
        return res.status(200).json({ 
            success: true, 
            message: "Catálogo de municipios recuperado exitosamente.", 
            data: municipios 
        });
    } catch (err) { 
        return next(err); 
    }
};

/**
 * Manejador para la obtención de un municipio por ID.
 * @param {Request} req - Objeto de petición Express con parámetro 'id'.
 * @param {Response} res - Objeto de respuesta Express.
 * @param {Function} next - Función para propagación de middleware de errores.
 */
exports.getMunicipioById = async (req, res, next) => {
    try {
        const municipio = await municipioService.getMunicipioById(req.params.id);
        return res.status(200).json({ 
            success: true, 
            message: "Datos del municipio obtenidos.", 
            data: municipio 
        });
    } catch (err) { 
        return next(err); 
    }
};