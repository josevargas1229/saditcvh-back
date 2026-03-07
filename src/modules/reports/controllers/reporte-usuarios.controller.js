// reportes/controllers/reporte-usuarios.controller.js
const PDFDocument = require("pdfkit");
const UsersReportService = require("../services/users.service");
const fs = require("fs");
const path = require("path");

class UsersReportController {
  // GENERAR REPORTE DE USUARIOS EN PDF
  async generarReporteUsuariosPDF(req, res) {
    let doc = null;

    try {
      const filters = {
        role_id: req.query.role_id,
        active:
          req.query.active !== undefined
            ? req.query.active === "true"
            : undefined,
        search: req.query.search,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        limit: req.query.limit || 100,
        offset: req.query.offset || 0,
        include_permissions: true,
      };

      // Obtener datos del servicio
      const report = await UsersReportService.getUsersReport(filters);

      if (!report.success || !report.data || report.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No se encontraron usuarios para generar el reporte",
          data: [],
        });
      }

      doc = new PDFDocument({
        size: "A4",
        margin: 40,
        info: {
          Title: "Reporte de Usuarios - STCH",
          Author: "Sistema de Gestión Documental STCH",
          Subject:
            "Reporte completo de usuarios, roles y permisos por municipio",
          Keywords:
            "STCH, usuarios, reporte, permisos, municipios, roles, detallado",
        },
      });

      // Configurar headers para descarga
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="reporte_detallado_usuarios_stch_${Date.now()}.pdf"`,
      );

      doc.pipe(res);

      // Colores institucionales
      const colors = {
        primary: "#8B1E3F",
        secondary: "#D4AF37",
        lightBg: "#F8F0F3",
        darkText: "#2D3748",
        lightText: "#4A5568",
        success: "#38A169",
        danger: "#E53E3E",
        info: "#3182CE",
        warning: "#DD6B20",
        purple: "#9F7AEA",
        gray: "#718096",
        lightGray: "#E2E8F0",
        white: "#FFFFFF",
      };

      // ==============================================
      // ENCABEZADO OFICIAL
      // ==============================================

      doc.rect(0, 0, doc.page.width, 130).fill(colors.primary);

      // Logo
      const escudoPath = path.join(
        __dirname,
        "../../../../src/public/images/escudo_hidalgo.png",
      );
      if (fs.existsSync(escudoPath)) {
        try {
          doc.image(escudoPath, 40, 25, { width: 70, height: 70 });
        } catch (err) {}
      }

      doc
        .fontSize(18)
        .fillColor(colors.white)
        .font("Helvetica-Bold")
        .text("SISTEMA DE TRANSPORTE", 0, 35, {
          align: "center",
          width: doc.page.width,
        });

      doc
        .fontSize(18)
        .fillColor(colors.white)
        .font("Helvetica-Bold")
        .text("CONVENCIONAL DE HIDALGO", 0, 55, {
          align: "center",
          width: doc.page.width,
        });

      doc
        .fontSize(14)
        .fillColor(colors.secondary)
        .font("Helvetica-Bold")
        .text("MOVILIDAD", 0, 80, { align: "center", width: doc.page.width });

      doc
        .fontSize(11)
        .fillColor(colors.white)
        .font("Helvetica")
        .text("Estado Libre y Soberano de Hidalgo", 0, 100, {
          align: "center",
          width: doc.page.width,
        });

      doc
        .fontSize(9)
        .fillColor(colors.secondary)
        .font("Helvetica-Bold")
        .text("PRIMERO EL PUEBLO", 0, 115, {
          align: "center",
          width: doc.page.width,
        });

      doc
        .moveTo(40, 125)
        .lineTo(doc.page.width - 40, 125)
        .lineWidth(2)
        .stroke(colors.secondary);

      doc.y = 150;

      // ==============================================
      // TÍTULO DEL REPORTE
      // ==============================================

      doc
        .fontSize(20)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text("REPORTE DETALLADO DE USUARIOS", { align: "center" });

      doc
        .fontSize(12)
        .fillColor(colors.lightText)
        .font("Helvetica")
        .text("Sistema de Gestión Documental STCH", { align: "center" });

      doc.moveDown(1);

      doc
        .fontSize(10)
        .fillColor(colors.gray)
        .font("Helvetica")
        .text(
          `Número de referencia: STCH-USR-DET-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${Date.now().toString().slice(-4)}`,
          { align: "center" },
        );

      doc.text(
        `Fecha de generación: ${new Date().toLocaleDateString("es-ES", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
        { align: "center" },
      );

      const periodoText =
        filters.start_date || filters.end_date
          ? `Período: ${filters.start_date ? new Date(filters.start_date).toLocaleDateString("es-ES") : "Inicio"} - ${filters.end_date ? new Date(filters.end_date).toLocaleDateString("es-ES") : "Actual"}`
          : "Período: Completo";

      doc.text(periodoText, { align: "center" });

      doc.moveDown(2);
      doc
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .lineWidth(0.8)
        .stroke(colors.lightGray);
      doc.moveDown(1.5);

      // ==============================================
      // ESTADÍSTICAS DEL REPORTE
      // ==============================================

      doc
        .fontSize(16)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text("I. RESUMEN ESTADÍSTICO", 40, doc.y);

      doc
        .moveTo(40, doc.y + 3)
        .lineTo(350, doc.y + 3)
        .lineWidth(2)
        .stroke(colors.secondary);

      doc.moveDown(1.5);

      const statsY = doc.y;
      const cardWidth = 110;
      const cardHeight = 45;
      const gap = 15;

      const usuariosConRol = report.metadata?.total_users_with_role || 0;
      const usuariosActivos = report.metadata?.active || 0;
      const usuariosInactivos = report.metadata?.inactive || 0;

      // Tarjeta 1: Usuarios con rol
      doc
        .rect(40, statsY, cardWidth, cardHeight)
        .fill(colors.lightBg)
        .stroke(colors.primary);

      doc
        .fontSize(22)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text(usuariosConRol.toString(), 55, statsY + 8);

      doc
        .fontSize(9)
        .fillColor(colors.darkText)
        .font("Helvetica-Bold")
        .text("USUARIOS CON ROL", 55, statsY + 33, { width: cardWidth - 30 });

      // Tarjeta 2: Usuarios activos
      doc
        .rect(40 + cardWidth + gap, statsY, cardWidth, cardHeight)
        .fill("#F0FFF4")
        .stroke(colors.success);

      doc
        .fontSize(22)
        .fillColor(colors.success)
        .font("Helvetica-Bold")
        .text(usuariosActivos.toString(), 55 + cardWidth + gap, statsY + 8);

      doc
        .fontSize(9)
        .fillColor(colors.darkText)
        .font("Helvetica-Bold")
        .text("USUARIOS ACTIVOS", 55 + cardWidth + gap, statsY + 33, {
          width: cardWidth - 30,
        });

      // Tarjeta 3: Usuarios inactivos
      doc
        .rect(40 + cardWidth * 2 + gap * 2, statsY, cardWidth, cardHeight)
        .fill("#FFF5F5")
        .stroke(colors.danger);

      doc
        .fontSize(22)
        .fillColor(colors.danger)
        .font("Helvetica-Bold")
        .text(
          usuariosInactivos.toString(),
          55 + cardWidth * 2 + gap * 2,
          statsY + 8,
        );

      doc
        .fontSize(9)
        .fillColor(colors.darkText)
        .font("Helvetica-Bold")
        .text("USUARIOS INACTIVOS", 55 + cardWidth * 2 + gap * 2, statsY + 33, {
          width: cardWidth - 30,
        });

      doc.y = statsY + cardHeight + 25;

      // Distribución por roles
      if (
        report.metadata?.roles_distribution &&
        report.metadata.roles_distribution.length > 0
      ) {
        doc
          .fontSize(12)
          .fillColor(colors.primary)
          .font("Helvetica-Bold")
          .text("Distribución por Roles:", 40, doc.y);

        doc.moveDown(0.8);

        const rolesStartY = doc.y;
        const roleBarWidth = 250;
        const maxUsers = Math.max(
          ...report.metadata.roles_distribution.map((r) => r.user_count || 0),
        );

        report.metadata.roles_distribution.forEach((role, index) => {
          const y = rolesStartY + index * 18;
          const userCount = role.user_count || 0;
          const percentage =
            usuariosConRol > 0 ? (userCount / usuariosConRol) * 100 : 0;
          const barLength =
            maxUsers > 0 ? (userCount / maxUsers) * roleBarWidth : 0;

          doc
            .fontSize(9)
            .fillColor(colors.darkText)
            .font("Helvetica-Bold")
            .text(
              role.role_name
                ? role.role_name.charAt(0).toUpperCase() +
                    role.role_name.slice(1)
                : "Sin rol",
              40,
              y,
              { width: 80 },
            );

          const barColors = [
            colors.primary,
            colors.info,
            colors.secondary,
            "#9F7AEA",
          ];
          doc
            .rect(130, y + 3, barLength, 10)
            .fill(barColors[index % barColors.length]);

          doc
            .fontSize(9)
            .fillColor(colors.lightText)
            .font("Helvetica")
            .text(`${userCount} (${percentage.toFixed(1)}%)`, 395, y, {
              width: 80,
              align: "right",
            });
        });

        doc.y =
          rolesStartY + report.metadata.roles_distribution.length * 18 + 20;
      }

      doc.moveDown(1.5);
      doc
        .moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .lineWidth(0.8)
        .stroke(colors.lightGray);
      doc.moveDown(1.5);

      // ==============================================
      // RESUMEN GENERAL DE USUARIOS - TODOS LOS USUARIOS
      // ==============================================

      if (doc.y > 550) {
        doc.addPage();
        doc.y = 40;
      }

      doc
        .fontSize(16)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text("II. RESUMEN GENERAL DE USUARIOS", 40, doc.y);

      doc
        .moveTo(40, doc.y + 3)
        .lineTo(350, doc.y + 3)
        .lineWidth(2)
        .stroke(colors.secondary);

      doc.moveDown(2);

      const headers = [
        "#",
        "Usuario",
        "Nombre",
        "Email",
        "Rol Principal",
        "Estado",
        "Permisos",
      ];
      const colWidths = [25, 70, 90, 140, 80, 60, 60];
      const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);

      // Función para dibujar encabezado
      const dibujarEncabezadoTabla = (yPos) => {
        doc
          .rect(40, yPos, totalTableWidth, 28)
          .fill(colors.primary)
          .stroke(colors.primary);

        let currentX = 40;
        headers.forEach((header, index) => {
          const width = colWidths[index];

          doc
            .fontSize(9)
            .fillColor(colors.white)
            .font("Helvetica-Bold")
            .text(header, currentX + 3, yPos + 9, {
              width: width - 6,
              align: "center",
            });

          currentX += width;
        });

        return yPos + 28;
      };

      let tableStartY = doc.y;
      let currentRowIndex = 0;
      let pageNumber = 1;

      // Dibujar primer encabezado
      tableStartY = dibujarEncabezadoTabla(tableStartY);

      // Procesar usuarios
      for (let userIndex = 0; userIndex < report.data.length; userIndex++) {
        const user = report.data[userIndex];

        // Calcular posición Y
        let rowY = tableStartY + currentRowIndex * 26;

        // Verificar si necesitamos nueva página (dejando espacio para al menos 3 filas más)
        if (rowY + 80 > doc.page.height - 100) {
          // 80 = 26*3 + margen
          doc.addPage();
          doc.y = 40;
          pageNumber++;

          // Título en página nueva
          if (pageNumber > 1) {
            doc
              .fontSize(16)
              .fillColor(colors.primary)
              .font("Helvetica-Bold")
              .text(
                `II. RESUMEN GENERAL DE USUARIOS (Continuación)`,
                40,
                doc.y,
              );

            doc
              .moveTo(40, doc.y + 3)
              .lineTo(420, doc.y + 3)
              .lineWidth(2)
              .stroke(colors.secondary);

            doc.moveDown(2);
          }

          // Dibujar encabezado en nueva página
          tableStartY = doc.y;
          tableStartY = dibujarEncabezadoTabla(tableStartY);
          rowY = tableStartY;
          currentRowIndex = 0;
        }

        // Calcular posición Y actual
        const actualRowY = tableStartY + currentRowIndex * 26;

        // Fondo alternado
        const rowBgColor =
          currentRowIndex % 2 === 0 ? colors.white : colors.lightBg;
        doc.rect(40, actualRowY, totalTableWidth, 26).fill(rowBgColor);

        // Número global
        doc
          .fontSize(9)
          .fillColor(colors.darkText)
          .font("Helvetica")
          .text((userIndex + 1).toString(), 45, actualRowY + 8, {
            width: 15,
            align: "center",
          });

        // Usuario
        const username = user.username || "N/A";
        const usernameDisplay =
          username.length > 10 ? username.substring(0, 10) + "..." : username;
        doc
          .fontSize(8)
          .fillColor(colors.primary)
          .font("Helvetica-Bold")
          .text(usernameDisplay, 75, actualRowY + 8, { width: 60 });

        // Nombre
        const nombre = user.full_name || "N/A";
        const nombreDisplay =
          nombre.length > 15 ? nombre.substring(0, 15) + "..." : nombre;
        doc
          .fontSize(8)
          .fillColor(colors.darkText)
          .font("Helvetica")
          .text(nombreDisplay, 150, actualRowY + 8, { width: 80 });

        // Email
        const email = user.email || "N/A";
        const emailDisplay =
          email.length > 22 ? email.substring(0, 22) + "..." : email;
        doc
          .fontSize(7)
          .fillColor(colors.lightText)
          .font("Helvetica")
          .text(emailDisplay, 245, actualRowY + 8, { width: 125 });

        // Rol
        const roleText =
          user.main_role && user.main_role !== "Sin rol asignado"
            ? user.main_role.charAt(0).toUpperCase() + user.main_role.slice(1)
            : "No asignado";
        const roleColor =
          user.main_role === "administrador"
            ? colors.primary
            : user.main_role === "operador"
              ? colors.info
              : user.main_role === "consulta"
                ? colors.success
                : colors.gray;
        doc
          .fontSize(8)
          .fillColor(roleColor)
          .font("Helvetica-Bold")
          .text(roleText, 375, actualRowY + 8, { width: 70, align: "center" });

        // Estado
        const estadoText = user.status || "Inactivo";
        const estadoColor =
          user.status === "Activo" ? colors.success : colors.danger;
        doc
          .fontSize(8)
          .fillColor(estadoColor)
          .font("Helvetica-Bold")
          .text(estadoText, 460, actualRowY + 8, {
            width: 50,
            align: "center",
          });

        // Permisos
        const permText =
          user.total_permissions !== undefined
            ? user.total_permissions.toString()
            : "0";
        const permColor =
          user.total_permissions > 0 ? colors.purple : colors.gray;

        doc
          .fontSize(8)
          .fillColor(permColor)
          .font("Helvetica-Bold")
          .text(permText, 525, actualRowY + 8, { width: 55, align: "center" });

        // Borde inferior
        doc
          .moveTo(40, actualRowY + 26)
          .lineTo(40 + totalTableWidth, actualRowY + 26)
          .lineWidth(0.5)
          .stroke(colors.lightGray);

        currentRowIndex++;
      }

      // Borde exterior
      const tableHeight = 28 + currentRowIndex * 26;
      doc
        .rect(40, tableStartY - 28, totalTableWidth, tableHeight)
        .stroke(colors.primary);

      doc.y = tableStartY + currentRowIndex * 26 + 25;

      // ==============================================
      // DETALLE COMPLETO POR USUARIO - CORREGIDO (ALINEACIÓN HORIZONTAL)
      // ==============================================

      // Verificar si hay suficiente espacio para al menos el título y un usuario básico
      if (doc.y > 600) {
        doc.addPage();
        doc.y = 40;
      }

      doc
        .fontSize(16)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text("III. DETALLE COMPLETO POR USUARIO", 40, doc.y);

      doc
        .moveTo(40, doc.y + 3)
        .lineTo(380, doc.y + 3)
        .lineWidth(2)
        .stroke(colors.secondary);

      doc.y += 15;

      // Generar sección detallada para cada usuario
      report.data.forEach((user, userIndex) => {
        // Verificar espacio
        if (doc.y > 680) {
          doc.addPage();
          doc.y = 40;
        }

        // Título del usuario
        doc
          .fontSize(13)
          .fillColor(colors.primary)
          .font("Helvetica-Bold")
          .text(
            `${userIndex + 1}. ${user.username || "Usuario sin nombre"}`,
            40,
            doc.y,
          );

        doc
          .moveTo(40, doc.y + 3)
          .lineTo(250, doc.y + 3)
          .lineWidth(1)
          .stroke(colors.secondary);

        doc.y += 10;

        // Información básica en formato de tarjetas - CORREGIDO: Misma posición Y para ambas
        let cardsStartY = doc.y; // Guardar posición Y para ambas tarjetas
        const infoCardWidth = (doc.page.width - 100) / 2;
        const infoCardHeight = 85;

        // Verificar espacio para tarjetas
        if (cardsStartY + infoCardHeight + 60 > doc.page.height - 100) {
          doc.addPage();
          doc.y = 40;

          doc
            .fontSize(13)
            .fillColor(colors.primary)
            .font("Helvetica-Bold")
            .text(
              `${userIndex + 1}. ${user.username || "Usuario sin nombre"}`,
              40,
              doc.y,
            );

          doc
            .moveTo(40, doc.y + 3)
            .lineTo(250, doc.y + 3)
            .lineWidth(1)
            .stroke(colors.secondary);

          doc.y += 10;
          cardsStartY = doc.y; // Actualizar posición
        }

        // Tarjeta 1: Información personal - Usar cardsStartY para alineación
        doc
          .rect(40, cardsStartY, infoCardWidth, infoCardHeight)
          .fill(colors.lightBg)
          .stroke(colors.primary);

        // Título tarjeta 1
        doc
          .fontSize(9)
          .fillColor(colors.primary)
          .font("Helvetica-Bold")
          .text("INFORMACIÓN PERSONAL", 50, cardsStartY + 8);

        // Líneas de información con espaciado fijo
        doc.fontSize(8).fillColor(colors.darkText).font("Helvetica");

        // Nombre - línea 1
        doc.text(
          `Nombre: ${user.full_name || "No disponible"}`,
          50,
          cardsStartY + 20,
        );

        // Email - línea 2
        doc.text(
          `Email: ${user.email || "No disponible"}`,
          50,
          cardsStartY + 30,
        );

        // Usuario - línea 3
        doc.text(
          `Usuario: ${user.username || "No disponible"}`,
          50,
          cardsStartY + 40,
        );

        // Teléfono o fecha creación - línea 4
        if (user.phone && user.phone !== "No registrado") {
          doc.text(`Teléfono: ${user.phone}`, 50, cardsStartY + 50);
        } else if (user.created_at) {
          doc
            .fontSize(7)
            .fillColor(colors.gray)
            .text(
              `Creado: ${new Date(user.created_at).toLocaleDateString("es-ES")}`,
              50,
              cardsStartY + 50,
            );
        }

        // Línea 5 opcional (espacio disponible)
        if (user.created_at && user.phone && user.phone !== "No registrado") {
          doc
            .fontSize(7)
            .fillColor(colors.gray)
            .text(
              `Creado: ${new Date(user.created_at).toLocaleDateString("es-ES")}`,
              50,
              cardsStartY + 60,
            );
        }

        // Tarjeta 2: Información del sistema - CORREGIDO: Usar cardsStartY para alineación horizontal
        const card2X = 40 + infoCardWidth + 20;

        doc
          .rect(card2X, cardsStartY, infoCardWidth, infoCardHeight)
          .fill("#F0F9FF")
          .stroke(colors.info);

        // Título tarjeta 2
        doc
          .fontSize(9)
          .fillColor(colors.info)
          .font("Helvetica-Bold")
          .text("INFORMACIÓN DEL SISTEMA", card2X + 10, cardsStartY + 8);

        // Estado - línea 1
        const estadoColor =
          user.status === "Activo" ? colors.success : colors.danger;
        doc
          .fontSize(8)
          .fillColor(estadoColor)
          .font("Helvetica-Bold")
          .text(
            `Estado: ${user.status || "Inactivo"}`,
            card2X + 10,
            cardsStartY + 20,
          );

        // Rol - línea 2
        const roleColor =
          user.main_role === "administrador"
            ? colors.primary
            : user.main_role === "operador"
              ? colors.info
              : user.main_role === "consulta"
                ? colors.success
                : colors.gray;
        const roleDisplay =
          user.main_role && user.main_role !== "Sin rol asignado"
            ? user.main_role.charAt(0).toUpperCase() + user.main_role.slice(1)
            : "No asignado";
        doc
          .fontSize(8)
          .fillColor(roleColor)
          .font("Helvetica-Bold")
          .text(`Rol: ${roleDisplay}`, card2X + 10, cardsStartY + 30);

        // Permisos - línea 3
        const permColor =
          user.total_permissions > 0 ? colors.purple : colors.gray;
        doc
          .fontSize(8)
          .fillColor(permColor)
          .font("Helvetica-Bold")
          .text(
            `Permisos: ${user.total_permissions || 0}`,
            card2X + 10,
            cardsStartY + 40,
          );

        // Fecha creación - línea 4
        if (user.created_at) {
          doc
            .fontSize(7)
            .fillColor(colors.darkText)
            .font("Helvetica")
            .text(
              `Creado: ${new Date(user.created_at).toLocaleDateString("es-ES")}`,
              card2X + 10,
              cardsStartY + 50,
            );
        }

        // Fecha actualización - línea 5 (si aplica)
        if (user.updated_at && user.updated_at !== user.created_at) {
          doc
            .fontSize(7)
            .fillColor(colors.gray)
            .font("Helvetica")
            .text(
              `Actualizado: ${new Date(user.updated_at).toLocaleDateString("es-ES")}`,
              card2X + 10,
              cardsStartY + 60,
            );
        }

        // Mover posición Y para siguiente contenido (después de ambas tarjetas)
        doc.y = cardsStartY + infoCardHeight + 12;

        // Resto del código permanece igual...
        // En la sección "Permisos asignados:" reemplaza este código:

        // SECCIÓN DE PERMISOS DE MUNICIPIOS
        if (user.permissions && user.permissions.length > 0) {
          // Verificar espacio para título de permisos
          if (doc.y + 30 > doc.page.height - 100) {
            doc.addPage();
            doc.y = 40;
          }

          // Título permisos
          doc
            .fontSize(11)
            .fillColor(colors.primary)
            .font("Helvetica-Bold")
            .text("Permisos asignados:", 40, doc.y);

          let currentY = doc.y + 10;

          // Agrupar permisos por municipio
          const permisosPorMunicipio = {};
          user.permissions.forEach((perm) => {
            const municipioNombre =
              perm.municipio_nombre || `Municipio ${perm.municipio_id}`;
            if (!permisosPorMunicipio[municipioNombre]) {
              permisosPorMunicipio[municipioNombre] = new Set(); // Usar Set para evitar duplicados
            }
            const permNameSpanish = traducirPermiso(perm.permission_name);
            if (permNameSpanish) {
              permisosPorMunicipio[municipioNombre].add(permNameSpanish);
            }
          });

          // Función para traducir permisos
          function traducirPermiso(permName) {
            if (!permName) return null;

            const traducciones = {
              view: "ver",
              ver: "ver",
              download: "descargar",
              descargar: "descargar",
              print: "subir",
              subir: "subir",
              edit: "editar",
              editar: "editar",
              delete: "eliminar",
              eliminar: "eliminar",
              concesion: "concesión",
              concesión: "concesión",
              permiso: "permiso",
            };

            return traducciones[permName.toLowerCase()] || permName;
          }

          // Obtener municipios ordenados
          const municipios = Object.keys(permisosPorMunicipio).sort((a, b) =>
            a.localeCompare(b, "es", { sensitivity: "base" }),
          );

          // Configurar tabla de permisos
          const municipioWidth = 90; // Ancho para cada columna de municipio
          const maxMunicipiosPorFila = 5; // Máximo municipios por fila
          const lineHeight = 9; // Altura de cada línea
          const paddingTop = 3; // Espacio arriba del municipio

          // Dividir municipios en filas
          for (let i = 0; i < municipios.length; i += maxMunicipiosPorFila) {
            const municipiosFila = municipios.slice(
              i,
              i + maxMunicipiosPorFila,
            );

            // Verificar espacio para esta fila
            const maxPermisosEnFila = Math.max(
              ...municipiosFila.map(
                (m) => Array.from(permisosPorMunicipio[m]).length,
              ),
            );
            const alturaFila =
              (maxPermisosEnFila + 1) * lineHeight + paddingTop + 5; // +1 para nombre municipio

            if (currentY + alturaFila > doc.page.height - 100) {
              doc.addPage();
              doc.y = 40;
              currentY = doc.y + 10;

              // Retitular en nueva página
              doc
                .fontSize(11)
                .fillColor(colors.primary)
                .font("Helvetica-Bold")
                .text("Permisos asignados (continuación):", 40, doc.y);

              currentY = doc.y + 10;
            }

            // Dibujar línea divisoria de fila
            doc
              .moveTo(40, currentY - 2)
              .lineTo(doc.page.width - 40, currentY - 2)
              .lineWidth(0.3)
              .stroke(colors.lightGray);

            // Dibujar nombres de municipios en la fila
            municipiosFila.forEach((municipio, colIndex) => {
              const xPos = 40 + colIndex * municipioWidth;

              // Nombre del municipio (truncar si es muy largo)
              const nombreMostrar =
                municipio.length > 15
                  ? municipio.substring(0, 15) + "..."
                  : municipio;

              doc
                .fontSize(9)
                .fillColor(colors.primary)
                .font("Helvetica-Bold")
                .text(nombreMostrar, xPos, currentY + paddingTop, {
                  width: municipioWidth - 5,
                  ellipsis: true,
                });

              // Listar permisos debajo de cada municipio
              const permisos = Array.from(
                permisosPorMunicipio[municipio],
              ).sort();
              permisos.forEach((perm, permIndex) => {
                const permY =
                  currentY + paddingTop + lineHeight + permIndex * lineHeight;

                doc
                  .fontSize(8)
                  .fillColor(colors.lightText)
                  .font("Helvetica")
                  .text(`• ${perm}`, xPos + 2, permY, {
                    width: municipioWidth - 10,
                  });
              });
            });

            // Actualizar posición Y para siguiente fila
            currentY += alturaFila + 5;
          }

          doc.y = currentY;
        } else {
          // Sin permisos
          if (doc.y + 15 > doc.page.height - 100) {
            doc.addPage();
            doc.y = 40;
          }

          doc
            .fontSize(9)
            .fillColor(colors.gray)
            .font("Helvetica")
            .text("Sin permisos de municipio asignados.", 40, doc.y);

          doc.y += 12;
        }

        // Línea divisoria entre usuarios
        if (userIndex < report.data.length - 1) {
          if (doc.y + 15 > doc.page.height - 100) {
            doc.addPage();
            doc.y = 40;
          } else {
            doc.y += 5;
            doc
              .moveTo(40, doc.y)
              .lineTo(doc.page.width - 40, doc.y)
              .lineWidth(0.5)
              .stroke(colors.lightGray);
            doc.y += 8;
          }
        }
      });

      // ==============================================
      // OBSERVACIONES FINALES
      // ==============================================

      if (doc.y > 500) {
        doc.addPage();
        doc.y = 40;
      } else {
        doc.moveDown(2);
      }

      doc
        .fontSize(16)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text("IV. OBSERVACIONES Y CONCLUSIONES", 40, doc.y);

      doc
        .moveTo(40, doc.y + 3)
        .lineTo(400, doc.y + 3)
        .lineWidth(2)
        .stroke(colors.secondary);

      doc.moveDown(1.5);

      const totalUsuariosTodos = report.metadata?.total_users || 0;
      const totalUsuariosConRol = report.metadata?.total_users_with_role || 0;
      const totalUsuariosSinRol =
        report.metadata?.total_users_without_role || 0;

      const activePercentage =
        totalUsuariosTodos > 0
          ? ((usuariosActivos / totalUsuariosTodos) * 100).toFixed(1)
          : 0;
      const inactivePercentage =
        totalUsuariosTodos > 0
          ? ((usuariosInactivos / totalUsuariosTodos) * 100).toFixed(1)
          : 0;

      const usuariosConPermisos = report.data.filter(
        (u) => u.total_permissions > 0,
      ).length;
      const usuariosAdministradores = report.data.filter(
        (u) => u.main_role === "administrador",
      ).length;
      const totalPermisosAsignados = report.data.reduce(
        (sum, user) => sum + (user.total_permissions || 0),
        0,
      );
      const totalExcepciones = report.data.reduce(
        (sum, user) =>
          sum +
          ((user.permissions_stats && user.permissions_stats.exceptions) || 0),
        0,
      );
      const totalMunicipiosUnicos = [
        ...new Set(
          report.data.flatMap((u) =>
            u.permissions ? u.permissions.map((p) => p.municipio_id) : [],
          ),
        ),
      ].length;

      const observaciones = [
        `1. Total de usuarios en el sistema: ${totalUsuariosTodos}`,
        `2. Usuarios activos: ${usuariosActivos} (${activePercentage}%)`,
        `3. Usuarios inactivos: ${usuariosInactivos} (${inactivePercentage}%)`,
        `4. Usuarios con rol asignado: ${totalUsuariosConRol}`,
        `5. Usuarios sin rol asignado: ${totalUsuariosSinRol}`,
        `6. Distribución por roles: ${report.metadata?.roles_distribution?.map((r) => `${r.role_name}: ${r.user_count}`).join(", ") || "No disponible"}`,
        `7. Usuarios con permisos específicos: ${usuariosConPermisos} (${((usuariosConPermisos / totalUsuariosTodos) * 100).toFixed(1)}%)`,
        `8. Usuarios administradores: ${usuariosAdministradores}`,
        `9. Total de permisos asignados en el sistema: ${totalPermisosAsignados}`,
        `10. Total de excepciones en permisos: ${totalExcepciones}`,
        `11. Municipios únicos con permisos asignados: ${totalMunicipiosUnicos}`,
        `12. Promedio de permisos por usuario: ${totalUsuariosTodos > 0 ? (totalPermisosAsignados / totalUsuariosTodos).toFixed(1) : "0.0"}`,
        `13. Fecha de corte del reporte: ${new Date().toLocaleDateString("es-ES")}`,
        `14. Filtros aplicados: ${
          Object.keys(filters)
            .filter(
              (k) =>
                filters[k] !== undefined &&
                filters[k] !== "" &&
                k !== "limit" &&
                k !== "offset" &&
                k !== "include_permissions",
            )
            .map((k) => `${k}: ${filters[k]}`)
            .join(", ") || "Ninguno"
        }`,
      ];

      observaciones.forEach((obs) => {
        doc
          .fontSize(9)
          .fillColor(colors.darkText)
          .font("Helvetica")
          .text(obs, 50, doc.y, {
            width: 500,
            indent: 10,
            paragraphGap: 6,
          });
      });

      // Pie de página
      const minFooterY = doc.page.height - 90;
      if (doc.y < minFooterY) {
        doc.y = minFooterY;
      }

      const footerY = doc.page.height - 80;
      doc
        .moveTo(40, footerY)
        .lineTo(doc.page.width - 40, footerY)
        .lineWidth(1)
        .stroke(colors.secondary);

      doc
        .fontSize(8)
        .fillColor(colors.primary)
        .font("Helvetica-Bold")
        .text("SISTEMA DE TRANSPORTE CONVENCIONAL DE HIDALGO", 40, footerY + 5);

      doc
        .fontSize(7)
        .fillColor(colors.darkText)
        .font("Helvetica")
        .text(
          "MOVILIDAD - SECRETARÍA DE MOVILIDAD Y TRANSPORTE",
          40,
          footerY + 17,
        );

      doc
        .fontSize(7)
        .fillColor(colors.lightText)
        .font("Helvetica")
        .text(
          "Estado Libre y Soberano de Hidalgo - PRIMERO EL PUEBLO",
          40,
          footerY + 29,
        );

      const docInfoX = doc.page.width - 220;
      const docNumber = `STCH-USR-DET-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

      doc
        .fontSize(7)
        .fillColor(colors.gray)
        .text(`Documento: ${docNumber}`, docInfoX, footerY + 5, {
          width: 180,
          align: "right",
        });

      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-ES")} ${new Date().toLocaleTimeString(
          "es-ES",
          {
            hour: "2-digit",
            minute: "2-digit",
          },
        )}`,
        docInfoX,
        footerY + 17,
        { width: 180, align: "right" },
      );

      doc.text("Documento Confidencial - Uso Interno", docInfoX, footerY + 29, {
        width: 180,
        align: "right",
      });

      // Finalizar
      doc.end();
    } catch (error) {
      // Si el documento ya comenzó a escribirse, terminarlo limpiamente
      if (doc && !doc._readableState.ended) {
        try {
          doc.end();
        } catch (e) {}
      }

      // Solo enviar error si no se han enviado headers
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Error generando reporte de usuarios",
          error: error.message,
          stack:
            process.env.NODE_ENV === "development" ? error.stack : undefined,
        });
      } else {
      }
    }
  }
}

module.exports = new UsersReportController();
