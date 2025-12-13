const { Cargo } = require("../../../database/associations");

exports.getAllCargos = async () => await Cargo.findAll();

exports.createCargo = async (data) => await Cargo.create(data);

exports.updateCargo = async (id, data) => {
    const cargo = await Cargo.findByPk(id);
    if (!cargo) throw new Error("Cargo no encontrado");
    return await cargo.update(data);
};
exports.deleteCargo = async (id) => {
    const cargo = await Cargo.findByPk(id);
    if (!cargo) throw new Error("Cargo no encontrado");
    return await cargo.destroy();
};