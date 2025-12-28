const { Cargo } = require("../../../database/associations");

exports.getAllCargos = async () => await Cargo.findAll();

exports.createCargo = async (data, req) => await Cargo.create(data, { req });

exports.updateCargo = async (id, data, req) => {
    const cargo = await Cargo.findByPk(id);
    if (!cargo) throw new Error("Cargo no encontrado");
    return await cargo.update(data, { req });
};

exports.deleteCargo = async (id, req) => {
    const cargo = await Cargo.findByPk(id);
    if (!cargo) throw new Error("Cargo no encontrado");
    return await cargo.destroy({ req });
};