const auditService = require("../services/audit.service");

/**
 * Helper para registrar cambios en modelos de forma estandarizada.
 * Detecta qué campos cambiaron y genera el log ofuscando datos sensibles.
 */
exports.handleModelAudit = async (instance, options, action) => {
    // Si no hay objeto 'req' en las opciones, no podemos auditar (falta contexto)
    if (!options.req) return;

    const changes = {};
    const module = instance.constructor.name.toUpperCase();
    
    // Lista de campos que queremos ocultar pero registrar que cambiaron
    const sensitiveFields = ['password', 'token', 'secret'];

    if (action === 'UPDATE') {
        const changedFields = instance.changed();
        
        if (changedFields) {
            changedFields.forEach(field => {
                // Ignoramos campos de sistema internos
                if (['updated_at', 'updated_by', 'created_at'].includes(field)) return;
                
                if (sensitiveFields.includes(field)) {
                    // Si es sensible, registramos que cambió pero ocultamos el valor
                    changes[field] = {
                        old: "[PROTEGIDO]",
                        new: "[DATO_MODIFICADO]"
                    };
                } else {
                    // Si es normal, registramos valor anterior y nuevo
                    changes[field] = {
                        old: instance.previous(field),
                        new: instance.getDataValue(field)
                    };
                }
            });
        }
        
        // Si no hubo cambios reales, no guardamos log
        if (Object.keys(changes).length === 0) return;
    }

    // Para el caso de CREATE, también limpiamos la instancia que va a details
    let detailsData = {};
    if (action === 'CREATE') {
        const rawData = instance.toJSON();
        sensitiveFields.forEach(f => {
            if (rawData[f]) rawData[f] = "[PROTEGIDO]";
        });
        detailsData = { data: rawData };
    } else {
        detailsData = { changes };
    }

    await auditService.createLog(options.req, {
        action: action,
        module: module,
        entityId: instance.id,
        details: {
            ...detailsData,
            display_name: instance.nombre || instance.name || instance.username || null
        }
    });
};