const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const secretKey = 'tu-clave-secreta'; // Usa dotenv en producción

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a la base de datos con pool
const pool = mysql.createPool({
  host: '3.19.30.127',
  user: 'practicas',
  password: 'Practicas#123',
  database: 'Practicas',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==========================
// RUTA: Registrar cliente + cuenta
// ==========================
app.post('/api/cuentas', (req, res) => {
  try {
    const { dpi, nombre, fechaNacimiento, direccion, tipoCuenta } = req.body;

    if (!dpi || !nombre || !fechaNacimiento || !direccion || !tipoCuenta) {
      return res.status(400).json({ mensaje: "Todos los campos son obligatorios" });
    }

    let fechaSql = fechaNacimiento;
    if (fechaNacimiento.includes("/")) {
      const partes = fechaNacimiento.split("/");
      if (partes.length === 3) {
        const [dia, mes, anio] = partes;
        fechaSql = `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
      } else {
        return res.status(400).json({ mensaje: "Formato de fecha inválido. Usa DD/MM/YYYY" });
      }
    }

    const queryCliente = `
      INSERT INTO mg_cliente (dpi, nombre, fechaNacimiento, direccion, tipoCuenta)
      VALUES (?, ?, ?, ?, ?)
    `;

    pool.query(queryCliente, [dpi, nombre, fechaSql, direccion, tipoCuenta], (err, results) => {
      if (err) return res.status(500).json({ error: "Error al registrar cliente" });

      const idCliente = results.insertId;
      const numeroCuenta = idCliente.toString();
      const saldoInicial = 0.0;

      const queryCuenta = `
        INSERT INTO mg_cuenta (id_cliente, tipo_cuenta, numero_cuenta, saldo)
        VALUES (?, ?, ?, ?)
      `;

      pool.query(queryCuenta, [idCliente, tipoCuenta, numeroCuenta, saldoInicial], (err2, results2) => {
        if (err2) return res.status(500).json({ error: "Error al registrar cuenta" });

        res.status(201).json({
          mensaje: "Cliente y cuenta creados correctamente",
          idCliente,
          idCuenta: results2.insertId,
          numeroCuenta
        });
      });
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error interno del servidor" });
  }
});

// ==========================
// RUTA: Registrar transacción
// ==========================
app.post('/api/transacciones', (req, res) => {
  const { cuenta_id, monto, tipooperacion, idCliente, cuenta } = req.body;

  if (!cuenta_id || !monto || !tipooperacion) {
    return res.status(400).json({ mensaje: "Faltan datos obligatorios" });
  }

  pool.query('SELECT id FROM mg_cuenta WHERE id = ?', [cuenta_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: "Cuenta inválida: no existe en mg_cuenta" });
    }

    const query = `
      INSERT INTO mgprf_transaccion (cuenta_id, monto, tipooperacion, idCliente, cuenta)
      VALUES (?, ?, ?, ?, ?)
    `;

    pool.query(query, [cuenta_id, monto, tipooperacion, idCliente || null, cuenta || null], (err2, results) => {
      if (err2) return res.status(500).json({ error: err2.message });

      res.status(201).json({ mensaje: 'Transacción realizada', id: results.insertId });
    });
  });
});

// ==========================
// RUTA: Obtener TODAS las transacciones por cuenta_id
// ==========================
app.get('/api/transacciones/:cuentaId', (req, res) => {
  const { cuentaId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  const query = `
    SELECT id, cuenta_id, monto, tipooperacion, idCliente, cuenta
    FROM mgprf_transaccion
    WHERE cuenta_id = ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  pool.query(query, [cuentaId, limit, offset], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json(results);
  });
});

// ==========================
// RUTA: Registrar usuario
// ==========================
app.post('/api/usuario', async (req, res) => {
  const { usuario, clave } = req.body;
  if (!usuario || !clave) return res.status(400).json({ mensaje: 'Faltan datos' });

  try {
    const hashedPassword = await bcrypt.hash(clave, 10);
    const query = 'INSERT INTO mg_usuario (usuario, clave) VALUES (?, ?)';
    pool.query(query, [usuario, hashedPassword], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ mensaje: 'Usuario registrado', id: results.insertId });
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al procesar la solicitud' });
  }
});

// ==========================
// RUTA: Login
// ==========================
app.post('/api/login', (req, res) => {
  const { usuario, clave } = req.body;
  const query = 'SELECT * FROM mg_usuario WHERE usuario = ?';

  pool.query(query, [usuario], async (err, results) => {
    if (err) return res.status(500).json({ mensaje: 'Error interno' });
    if (results.length === 0) return res.status(401).json({ mensaje: 'Usuario no encontrado' });

    const user = results[0];
    const isPasswordValid = await bcrypt.compare(clave, user.clave);
    if (!isPasswordValid) return res.status(401).json({ mensaje: 'Contraseña incorrecta' });

    const token = jwt.sign({ id: user.id, usuario: user.usuario }, secretKey, { expiresIn: '1h' });
    res.status(200).json({ mensaje: 'Login exitoso', token });
  });
});

// ==========================
// Iniciar servidor
// ==========================
app.listen(PORT, () => {
  console.log(`Servidor API en http://localhost:${PORT}`);
});
