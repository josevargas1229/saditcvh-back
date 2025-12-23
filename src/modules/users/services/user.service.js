/**
 * SERVICIO: UserService
 * DESCRIPCIÓN: Gestión integral de identidades y administración de la matriz de acceso territorial.
 */
const sequelize = require("../../../config/db");
const { User, Role, Cargo, Permission, Municipio, UserMunicipalityPermission } = require("../../../database/associations");
const bcrypt = require("bcryptjs");
const { Op, fn, col, where } = require("sequelize");

/**
 * Recupera el perfil y los municipios con acceso para el usuario actual.
 * @param {number} userId - Identificador del usuario logueado.
 * @returns {Promise<Object>} Estructura agrupada de territorios y privilegios.
 */
exports.getUserAccessTerritories = async (userId) => {
    const userAccess = await UserMunicipalityPermission.findAll({
        where: { user_id: userId },
        include: [
            { model: Municipio, as: 'municipio', attributes: ['id', 'num', 'nombre'] },
            { model: Permission, as: 'permission', attributes: ['id', 'name'] }
        ],
        attributes: ['is_exception']
    });

    // Agrupamos la matriz para facilitar el consumo del frontend por municipio
    const territories = userAccess.reduce((acc, curr) => {
        const muniId = curr.municipio.id;
        if (!acc[muniId]) {
            acc[muniId] = {
                ...curr.municipio.toJSON(),
                permisos: []
            };
        }
        acc[muniId].permisos.push(curr.permission.name);
        return acc;
    }, {});

    return Object.values(territories);
};

/**
 * Consulta avanzada de usuarios con soporte para paginación, filtrado y búsqueda global.
 */
exports.getAllUsers = async (query) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const offset = (page - 1) * limit;

    const whereUser = {};
    if (query.active !== undefined) whereUser.active = query.active === "true";
    if (query.cargo_id) whereUser.cargo_id = query.cargo_id;

    if (query.search) {
        const search = `%${query.search}%`;
        whereUser[Op.or] = [
            { first_name: { [Op.iLike]: search } },
            { last_name: { [Op.iLike]: search } },
            { second_last_name: { [Op.iLike]: search } },
            { username: { [Op.iLike]: search } },
            { email: { [Op.iLike]: search } },

            // Creador
            where(fn("concat",
                col("creator.first_name"),
                " ",
                col("creator.last_name")
            ), { [Op.iLike]: search }),

            { "$creator.username$": { [Op.iLike]: search } },

            // Editor
            where(fn("concat",
                col("editor.first_name"),
                " ",
                col("editor.last_name")
            ), { [Op.iLike]: search }),

            { "$editor.username$": { [Op.iLike]: search } }
        ];
    }

    let order = [["id", "DESC"]];

    if (query.sortBy) {
        const direction = query.order === "desc" ? "DESC" : "ASC";

        switch (query.sortBy) {
            case "name":
                order = [["first_name", direction]];
                break;

            case "creator":
                order = [[{ model: User, as: "creator" }, "first_name", direction]];
                break;

            case "editor":
                order = [[{ model: User, as: "editor" }, "first_name", direction]];
                break;
        }
    }

    const result = await User.findAndCountAll({
        where: whereUser,
        distinct: true,
        subQuery: false,
        limit,
        offset,
        order,
        attributes: { exclude: ["password", "deleted_at"] },
        include: [
            {
                model: Cargo,
                as: "cargo",
                attributes: ["id", "nombre"],
                required: !!query.cargo_id
            },
            {
                model: Role,
                as: "roles",
                attributes: ["id", "name"],
                through: { attributes: [] },
                where: query.role_id ? { id: query.role_id } : undefined,
                required: !!query.role_id
            },
            {
                model: User,
                as: "creator",
                attributes: ["id", "username", "first_name", "last_name"]
            },
            {
                model: User,
                as: "editor",
                attributes: ["id", "username", "first_name", "last_name"]
            }
        ]
    });

    return {
        rows: result.rows,
        count: result.count,
        page,
        limit,
        totalPages: Math.ceil(result.count / limit)
    };
};

/**
 * Obtiene el detalle de un usuario incluyendo su matriz de permisos granulares.
 */
exports.getUserById = async (id) => {
    return await User.findByPk(id, {
        attributes: { exclude: ["password", "deleted_at"] },
        include: [
            { model: Cargo, as: 'cargo' },
            { model: Role, as: 'roles' },
            { 
                model: UserMunicipalityPermission, 
                as: 'municipality_access',
                include: [
                    { model: Municipio, as: 'municipio', attributes: ['id', 'nombre'] },
                    { model: Permission, as: 'permission', attributes: ['id', 'name'] }
                ]
            }
        ]
    });
};

/**
 * Proceso transaccional de alta de usuario con propagación de matriz de acceso.
 */
exports.createUser = async (data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        if (!data.municipios || data.municipios.length === 0) {
            throw new Error("Asignación territorial obligatoria (mínimo 1 municipio).");
        }

        if (data.password) data.password = await bcrypt.hash(data.password, 12);

        const newUser = await User.create({
            ...data,
            created_by: adminId,
            updated_by: adminId
        }, { transaction });

        if (data.roles && data.roles.length > 0) {
            await newUser.setRoles(data.roles, { transaction });

            const rolesWithPermissions = await Role.findAll({
                where: { id: data.roles },
                include: [{ model: Permission, as: 'base_permissions' }]
            });

            const permissionIds = new Set();
            rolesWithPermissions.forEach(role => {
                role.base_permissions.forEach(p => permissionIds.add(p.id));
            });

            const bulkPermissions = [];
            data.municipios.forEach(muniId => {
                permissionIds.forEach(permId => {
                    bulkPermissions.push({
                        user_id: newUser.id,
                        municipio_id: muniId,
                        permission_id: permId,
                        is_exception: false
                    });
                });
            });

            await UserMunicipalityPermission.bulkCreate(bulkPermissions, { transaction });
        }

        await transaction.commit();
        return await this.getUserById(newUser.id);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Actualiza la información del usuario y resincroniza la matriz de acceso si hay cambios.
 */
exports.updateUser = async (id, data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id);
        if (!user) throw new Error("Entidad de usuario no localizada.");

        if (data.password) data.password = await bcrypt.hash(data.password, 12);
        await user.update({ ...data, updated_by: adminId }, { transaction });

        if (data.roles || data.municipios) {
            await UserMunicipalityPermission.destroy({ 
                where: { user_id: id, is_exception: false }, 
                transaction 
            });

            if (data.roles) await user.setRoles(data.roles, { transaction });

            const currentRoles = data.roles || (await user.getRoles()).map(r => r.id);
            const currentMunis = data.municipios || [];

            if (currentMunis.length > 0) {
                const rolesWithPermissions = await Role.findAll({
                    where: { id: currentRoles },
                    include: [{ model: Permission, as: 'base_permissions' }]
                });

                const permissionIds = new Set();
                rolesWithPermissions.forEach(role => {
                    role.base_permissions.forEach(p => permissionIds.add(p.id));
                });

                const bulkPermissions = [];
                currentMunis.forEach(muniId => {
                    permissionIds.forEach(permId => {
                        bulkPermissions.push({
                            user_id: id,
                            municipio_id: muniId,
                            permission_id: permId,
                            is_exception: false
                        });
                    });
                });
                await UserMunicipalityPermission.bulkCreate(bulkPermissions, { transaction });
            }
        }

        await transaction.commit();
        return await this.getUserById(id);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Gestión manual de excepciones en la matriz de permisos.
 */
exports.updateSinglePermission = async (userId, municipioId, permissionId, value) => {
    if (value === true) {
        return await UserMunicipalityPermission.upsert({
            user_id: userId,
            municipio_id: municipioId,
            permission_id: permissionId,
            is_exception: true
        });
    } else {
        return await UserMunicipalityPermission.destroy({
            where: { user_id: userId, municipio_id: municipioId, permission_id: permissionId }
        });
    }
};

exports.deleteUser = async (id) => {
    const user = await User.findByPk(id);
    if (!user) throw new Error("Registro no localizado.");
    return await user.destroy();
};