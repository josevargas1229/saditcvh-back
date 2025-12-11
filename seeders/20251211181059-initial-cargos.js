"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("cargos", [
      { id: 1, nombre: "Director" },
      { id: 2, nombre: "Jefe de área" },
      { id: 3, nombre: "Auxiliar" },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("cargos", null, {});
  }
};
