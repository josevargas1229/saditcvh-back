const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME || 'dbdigitalacion',
  process.env.DB_USER || 'app_db_user',
  process.env.DB_PASSWORD || 'eQ22Kt6H&=IETt)B8#hBR7',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: "postgres",
    logging: false,
    timezone: '-06:00',
    pool: {
      max: 20,
      min: 0,
      idle: 30000,
      acquire: 20000,
    },
    dialectOptions: process.env.PG_SSL === "true"
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
  }
);

module.exports = sequelize;
