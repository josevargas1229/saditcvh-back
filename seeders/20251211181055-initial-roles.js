"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("roles", [
      {
        id: 1,
        name: "administrador",
      },
      {
        id: 2,
        name: "operador",
      },
      {
        id: 3,
        name: "consulta",
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("roles", null, {});
  }
};
