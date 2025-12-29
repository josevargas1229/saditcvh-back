/**
 * SERVICIO: UserService
 * DESCRIPCIÓN: Gestión integral de identidades y administración de la matriz de acceso territorial.
 */
const sequelize = require("../../../config/db");
const { User, Role, Cargo, Permission, Municipio, UserMunicipalityPermission, UserRole} = require("../../../database/associations");
const auditService = require("../../audit/services/audit.service");
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
exports.createUser = async (data, adminId, req) => {
    const transaction = await sequelize.transaction();
    try {
        if (!data.municipios || data.municipios.length === 0) throw new Error("Asignación territorial obligatoria.");

        if (data.password) data.password = await bcrypt.hash(data.password, 12);

        const newUser = await User.create({
            ...data,
            created_by: adminId,
            updated_by: adminId,
            active: true
        }, { transaction, req }); // <--- req activa el Hook automático

        if (data.roles && data.roles.length > 0) {
            await newUser.setRoles(data.roles, { transaction, req });

            const rolesWithPermissions = await Role.findAll({
                where: { id: data.roles, active: true },
                include: [{ model: Permission, as: 'base_permissions', where: { active: true } }]
            });

            const permissionIds = new Set();
            rolesWithPermissions.forEach(role => role.base_permissions.forEach(p => permissionIds.add(p.id)));

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
exports.updateUser = async (id, data, adminId, req) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id, { transaction });
        if (!user) throw new Error("Usuario no localizado.");

        if (data.password) data.password = await bcrypt.hash(data.password, 12);
        
        // El update automático generará el log de campos cambiados
        await user.update({ ...data, updated_by: adminId }, { transaction, req });

        if (data.roles !== undefined || data.municipios !== undefined) {
            if (data.roles !== undefined) await user.setRoles(data.roles, { transaction, req });

            let targetMunicipios = [];
            if (data.municipios !== undefined) {
                targetMunicipios = data.municipios;
            } else {
                const current = await UserMunicipalityPermission.findAll({
                    where: { user_id: id, active: true },
                    attributes: ['municipio_id'],
                    group: ['municipio_id'],
                    transaction
                });
                targetMunicipios = current.map(a => a.municipio_id);
            }

            await UserMunicipalityPermission.destroy({ where: { user_id: id, is_exception: false }, transaction });

            if (targetMunicipios.length > 0) {
                const verPerm = await Permission.findOne({ where: { name: 'ver', active: true }, transaction });
                const basePermId = verPerm ? verPerm.id : 1;
                const bulk = targetMunicipios.map(muniId => ({
                    user_id: id, municipio_id: muniId, permission_id: basePermId, is_exception: false, active: true
                }));
                await UserMunicipalityPermission.bulkCreate(bulk, { transaction });
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
 * Gestión manual de excepciones. Usa destroy() para borrado lógico si value es false.
 */
exports.updateSinglePermission = async (userId, municipioId, permissionId, value, req) => {
    // Buscamos la data descriptiva en paralelo para no perder performance
    const [targetUser, municipio, permission] = await Promise.all([
        User.findByPk(userId, { attributes: ['first_name', 'last_name', 'username'] }),
        Municipio.findByPk(municipioId, { attributes: ['nombre'] }),
        Permission.findByPk(permissionId, { attributes: ['name'] })
    ]);

    // AUDITORÍA ENRIQUECIDA
    await auditService.createLog(req, {
        action: 'UPDATE_PERMS',
        module: 'USER',
        entityId: userId,
        details: { 
            target_user: `${targetUser?.first_name} ${targetUser?.last_name}`.trim() || targetUser?.username,
            municipality: municipio?.nombre || 'Desconocido',
            type: 'SINGLE_EXCEPTION',
            changes: {
                added: value === true ? [permission?.name] : [],
                removed: value === false ? [permission?.name] : []
            }
        }
    });

    if (value === true) {
        return await UserMunicipalityPermission.upsert({
            user_id: userId, municipio_id: municipioId, permission_id: permissionId, is_exception: true, active: true
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
exports.updatePermissionsBatch = async (userId, changes, req) => {
    const transaction = await sequelize.transaction();
    
    try {
        // 1. Obtener nombres de referencia
        const targetUser = await User.findByPk(userId, { attributes: ['first_name', 'last_name', 'username'] });
        const allPermissions = await Permission.findAll({ attributes: ['id', 'name'] });
        const allMunicipios = await Municipio.findAll({ attributes: ['id', 'nombre'] });

        // Mapeos para búsqueda rápida
        const permsMap = Object.fromEntries(allPermissions.map(p => [p.id, p.name]));
        const munisMap = Object.fromEntries(allMunicipios.map(m => [m.id, m.nombre]));

        const toCreate = [];
        const toDeleteIds = [];
        
        // Estructura para el Log
        const added = [];
        const removed = [];
        const affectedMunis = new Set();

        for (const change of changes) {
            const { municipioId, permissionId, value } = change;
            const desc = `${permsMap[permissionId]} (${munisMap[municipioId]})`;
            affectedMunis.add(munisMap[municipioId]);

            if (value === true) {
                toCreate.push({ user_id: userId, municipio_id: municipioId, permission_id: permissionId, is_exception: true, active: true });
                added.push(desc);
            } else {
                toDeleteIds.push({ user_id: userId, municipio_id: municipioId, permission_id: permissionId });
                removed.push(desc);
            }
        }

        // AUDITORÍA MASIVA ENRIQUECIDA
        await auditService.createLog(req, {
            action: 'UPDATE_PERMS',
            module: 'USER',
            entityId: userId,
            details: { 
                target_user: `${targetUser?.first_name} ${targetUser?.last_name}`.trim() || targetUser?.username,
                municipality: Array.from(affectedMunis).join(', '),
                type: 'BATCH_UPDATE',
                total_changes: changes.length,
                changes: { added, removed }
            }
        });

        if (toDeleteIds.length > 0) await UserMunicipalityPermission.destroy({ where: { [Op.or]: toDeleteIds }, transaction });
        if (toCreate.length > 0) await UserMunicipalityPermission.bulkCreate(toCreate, { updateOnDuplicate: ['active'], transaction });
        
        await transaction.commit();
        return { success: true };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};


exports.getUserPermissionsRaw = async (userId) => {
    // Consulta directa y ligera: Solo trae IDs
    return await UserMunicipalityPermission.findAll({
        where: { user_id: userId, active: true },
        attributes: ['municipio_id', 'permission_id'],
        raw: true
    });
};

/**
 * Borrado lógico integral (Cascading Soft-Delete).
 * Desactiva al usuario y revoca lógicamente roles y permisos municipales.
 */
exports.deleteUser = async (id, req) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id);
        if (!user) throw new Error("Registro no localizado.");
        
        // 1. Desactivación y borrado lógico del usuario
        user.active = false;
        await user.save({ transaction });
        await user.destroy({ transaction, req }); // <--- Hook de DELETE

        // 2. Revocación lógica de Roles (Si UserRole es paranoid)
        // Nota: Si UserRole no tiene campo 'active', solo hacemos el destroy.
        // Si lo tiene, hacemos el update primero.
        await UserRole.destroy({ where: { user_id: id }, transaction, req });

        // 3. Revocación lógica de Matriz de Permisos (paranoid + active)
        // Aquí marcamos active: false antes del destroy
        await UserMunicipalityPermission.update({ active: false }, { where: { user_id: id }, transaction });
        await UserMunicipalityPermission.destroy({ where: { user_id: id }, transaction });

        await transaction.commit();
        return { success: true };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};