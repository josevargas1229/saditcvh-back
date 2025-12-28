/**
 * SERVICIO: UserService
 * DESCRIPCIÓN: Gestión integral de identidades y administración de la matriz de acceso territorial.
 */
const sequelize = require("../../../config/db");
const { User, Role, Cargo, Permission, Municipio, UserMunicipalityPermission, UserRole} = require("../../../database/associations");
const bcrypt = require("bcryptjs");
const { Op, fn, col, where } = require("sequelize");

/**
 * Recupera el perfil y los municipios con acceso para el usuario actual.
 * Filtra únicamente municipios y permisos que estén marcados como activos.
 */
exports.getUserAccessTerritories = async (userId) => {
    const userAccess = await UserMunicipalityPermission.findAll({
        where: { 
            user_id: userId,
            active: true // Solo registros de acceso activos
        },
        include: [
            { 
                model: Municipio, 
                as: 'municipio', 
                where: { active: true }, // Solo municipios activos
                attributes: ['id', 'num', 'nombre'] 
            },
            { 
                model: Permission, 
                as: 'permission', 
                where: { active: true }, // Solo permisos base activos
                attributes: ['id', 'name'] 
            }
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
 * Por defecto excluye usuarios eliminados lógicamente (Sequelize Paranoid).
 */
exports.getAllUsers = async (query) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const offset = (page - 1) * limit;

    const whereUser = {};
    // Si no se especifica, filtramos por usuarios activos por defecto
    if (query.active !== undefined) {
        whereUser.active = query.active === "true";
    } else {
        whereUser.active = true;
    }
    
    if (query.cargo_id) whereUser.cargo_id = query.cargo_id;

    if (query.search) {
        const search = `%${query.search}%`;
        whereUser[Op.or] = [
            { first_name: { [Op.iLike]: search } },
            { last_name: { [Op.iLike]: search } },
            { second_last_name: { [Op.iLike]: search } },
            { username: { [Op.iLike]: search } },
            { email: { [Op.iLike]: search } },
            where(fn("concat", col("creator.first_name"), " ", col("creator.last_name")), { [Op.iLike]: search }),
            { "$creator.username$": { [Op.iLike]: search } },
            where(fn("concat", col("editor.first_name"), " ", col("editor.last_name")), { [Op.iLike]: search }),
            { "$editor.username$": { [Op.iLike]: search } }
        ];
    }

    let order = [["id", "DESC"]];
    if (query.sortBy) {
        const direction = query.order === "desc" ? "DESC" : "ASC";
        switch (query.sortBy) {
            case "name": order = [["first_name", direction]]; break;
            case "creator": order = [[{ model: User, as: "creator" }, "first_name", direction]]; break;
            case "editor": order = [[{ model: User, as: "editor" }, "first_name", direction]]; break;
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
            { model: Cargo, as: "cargo", attributes: ["id", "nombre"] },
            { 
                model: Role, 
                as: "roles", 
                attributes: ["id", "name"], 
                through: { attributes: [] },
                where: query.role_id ? { id: query.role_id } : undefined,
                required: !!query.role_id
            },
            { model: User, as: "creator", attributes: ["id", "username", "first_name", "last_name"] },
            { model: User, as: "editor", attributes: ["id", "username", "first_name", "last_name"] }
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
 * Obtiene el detalle de un usuario incluyendo su matriz de permisos granulares activos.
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
                where: { active: true }, // Solo mostrar permisos vigentes
                required: false,
                include: [
                    { model: Municipio, as: 'municipio', attributes: ['id', 'num' ,'nombre'] },
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
            updated_by: adminId,
            active: true
        }, { transaction });

        if (data.roles && data.roles.length > 0) {
            // setRoles manejará la inserción en user_roles
            await newUser.setRoles(data.roles, { transaction });

            const rolesWithPermissions = await Role.findAll({
                where: { id: data.roles, active: true },
                include: [{ model: Permission, as: 'base_permissions', where: { active: true } }]
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
                        is_exception: false,
                        active: true
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
 * Actualiza la información del usuario y resincroniza la matriz mediante eliminación lógica.
 */
exports.updateUser = async (id, data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id, { transaction });
        if (!user) throw new Error("Entidad de usuario no localizada.");

        if (data.password) data.password = await bcrypt.hash(data.password, 12);
        await user.update({ ...data, updated_by: adminId }, { transaction });

        const hayCambioMunicipios = data.municipios !== undefined;
        const hayCambioRoles = data.roles !== undefined;

        if (hayCambioRoles || hayCambioMunicipios) {
            if (hayCambioRoles) {
                // Al ser UserRole ahora PARANOID, Sequelize marcará deleted_at 
                // en los roles que se quiten en lugar de borrarlos físicamente.
                await user.setRoles(data.roles, { transaction });
            }

            let targetMunicipios = [];
            if (hayCambioMunicipios) {
                targetMunicipios = data.municipios;
            } else {
                const currentAccess = await UserMunicipalityPermission.findAll({
                    where: { user_id: id, active: true },
                    attributes: ['municipio_id'],
                    group: ['municipio_id'],
                    transaction
                });
                targetMunicipios = currentAccess.map(a => a.municipio_id);
            }

            await UserMunicipalityPermission.destroy({ 
                where: { user_id: id, is_exception: false }, 
                transaction 
            });

            if (targetMunicipios.length > 0) {
                const verPermission = await Permission.findOne({ 
                    where: { name: 'ver', active: true }, 
                    transaction 
                });
                const basePermissionId = verPermission ? verPermission.id : 1;

                const bulkPermissions = targetMunicipios.map(muniId => ({
                    user_id: id,
                    municipio_id: muniId,
                    permission_id: basePermissionId,
                    is_exception: false,
                    active: true
                }));

                await UserMunicipalityPermission.bulkCreate(bulkPermissions, { transaction });
            }
        }

        await transaction.commit();
        return { id, message: "Sincronización procesada correctamente." };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Gestión manual de excepciones. Usa destroy() para borrado lógico si value es false.
 */
exports.updateSinglePermission = async (userId, municipioId, permissionId, value) => {
    if (value === true) {
        return await UserMunicipalityPermission.upsert({
            user_id: userId,
            municipio_id: municipioId,
            permission_id: permissionId,
            is_exception: true,
            active: true
        });
    } else {
        return await UserMunicipalityPermission.destroy({
            where: { user_id: userId, municipio_id: municipioId, permission_id: permissionId }
        });
    }
};

/**
 * Actualización masiva de permisos (Batch Update) con eliminación lógica.
 */
exports.updatePermissionsBatch = async (userId, changes) => {
    const transaction = await sequelize.transaction();
    try {
        const toCreate = [];
        const toDeleteIds = [];

        // 1. Clasificar cambios en memoria (Rapidísimo)
        for (const change of changes) {
            const { municipioId, permissionId, value } = change;
            
            if (value === true) {
                // Preparamos para Bulk Create
                toCreate.push({
                    user_id: userId,
                    municipio_id: municipioId,
                    permission_id: permissionId,
                    is_exception: true,
                    created_at: new Date(),
                    updated_at: new Date(),
                    active: true
                });
            } else {
                // Preparamos criterio para borrar
                toDeleteIds.push({ 
                    user_id: userId, 
                    municipio_id: municipioId, 
                    permission_id: permissionId 
                });
            }
        }

        // 2. Ejecutar Eliminaciones Masivas (1 sola consulta)
        if (toDeleteIds.length > 0) {
            await UserMunicipalityPermission.destroy({
                where: { [Op.or]: toDeleteIds },
                transaction
            });
        }

        if (toCreate.length > 0) {
            await UserMunicipalityPermission.bulkCreate(toCreate, {
                updateOnDuplicate: ['is_exception', 'active', 'updated_at'], 
                transaction
            });
        }

        await transaction.commit();
        return { success: true };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Borrado lógico integral (Cascading Soft-Delete).
 * Desactiva al usuario y revoca lógicamente roles y permisos municipales.
 */
exports.deleteUser = async (id) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id);
        if (!user) throw new Error("Registro no localizado.");
        
        // 1. Desactivación y borrado lógico del usuario
        await user.update({ active: false }, { transaction });
        await user.destroy({ transaction });

        // 2. Revocación lógica de Roles (Si UserRole es paranoid)
        // Nota: Si UserRole no tiene campo 'active', solo hacemos el destroy.
        // Si lo tiene, hacemos el update primero.
        await UserRole.destroy({
            where: { user_id: id },
            transaction
        });

        // 3. Revocación lógica de Matriz de Permisos (paranoid + active)
        // Aquí aplicamos tu observación: marcamos active: false antes del destroy
        await UserMunicipalityPermission.update(
            { active: false }, 
            { where: { user_id: id }, transaction }
        );
        
        await UserMunicipalityPermission.destroy({
            where: { user_id: id },
            transaction
        });

        await transaction.commit();
        return { success: true };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};