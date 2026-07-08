/**
 * notify-reports.js — Rutas Bilbao
 *
 * Revisa la Realtime Database de Firebase buscando reportes de incidencia
 * que aún no se hayan notificado, y manda un correo (usando el mismo SMTP
 * institucional de Google Workspace que ya usa Comunica Bilbao) a:
 *   - los padres del alumno reportado
 *   - el correo del administrador, de Dirección del Colegio Bilbao y de Sección
 *     (capturados en la app, dentro de Admin → Configuración de notificaciones)
 *
 * Después de mandar el correo, marca el reporte como notificado
 * (notified: true) para no volver a enviarlo la siguiente vez que corra.
 *
 * Este script NO usa Cloud Functions ni requiere el plan Blaze — corre
 * gratis dentro de GitHub Actions y solo habla con la Realtime Database
 * por su API REST pública (igual de simple que una petición fetch normal).
 */

const nodemailer = require("nodemailer");

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL; // ej. https://rutas-bilbao-default-rtdb.firebaseio.com
const GMAIL_USER = process.env.GMAIL_USER;               // ej. avisos@bilbao.edu.mx
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const ROUTE_KEYS = ["r1", "r2", "r3", "r4", "r5"];
const ROUTE_NAMES = {
  r1: "Ruta 1 — Las Águilas",
  r2: "Ruta 2 — San Jerónimo",
  r3: "Ruta 3 — La Herradura",
  r4: "Ruta 4 — Reforma",
  r5: "Ruta 5 — Constituyentes",
};

async function getJSON(path) {
  const res = await fetch(`${DATABASE_URL}/${path}.json`);
  if (!res.ok) throw new Error(`Error leyendo ${path}: ${res.status}`);
  return res.json();
}

async function patchJSON(path, data) {
  const res = await fetch(`${DATABASE_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Error escribiendo ${path}: ${res.status}`);
}

async function main() {
  if (!DATABASE_URL || !GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error("Faltan variables de entorno (FIREBASE_DATABASE_URL, GMAIL_USER, GMAIL_APP_PASSWORD).");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const cfg = (await getJSON("config/notifyEmails")) || {};
  const adminEmails = [cfg.admin, cfg.colegio, cfg.seccion].filter(Boolean);

  let totalSent = 0;

  for (const routeId of ROUTE_KEYS) {
    const incidentes = await getJSON(`incidentes/${routeId}`);
    if (!incidentes) continue;

    const padresObj = (await getJSON(`padres/${routeId}`)) || {};
    const padresList = Object.values(padresObj);

    for (const [incidentId, incident] of Object.entries(incidentes)) {
      if (incident.notified) continue; // ya se mandó antes

      const padresDelAlumno = padresList.filter(
        (p) => p.studentId === incident.studentId && p.email
      );
      const destinatarios = Array.from(
        new Set([...padresDelAlumno.map((p) => p.email), ...adminEmails])
      );

      if (destinatarios.length === 0) {
        console.log(`Reporte ${incidentId} (${routeId}): sin destinatarios configurados, se omite.`);
        continue;
      }

      const routeName = ROUTE_NAMES[routeId] || routeId;
      const mailOptions = {
        from: `"Rutas Bilbao" <${GMAIL_USER}>`,
        to: destinatarios,
        subject: `Reporte de transporte — ${incident.student} (${routeName})`,
        text:
          `Se generó un nuevo reporte de transporte escolar.\n\n` +
          `Alumno: ${incident.student}\n` +
          `Ruta: ${routeName}\n` +
          `Tipo: ${incident.type}\n` +
          `Descripción: ${incident.desc}\n` +
          `Fecha: ${incident.date}\n`,
        html:
          `<h2>Reporte de transporte escolar</h2>` +
          `<p><strong>Alumno:</strong> ${incident.student}</p>` +
          `<p><strong>Ruta:</strong> ${routeName}</p>` +
          `<p><strong>Tipo:</strong> ${incident.type}</p>` +
          `<p><strong>Descripción:</strong> ${incident.desc}</p>` +
          `<p><strong>Fecha:</strong> ${incident.date}</p>`,
      };

      try {
        await transporter.sendMail(mailOptions);
        await patchJSON(`incidentes/${routeId}/${incidentId}`, { notified: true });
        console.log(`Reporte ${incidentId} (${routeId}): correo enviado a ${destinatarios.length} destinatario(s).`);
        totalSent++;
      } catch (err) {
        console.error(`Reporte ${incidentId} (${routeId}): error al enviar —`, err.message);
      }
    }
  }

  console.log(`Listo. Correos enviados en esta corrida: ${totalSent}.`);
}

main().catch((err) => {
  console.error("Error general:", err);
  process.exit(1);
});
