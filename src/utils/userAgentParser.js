/**
 * Traduce el User-Agent a un formato legible: "Navegador en Sistema Operativo".
 * Optimizado para entornos de oficina (Chrome, Edge, Firefox, Safari).
 */
exports.parseUserAgent = (ua) => {
    if (!ua) return "Desconocido";

    let os = "OS Desconocido";
    let browser = "Navegador Desconocido";

    // 1. Detectar Sistema Operativo
    if (ua.includes("Windows NT 10.0")) os = "Windows 10/11";
    else if (ua.includes("Windows NT 6.1")) os = "Windows 7";
    else if (ua.includes("Macintosh")) os = "macOS";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
    else if (ua.includes("Linux")) os = "Linux";

    // 2. Detectar Navegador
    // Nota: El orden importa porque muchos navegadores incluyen la palabra "Safari" o "Chrome"
    if (ua.includes("Edg/")) browser = "Microsoft Edge";
    else if (ua.includes("Chrome") && !ua.includes("Edg/")) browser = "Google Chrome";
    else if (ua.includes("Firefox/")) browser = "Mozilla Firefox";
    else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Apple Safari";

    return `${browser} en ${os}`;
};