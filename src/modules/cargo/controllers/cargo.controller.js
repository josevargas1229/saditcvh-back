const cargoService = require("../services/cargo.service");

exports.getCargos = async (req, res, next) => {
    try {
        const cargos = await cargoService.getAllCargos();
        res.status(200).json({ 
            success: true, 
            message: "Lista de cargos obtenida", 
            data: cargos 
        });
    } catch (err) { next(err); }
};

exports.createCargo = async (req, res, next) => {
    try {
        const cargo = await cargoService.createCargo(req.body, req);
        res.status(201).json({ 
            success: true, 
            message: "Cargo creado exitosamente", 
            data: cargo 
        });
    } catch (err) { next(err); }
};

exports.updateCargo = async (req, res, next) => {
    try {
        const cargo = await cargoService.updateCargo(req.params.id, req.body, req);
        res.status(200).json({ 
            success: true, 
            message: "Cargo actualizado exitosamente", 
            data: cargo 
        });
    } catch (err) { next(err); }
};

exports.deleteCargo = async (req, res, next) => {
    try {
        await cargoService.deleteCargo(req.params.id, req);
        res.status(200).json({ 
            success: true, 
            message: "Cargo eliminado correctamente",
            data: null
        });
    } catch (err) { next(err); }
};