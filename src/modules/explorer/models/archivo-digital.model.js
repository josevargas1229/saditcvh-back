const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");
const Documento = require("./documento.model");
const User = require("../../users/models/user.model");

const ArchivoDigital = sequelize.define(
  "ArchivoDigital",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    documento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Documento,
        key: "id",
      },
    },
    nombre_archivo: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ruta_almacenamiento: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: "ruta_almacenamiento",
    },
    ruta_preservacion: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "ruta_preservacion",
    },
    ruta_acceso: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "ruta_acceso",
    },
    ruta_texto: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "ruta_texto",
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "mime_type",
    },
    tamano_bytes: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: "tamano_bytes",
    },
    dimensiones: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "dimensiones",
    },
    resolucion_dpi: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "resolucion_dpi",
    },
    pagina_numero: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "pagina_numero",
    },
    total_paginas: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: "total_paginas",
    },
    checksum_md5: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "checksum_md5",
    },
    checksum_sha256: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "checksum_sha256",
    },
    calidad_escaneo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: "calidad_escaneo",
    },
    estado_ocr: {
      type: DataTypes.ENUM("pendiente", "procesando", "completado", "error"),
      defaultValue: "pendiente",
      field: "estado_ocr",
    },
    texto_ocr: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "texto_ocr",
    },
    metadatos_tecnicos: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "metadatos_tecnicos",
    },
    fecha_digitalizacion: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "fecha_digitalizacion",
    },
    digitalizado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "digitalizado_por",
    },
    revisado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "revisado_por",
    },
    fecha_revision: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "fecha_revision",
    },
    version_archivo: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      field: "version_archivo",
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "archivos_digitales",
    underscored: true,
    paranoid: true, // Se habilita deleted_at para soft delete
    deletedAt: "deleted_at",
  },
);

// Relaciones
ArchivoDigital.belongsTo(Documento, {
  foreignKey: "documento_id",
  as: "documento",
});

Documento.hasMany(ArchivoDigital, {
  foreignKey: "documento_id",
  as: "archivosDigitales",
});
ArchivoDigital.belongsTo(User, {
  foreignKey: "digitalizado_por",
  as: "digitalizadoPor",
});

module.exports = ArchivoDigital;
