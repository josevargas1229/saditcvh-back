"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("users", [
      {
        id: 1,
        username: "admin",
        first_name: "System",
        last_name: "Administrator",
        second_last_name: null,
        email: "admin@admin.com",
        password: "$2b$10$wVm4j85cOC7nsenDi/5vBuuK2OKeC4OoR0ov32GG3ZP4skrczTiw.",
        phone: null,
        active: true,
        cargo_id: 1,
        created_by: null,
        updated_by: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", null, {});
  }
};
