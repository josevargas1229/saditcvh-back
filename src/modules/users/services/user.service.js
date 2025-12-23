const sequelize = require("../../../config/db");
const { User, Role, Cargo, Permission, RolePermission, Municipio, UserMunicipalityPermission } = require("../../../database/associations");
const bcrypt = require("bcryptjs");
const { Op, fn, col, where } = require("sequelize");


exports.getAllUsers = async (query) => {
    // --------------------
    // Paginación
    // --------------------
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const offset = (page - 1) * limit;

    // --------------------
    // Filtros
    // --------------------
    const whereUser = {};

    if (query.active !== undefined) {
        whereUser.active = query.active === "true";
    }

    if (query.cargo_id) {
        whereUser.cargo_id = query.cargo_id;
    }

    // --------------------
    // Búsqueda
    // --------------------
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

    // --------------------
    // Ordenamiento
    // --------------------
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

    // --------------------
    // Query final
    // --------------------
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

exports.createUser = async (data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        // 1. Validar mínimo un municipio
        if (!data.municipios || data.municipios.length === 0) {
            throw new Error("Debe asignar al menos un municipio al usuario");
        }

        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }

        // 2. Crear usuario
        const newUser = await User.create({
            ...data,
            created_by: adminId,
            updated_by: adminId
        }, { transaction });

        // 3. Asignar Roles
        if (data.roles && data.roles.length > 0) {
            await newUser.setRoles(data.roles, { transaction });

            // 4. LÓGICA DE PERMISOS POR MUNICIPIO
            // Obtenemos los permisos base de los roles asignados
            const rolesWithPermissions = await Role.findAll({
                where: { id: data.roles },
                include: [{ model: Permission, as: 'base_permissions' }]
            });

            // Extraemos solo los IDs únicos de permisos
            const permissionIds = new Set();
            rolesWithPermissions.forEach(role => {
                role.base_permissions.forEach(p => permissionIds.add(p.id));
            });

            // Creamos la matriz: Para cada municipio X cada permiso del rol
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

            if (bulkPermissions.length > 0) {
                await UserMunicipalityPermission.bulkCreate(bulkPermissions, { transaction });
            }
        }

        await transaction.commit();
        return await this.getUserById(newUser.id);

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

exports.updateUser = async (id, data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id);
        if (!user) throw new Error("Usuario no encontrado");

        if (data.password) {
            data.password = await bcrypt.hash(data.password, 12);
        }

        await user.update({ ...data, updated_by: adminId }, { transaction });

        // Si se envían roles o municipios nuevos, recalculamos la matriz
        // Nota: En un sistema real, podrías querer algo más fino, pero para empezar
        // vamos a resetear y recrear si se envían estos datos.
        if (data.roles || data.municipios) {
            // Borrar permisos actuales que NO sean excepciones manuales
            await UserMunicipalityPermission.destroy({ 
                where: { user_id: id, is_exception: false }, 
                transaction 
            });

            if (data.roles) await user.setRoles(data.roles, { transaction });

            const currentRoles = data.roles || (await user.getRoles()).map(r => r.id);
            const currentMunis = data.municipios || []; // Aquí deberías traer los existentes si no se envían

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

exports.deleteUser = async (id) => {
    const user = await User.findByPk(id);
    if (!user) throw new Error("Usuario no encontrado");
    return await user.destroy();
};

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