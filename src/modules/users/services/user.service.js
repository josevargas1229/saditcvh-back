/**
 * SERVICIO: UserService
 * DESCRIPCIÓN: Gestión integral de identidades y administración de la matriz de acceso territorial.
 */
const sequelize = require("../../../config/db");
const { User, Role, Cargo, Permission, Municipio, UserMunicipalityPermission, UserRole} = require("../../../database/associations");
const auditService = require("../../audit/services/audit.service");
const { handleModelAudit } = require("../../audit/utils/auditHelper");
const bcrypt = require("bcryptjs");
const { Op, fn, col, where } = require("sequelize");

/**
 * Recupera el perfil y los municipios con acceso para el usuario actual.
 * Filtra únicamente municipios y permisos que estén marcados como activos.
 */
exports.getUserAccessTerritories = async (userId) => {
    // 1. Verificar si el usuario es administrador
    const user = await User.findByPk(userId, {
        include: [{ model: Role, as: 'roles', where: { id: 1 }, required: false }]
    });

    const isAdmin = user.roles && user.roles.length > 0;

    if (isAdmin) {
        // Retornar TODOS los municipios con TODOS los permisos activos
        const [municipios, permissions] = await Promise.all([
            Municipio.findAll({ where: { active: true }, attributes: ['id', 'num', 'nombre'], raw: true }),
            Permission.findAll({ where: { active: true }, attributes: ['name'], raw: true })
        ]);

        const allPermissionNames = permissions.map(p => p.name);
        
        return municipios.map(m => ({
            ...m,
            permisos: allPermissionNames
        }));
    }

    // 2. Si no es admin, ejecutar la lógica normal de la matriz
    const userAccess = await UserMunicipalityPermission.findAll({
        where: { user_id: userId, active: true },
        include: [
            { model: Municipio, as: 'municipio', where: { active: true }, attributes: ['id', 'num', 'nombre'] },
            { model: Permission, as: 'permission', where: { active: true }, attributes: ['id', 'name'] }
        ]
    });

    const territories = userAccess.reduce((acc, curr) => {
        const muniId = curr.municipio.id;
        if (!acc[muniId]) {
            acc[muniId] = { ...curr.municipio.toJSON(), permisos: [] };
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
    const user = await User.findByPk(id, {
        attributes: { exclude: ["password", "deleted_at"] },
        include: [
            { model: Cargo, as: 'cargo' },
            { model: Role, as: 'roles' }
        ]
    });

    if (!user) return null;

    const isAdmin = user.roles && user.roles.some(r => r.id === 1);

    if (isAdmin) {
        // Inyectamos la matriz completa virtualmente para el detalle del admin
        const [municipios, permissions] = await Promise.all([
            Municipio.findAll({ where: { active: true }, attributes: ['id', 'num', 'nombre'] }),
            Permission.findAll({ where: { active: true }, attributes: ['id', 'name'] })
        ]);

        const virtualAccess = [];
        municipios.forEach(m => {
            permissions.forEach(p => {
                virtualAccess.push({ municipio: m, permission: p });
            });
        });
        
        // Convertimos a JSON para poder manipular la propiedad
        const userJson = user.toJSON();
        userJson.municipality_access = virtualAccess;
        return userJson;
    }

    // Si no es admin, buscamos sus permisos reales en la base de datos
    const realAccess = await UserMunicipalityPermission.findAll({
        where: { user_id: id, active: true },
        include: [
            { model: Municipio, as: 'municipio', attributes: ['id', 'num', 'nombre'] },
            { model: Permission, as: 'permission', attributes: ['id', 'name'] }
        ]
    });

    const userJson = user.toJSON();
    userJson.municipality_access = realAccess;
    return userJson;
};

/**
 * Proceso transaccional de alta de usuario con propagación de matriz de acceso.
 */
exports.createUser = async (data, adminId, req) => {
    const transaction = await sequelize.transaction();
    try {
        if (data.password) data.password = await bcrypt.hash(data.password, 12);

        // 1. Crear usuario básico
        // req: null evita que el hook afterUpdate/Create se dispare prematuramente
        const newUser = await User.create({
            ...data,
            created_by: adminId,
            updated_by: adminId,
            active: true
        }, { transaction }); 

        // 2. Asignación de Roles
        let rolesNames = [];
        if (data.roles && data.roles.length > 0) {
            await newUser.setRoles(data.roles, { transaction });
            const roles = await Role.findAll({ 
                where: { id: data.roles }, 
                attributes: ['name'], 
                transaction 
            });
            rolesNames = roles.map(r => r.name);
        }

        // 3. Obtener nombre del Cargo para la auditoría
        let cargoNombre = 'Sin cargo';
        if (data.cargo_id) {
            const cargo = await Cargo.findByPk(data.cargo_id, { attributes: ['nombre'], transaction });
            cargoNombre = cargo ? cargo.nombre : 'Sin cargo';
        }

        await transaction.commit();

        // 4. Auditoría Manual: Enviamos todo lo que el Hook no ve (Roles y Nombres de FKs)
        await handleModelAudit(newUser, { 
            req, 
            manualChanges: { 
                roles: { new: rolesNames },
                cargo: { new: cargoNombre } 
            } 
        }, 'CREATE');

        return await this.getUserById(newUser.id);
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

/**
 * Actualiza la información del usuario y sincroniza la matriz de permisos según el cambio de rol.
 */
exports.updateUser = async (id, data, adminId, req) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id, { 
            transaction, 
            include: [{ model: Role, as: 'roles', attributes: ['id', 'name'] }] 
        });
        if (!user) throw new Error("Usuario no localizado.");

        const oldRolesIds = user.roles.map(r => r.id);
        const oldRolesNames = user.roles.map(r => r.name);
        const previousCargoId = user.cargo_id;
        let manualChanges = {};
        
        // INICIALIZAMOS EL FLAG (Por defecto false)
        let requiresPermissionCheck = false;

        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }
        
        await user.update({ ...data, updated_by: adminId }, { transaction, req: null });

        if (data.roles !== undefined) {
            const newRolesIds = data.roles.map(Number);
            const rolesChanged = JSON.stringify(oldRolesIds.sort()) !== JSON.stringify(newRolesIds.sort());

            if (rolesChanged) {
                await user.setRoles(data.roles, { transaction });
                
                // CÁLCULO DEL FLAG: ¿Era admin y ya no lo es?
                const wasAdmin = oldRolesIds.includes(1);
                const isNowAdmin = newRolesIds.includes(1);
                if (wasAdmin && !isNowAdmin) {
                    requiresPermissionCheck = true;
                }

                const newRoles = await Role.findAll({ 
                    where: { id: data.roles }, 
                    attributes: ['id', 'name'],
                    include: [{ model: Permission, as: 'base_permissions', attributes: ['id'] }],
                    transaction 
                });
                const newRolesNames = newRoles.map(r => r.name);
                manualChanges['roles'] = { old: oldRolesNames, new: newRolesNames };

                if (isNowAdmin) {
                    await UserMunicipalityPermission.update({ active: false }, { where: { user_id: id }, transaction });
                    await UserMunicipalityPermission.destroy({ where: { user_id: id }, transaction });
                } else {
                    const allowedPermissionIds = new Set();
                    newRoles.forEach(role => {
                        if (role.base_permissions) {
                            role.base_permissions.forEach(p => allowedPermissionIds.add(p.id));
                        }
                    });
                    allowedPermissionIds.delete(5); // Prohibido eliminar para no-admins

                    const destroyWhere = { 
                        user_id: id, 
                        permission_id: { [Op.notIn]: Array.from(allowedPermissionIds) } 
                    };

                    await UserMunicipalityPermission.update({ active: false }, { where: destroyWhere, transaction });
                    await UserMunicipalityPermission.destroy({ where: destroyWhere, transaction });
                }
            }
        }

        if (data.cargo_id !== undefined && data.cargo_id != previousCargoId) {
            const oldCargo = await Cargo.findByPk(previousCargoId, { attributes: ['nombre'], transaction });
            const newCargo = await Cargo.findByPk(data.cargo_id, { attributes: ['nombre'], transaction });
            manualChanges['cargo'] = { 
                old: oldCargo ? oldCargo.nombre : 'Sin cargo', 
                new: newCargo ? newCargo.nombre : 'Sin cargo' 
            };
        }

        // COMMIT PRIMERO
        await transaction.commit();

        // AUDITORÍA DESPUÉS (con manejo de error independiente para no romper la respuesta)
        try {
            await handleModelAudit(user, { 
                req, 
                manualChanges, 
                forceAudit: Object.keys(manualChanges).length > 0 
            }, 'UPDATE');
        } catch (auditErr) {
            console.error("Error en auditoría (no crítico):", auditErr);
        }

        const updatedUser = await this.getUserById(id);
        const userResponse = updatedUser.toJSON ? updatedUser.toJSON() : updatedUser;
        
        // Inyectamos el flag calculado
        userResponse.requires_permission_check = requiresPermissionCheck;

        return userResponse;
    } catch (error) {
        // Solo intentamos rollback si la transacción no ha terminado
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        throw error;
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
    // 1. Verificar si el usuario es administrador
    const user = await User.findByPk(userId, {
        include: [{ model: Role, as: 'roles', where: { id: 1 }, required: false }]
    });

    if (user.roles && user.roles.length > 0) {
        // Generar producto cartesiano de municipios x permisos en memoria
        const [municipios, permissions] = await Promise.all([
            Municipio.findAll({ where: { active: true }, attributes: ['id'], raw: true }),
            Permission.findAll({ where: { active: true }, attributes: ['id'], raw: true })
        ]);

        const fullMatrix = [];
        municipios.forEach(m => {
            permissions.forEach(p => {
                fullMatrix.push({ municipio_id: m.id, permission_id: p.id });
            });
        });
        return fullMatrix;
    }

    // 2. Si no es admin, consulta normal a la tabla física
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
        // CAMBIO: Guardar el estado activo antes de destruir para disparar hooks correctamente
        user.active = false;
        await user.save({ transaction, req }); 
        await user.destroy({ transaction, req }); // <--- Hook de DELETE

        // 2. Revocación lógica de Roles
        await UserRole.destroy({ where: { user_id: id }, transaction, req });

        // 3. Revocación lógica de Matriz de Permisos
        await UserMunicipalityPermission.update({ active: false }, { where: { user_id: id }, transaction });
        await UserMunicipalityPermission.destroy({ where: { user_id: id }, transaction });

        await transaction.commit();
        return { success: true };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};