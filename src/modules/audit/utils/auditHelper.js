const auditService = require("../services/audit.service");

exports.handleModelAudit = async (instance, options, action) => {
    if (!options.req) return;

    // DETECTAR ELIMINACIÓN LÓGICA: 
    // Si Sequelize está disparando un UPDATE pero el campo de borrado cambió, 
    // abortamos esta ejecución para que solo se procese como DELETE.
    if (action === 'UPDATE' && instance.changed && (instance.changed('active') || instance.changed('deleted_at'))) {
        return; 
    }

    const moduleName = instance.constructor.name.toUpperCase();
    const sensitiveFields = ['password', 'token', 'secret'];
    const systemFields = ['createdAt', 'updatedAt', 'deletedAt', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'];
    
    const changes = {};

    if (action === 'UPDATE') {
        const changedFields = instance.changed();
        if (changedFields) {
            const { Cargo } = require("../../../database/associations");

            for (const field of changedFields) {
                if (systemFields.includes(field)) continue;
                
                if (sensitiveFields.includes(field)) {
                    changes[field] = { old: "[PROTEGIDO]", new: "[DATO_MODIFICADO]" };
                } 
                else if (field === 'cargo_id') {
                    const oldCargo = await Cargo.findByPk(instance.previous('cargo_id'), { attributes: ['nombre'] });
                    const newCargo = await Cargo.findByPk(instance.getDataValue('cargo_id'), { attributes: ['nombre'] });
                    changes['cargo'] = { 
                        old: oldCargo ? oldCargo.nombre : 'Sin cargo', 
                        new: newCargo ? newCargo.nombre : 'Sin cargo' 
                    };
                }
                else {
                    changes[field] = {
                        old: instance.previous(field),
                        new: instance.getDataValue(field)
                    };
                }
            }
        }
        
        if (options.manualChanges) {
            Object.assign(changes, options.manualChanges);
        }

        if (Object.keys(changes).length === 0 && !options.forceAudit) return;
    }

    let detailsData = {};
    if (action === 'CREATE') {
        const rawData = instance.toJSON();
        Object.keys(rawData).forEach(key => {
            if (systemFields.includes(key)) delete rawData[key];
            if (sensitiveFields.includes(key)) rawData[key] = "[PROTEGIDO]";
        });

        if (rawData.cargo_id) {
            const { Cargo } = require("../../../database/associations");
            const cargo = await Cargo.findByPk(rawData.cargo_id, { attributes: ['nombre'] });
            rawData.cargo = cargo ? cargo.nombre : null;
            delete rawData.cargo_id;
        }

        if (options.manualChanges && options.manualChanges.roles) {
            rawData.roles = options.manualChanges.roles.new;
        }

        detailsData = { data: rawData };
    } else {
        detailsData = { changes };
    }

    await auditService.createLog(options.req, {
        action: action,
        module: moduleName,
        entityId: instance.id,
        details: {
            ...detailsData,
            display_name: instance.nombre || instance.name || instance.username || null
        }
    });
};