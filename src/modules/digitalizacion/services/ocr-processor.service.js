// services/ocr-processor.service.js
const axios = require('axios');
const FormData = require('form-data');

class OCRProcessorService {
    constructor() {
        this.pythonBaseURL = process.env.PYTHON_API_URL || 'http://localhost:8000/api/pdf';
        this.pollingInterval = 5000; // 5s
        this.maxRetries = 3;
    }

    /**
     * Enviar PDF a Python para OCR
     * Devuelve:
     * - pythonPdfId: pdf_id generado por Python (clave principal para status y descargas)
     * - taskId: task_id (si hubo celery), opcional
     */
    async enviarPDFParaOCR(pdfBuffer, filename) {
        try {
            const formData = new FormData();
            formData.append('file', pdfBuffer, {
                filename,
                contentType: 'application/pdf'
            });

            const response = await axios.post(
                `${this.pythonBaseURL}/upload?use_ocr=true`,
                formData,
                {
                    headers: { ...formData.getHeaders() },
                    timeout: 120000
                }
            );

            return {
                success: true,
                taskId: response.data.task_id || "",
                pythonPdfId: response.data.pdf_id, // ESTE es el que se usa para /upload-status y descargas
                status: 'pending'
            };

        } catch (error) {
            console.error(
                'Error enviando PDF a Python:',
                error.response?.data || error.message
            );
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Verificar estado en Python SIN /list
     * Usa /upload-status/{pdf_id}
     */
    async verificarEstadoOCRUnico(pythonPdfId, timeoutMs = 10000) {
        try {
            const response = await axios.get(
                `${this.pythonBaseURL}/upload-status/${pythonPdfId}`,
                { timeout: timeoutMs }
            );

            const data = response.data || {};

            return {
                success: data.status === 'completed',
                status: data.status, // pending | processing | completed | failed
                progress: data.progress ?? 0,
                pythonPdfId: data.pdf_id || pythonPdfId,
                extractedTextPath: data.extracted_text_path || null,
                usedOcr: data.used_ocr ?? null,
                error: data.error || null,
                taskId: data.task_id || ""
            };

        } catch (error) {
            // 404 => pdf_id aún no registrado en status (raro, pero posible por timing)
            const statusCode = error.response?.status;
            const detail = error.response?.data?.detail;

            return {
                success: false,
                status: statusCode === 404 ? 'pending' : 'error',
                progress: 0,
                pythonPdfId,
                extractedTextPath: null,
                usedOcr: null,
                error: detail || error.message,
                taskId: ""
            };
        }
    }

    /**
     * Descargar PDF procesado con OCR
     * Endpoint: /{pdf_id}/searchable-pdf
     */
    async descargarPDFConOCR(pythonPdfId) {
        try {
            const response = await axios.get(
                `${this.pythonBaseURL}/${pythonPdfId}/searchable-pdf`,
                { responseType: 'arraybuffer', timeout: 120000 }
            );

            return {
                success: true,
                pdfBuffer: Buffer.from(response.data),
                contentType: response.headers['content-type'] || 'application/pdf'
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                statusCode: error.response?.status
            };
        }
    }

    /**
     * Descargar texto extraído
     * Endpoint: /{pdf_id}/text
     */
    async descargarTextoOCR(pythonPdfId) {
        try {
            const response = await axios.get(
                `${this.pythonBaseURL}/${pythonPdfId}/text`,
                { timeout: 120000 }
            );

            // Si FastAPI devuelve FileResponse, puede venir como string o buffer según axios config
            // Aquí lo dejamos flexible
            return {
                success: true,
                text: response.data?.text ?? response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                statusCode: error.response?.status
            };
        }
    }

    /**
     * Procesar PDF completo con OCR (sync)
     * OJO: NO usa /list. Espera por /upload-status/{pdf_id}
     */
    async procesarPDFConOCR(pdfBuffer, filename, opciones = {}) {
        const {
            maxWaitMs = 5 * 60 * 1000, // 5 min
            pollMs = this.pollingInterval
        } = opciones;

        try {
            const envio = await this.enviarPDFParaOCR(pdfBuffer, filename);
            if (!envio.success) throw new Error(envio.error);

            const pythonPdfId = envio.pythonPdfId;
            const start = Date.now();

            // Poll hasta completed/failed/timeout
            while (true) {
                const estado = await this.verificarEstadoOCRUnico(pythonPdfId, 10000);

                if (estado.status === 'completed') break;
                if (estado.status === 'failed') {
                    throw new Error(estado.error || 'Procesamiento OCR falló');
                }

                if (Date.now() - start > maxWaitMs) {
                    throw new Error('Timeout esperando procesamiento OCR');
                }

                await new Promise(r => setTimeout(r, pollMs));
            }

            const [pdfResult, textResult] = await Promise.all([
                this.descargarPDFConOCR(pythonPdfId),
                this.descargarTextoOCR(pythonPdfId)
            ]);

            if (!pdfResult.success || !textResult.success) {
                const err = pdfResult.error || textResult.error || 'Error descargando resultados';
                throw new Error(err);
            }

            return {
                success: true,
                pdfBuffer: pdfResult.pdfBuffer,
                text: textResult.text,
                pythonPdfId
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new OCRProcessorService();