const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");
const { Municipio } = require("../../../database/associations");

// const Municipio = require("./Municipio.model");
const Modalidad = require("./Modalidad.model");
const TiposAutorizacion = require("./TiposAutorizacion.model");

const Autorizacion = sequelize.define("Autorizacion", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    numeroAutorizacion: {
        type: DataTypes.STRING(50),
        allowNull: true, unique: true,
        field: 'numero_autorizacion'
    },
    municipioId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'municipio_id',
        references: {
            model: 'municipios',
            key: 'id'
        }
    },
    modalidadId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'modalidad_id',
        references: {
            model: 'modalidad',
            key: 'id'
        }
    },
    tipoId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'tipo_id',
        references: {
            model: 'tipos_autorizacion',
            key: 'id'
        }
    },
    consecutivo1: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    consecutivo2: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    nombreCarpeta: {
        type: DataTypes.STRING(500),
        allowNull: true, 
        field: 'nombre_carpeta'
    },
    fechaCreacion: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW,
        field: 'fecha_creacion'
    },
    activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    solicitante: {
        type: DataTypes.STRING(300),
        allowNull: true,
    },
    fechaSolicitud: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW,  
        allowNull: true,
        field: 'fecha_solicitud'
    },

    rutaFisicaBase: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'ruta_fisica_base'
    },
    rutaDigitalBase: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'ruta_digital_base'
    },
}, {
    timestamps: false,
    paranoid: false,
    tableName: "autorizaciones",
    underscored: true,
});

// // Relaciones
Autorizacion.belongsTo(Municipio, {
    foreignKey: 'municipio_id',
    targetKey: 'id',
    as: 'municipio'
});

Autorizacion.belongsTo(Modalidad, {
    foreignKey: 'modalidad_id',
    targetKey: 'id',
    as: 'modalidad'
});

Autorizacion.belongsTo(TiposAutorizacion, {
    foreignKey: 'tipo_id',
    targetKey: 'id',
    as: 'tipoAutorizacion'
});

module.exports = Autorizacion;