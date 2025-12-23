const municipioService = require("../services/municipio.service");

exports.getMunicipios = async (req, res, next) => {
    try {
        const municipios = await municipioService.getAllMunicipios();
        res.status(200).json({ 
            success: true, 
            message: "Lista de municipios obtenida", 
            data: municipios 
        });
    } catch (err) { next(err); }
};

exports.getMunicipioById = async (req, res, next) => {
    try {
        const municipio = await municipioService.getMunicipioById(req.params.id);
        res.status(200).json({ 
            success: true, 
            message: "Municipio encontrado", 
            data: municipio 
        });
    } catch (err) { next(err); }
};