const express = require('express');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const corsSetup = require('./cors'); // Esta es la función que recibe app

const app = express();

// Configuración de CORS (llama la función que está en cors.js y le pasa app)
corsSetup(app);

app.use(express.json());  // Para poder manejar JSON en las solicitudes

// Configuración de la conexión a MySQL
const pool = mysql.createPool({
  host: 'btabo9fmg623iuttzdn2-mysql.services.clever-cloud.com',
  user: 'udov88atyxwjvyo9',
  password: 'RtiWcg5Rjeb1BRzoQJOa',
  database: 'btabo9fmg623iuttzdn2',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Conectar a la base de datos
pool.query('SELECT 1', (err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
  } else {
    console.log('Conexión MySQL verificada');
  }
});


//-------------------------------------------------------------------------------------------
// Ruta para obtener los grados específicos de un grado
app.get('/grados-especificos/:id_grado', (req, res) => {
  const idGrado = req.params.id_grado;

  // Primero verificar si este grado debería tener subgrados
  const gradosSinSubgrados = [1, 2, 3]; // IDs de Prekinder, Kinder, Prepa
  if (gradosSinSubgrados.includes(parseInt(idGrado))) {
    return res.json([]); // Devuelve array vacío para grados que no tienen subgrados
  }

  const query = `
      SELECT * FROM grados_especificos
      WHERE id_grado = ?
  `;

  pool.query(query, [idGrado], (err, results) => {
      if (err) {
          console.error('Error ejecutando la consulta:', err);
          return res.status(500).json({ error: 'Error en el servidor' });
      }
      res.json(results); // Devuelve los subgrados encontrados (puede ser array vacío)
  });
});

//-----------------------------------------------------------------------------------------------

// Ruta para obtener los grados
app.get('/grados', (req, res) => {
  const query = 'SELECT * FROM grados';
  pool.query(query, (err, results) => {
    if (err) {
      console.error('Error ejecutando la consulta:', err);
      res.status(500).send('Error en el servidor');
      return;
    }
    res.json(results);
  });
});

//-----------------------------------------------------------------------------------------------

// En tu archivo App-asistencia.js o similar
app.get('/asistencia/grados', (req, res) => {
  const sql = `
    SELECT 
      g.nombre AS grado,
      COALESCE(SUM(CASE WHEN a.estado = 'P' THEN 1 ELSE 0 END), 0) AS Presente,
      COALESCE(SUM(CASE WHEN a.estado = 'T' THEN 1 ELSE 0 END), 0) AS Tardanza,
      COALESCE(SUM(CASE WHEN a.estado = 'A' THEN 1 ELSE 0 END), 0) AS Ausente
    FROM grados g
    LEFT JOIN alumnos al ON al.id_grado = g.id_grado
    LEFT JOIN asistencia a ON a.id_alumno = al.id_alumno
    GROUP BY g.nombre
    ORDER BY 
      FIELD(g.nombre, 'Pre-Kinder', 'Kinder', 'Prepa', 'Primaria menor', 'Primaria mayor', 'Básicos', 'Diversificado');
  `;
  
  pool.query(sql, (err, resultado) => {
      if (err) {
          console.error('Error al obtener datos:', err);
          return res.status(500).json({ error: 'Error al obtener datos' });
      }
            
      res.json(resultado);
  });
});

//-----------------------------------------------------------------------------------------------

// Agrega esto ANTES de tus rutas
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Endpoint para obtener alumnos por subgrado específico
app.get('/asistencia/alumnos-subgrado/:id_grado_especifico', (req, res) => {
  const { id_grado_especifico } = req.params;
  
  // Validación del parámetro
  if (!id_grado_especifico || isNaN(id_grado_especifico)) {
      return res.status(400).json({
          error: 'ID de subgrado inválido',
          detalles: 'El ID debe ser un número'
      });
  }

  const sql = `
      SELECT 
          al.id_alumno,
          CONCAT(al.nombre, ' ', al.apellido) AS nombre_completo,
          g.nombre AS nombre_grado,
          ge.nombre AS nombre_grado_especifico,
          COALESCE(SUM(a.estado = 'P'), 0) AS Presente,
          COALESCE(SUM(a.estado = 'T'), 0) AS Tardanza,
          COALESCE(SUM(a.estado = 'A'), 0) AS Ausente
      FROM alumnos al
      LEFT JOIN asistencia a ON a.id_alumno = al.id_alumno
      LEFT JOIN grados g ON al.id_grado = g.id_grado
      LEFT JOIN grados_especificos ge ON al.id_grado_especifico = ge.id
      WHERE al.id_grado_especifico = ?
      GROUP BY al.id_alumno
      ORDER BY al.apellido, al.nombre;
  `;
  
  pool.query(sql, [id_grado_especifico], (err, resultado) => {
      if (err) {
          console.error('Error en la consulta SQL:', err);
          return res.status(500).json({
              error: 'Error en la base de datos',
              detalles: err.message
          });
      }
      
      if (resultado.length === 0) {
          return res.status(404).json({
              error: 'No se encontraron alumnos',
              detalles: `No hay alumnos en el subgrado con ID ${id_grado_especifico}`
          });
      }
      
      res.json(resultado);
  });
});

//-----------------------------------------------------------------------------------------------

// En tu backend (server.js)
app.get('/verificar-asistencia/:idGrado/:fecha', (req, res) => {
  const { idGrado, fecha } = req.params;
  
  const query = `
      SELECT COUNT(*) as count 
      FROM asistencia 
      WHERE id_alumno IN (
          SELECT id_alumno FROM alumnos 
          WHERE id_grado = ? OR id_grado_especifico = ?
      ) 
      AND fecha = ?
  `;
  
  pool.query(query, [idGrado, idGrado, fecha], (err, results) => {
      if (err) {
          return res.status(500).json({ error: err.message });
      }
      res.json({ tieneAsistencia: results[0].count > 0 });
  });
});

//-----------------------------------------------------------------------------------------------

app.get('/api/profesores', async (req, res) => {
  try {
      const [result] = await pool.promise().query('SELECT * FROM profesores');
      res.json(result);
  } catch (error) {
      console.error('Error al obtener profesores:', error);
      res.status(500).json({ error: 'Error al obtener profesores' });
  }
});

//-------------------------------------------------------------------------------------------------

app.post('/api/validar-password', (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ valid: false, message: 'Faltan datos.' });
  }

  pool.query('SELECT contrasena FROM Administradores WHERE correo = ?', [correo], (err, results) => {
    if (err) {
      console.error('Error en la consulta:', err);
      return res.status(500).json({ valid: false, message: 'Error del servidor.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ valid: false, message: 'Administrador no encontrado.' });
    }

    const contrasenaGuardada = results[0].contrasena;

    // Compara directamente (si no usas bcrypt)
    if (contrasena === contrasenaGuardada) {
      return res.json({ valid: true });
    } else {
      return res.json({ valid: false, message: 'Contraseña incorrecta.' });
    }
  });
});

//-------------------------------------------------------------------------------------------------

app.delete('/profesores/:id', (req, res) => {
  const id = req.params.id;
  console.log('Intentando eliminar profesor con ID:', id);

  if (!id) {
    return res.status(400).json({ mensaje: 'ID inválido' });
  }

  // Cambiar 'id' por 'id_profesor'
  const sql = 'DELETE FROM profesores WHERE id_profesor = ?';

  pool.query(sql, [id], (err, resultado) => {
    if (err) {
      console.error('Error al eliminar profesor:', err);
      return res.status(500).json({ mensaje: 'Error al eliminar profesor' });
    }

    console.log('Resultado de la eliminación:', resultado);

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Profesor no encontrado' });
    }

    res.json({ mensaje: 'Profesor eliminado correctamente' });
  });
});

//-------------------------------------------------------------------------------------------------

// Nueva ruta para crear profesor
app.post('/appi/crear-profesor', async (req, res) => {
  const { nombre, correo, password } = req.body;

  if (!nombre || !correo || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios.' });
  }

  try {
      const sql = 'INSERT INTO profesores (nombre, email, password) VALUES (?, ?, ?)';
      const result = await pool.execute(sql, [nombre, correo, password]);

      res.status(201).json({ message: 'Profesor agregado correctamente', id: result.insertId });
  } catch (error) {
      console.error('Error al insertar profesor:', error);
      res.status(500).json({ message: 'Error al insertar el profesor en la base de datos.' });
  }
});

//-------------------------------------------------------------------------------------------------

// Endpoint para obtener la lista de grados generales
app.get('/grados/lista', (req, res) => {
  const sql = `
      SELECT id_grado, nombre 
      FROM grados
      ORDER BY nombre;
  `;
  
  pool.query(sql, (err, resultado) => {
      if (err) {
          console.error('Error al obtener grados:', err);
          return res.status(500).json({ 
              error: 'Error en la base de datos',
              detalles: err.message
          });
      }
      
      // Verificar si hay resultados
      if (resultado.length === 0) {
          return res.status(404).json({
              error: 'No se encontraron grados',
              detalles: 'No hay grados registrados en la base de datos'
          });
      }
      
      res.json(resultado);
  });
});

// Endpoint para obtener la lista de grados específicos
app.get('/grados-especificos/lista/:id_grado', (req, res) => {
  const { id_grado } = req.params;
  
  // Validación del parámetro (NUEVO)
  if (!id_grado || isNaN(id_grado)) {
      return res.status(400).json({ 
          error: 'ID de grado inválido',
          detalles: 'El ID debe ser un número'
      });
  }

  const sql = `
      SELECT id, nombre 
      FROM grados_especificos
      WHERE id_grado = ?
      ORDER BY nombre;
  `;
  
  pool.query(sql, [id_grado], (err, resultado) => {
      if (err) {
          console.error('Error en la consulta SQL:', err);
          return res.status(500).json({ 
              error: 'Error en la base de datos',
              detalles: err.message
          });
      }
      
      // Verificar si hay resultados (NUEVO)
      if (resultado.length === 0) {
          return res.status(404).json({
              error: 'No se encontraron subgrados',
              detalles: `No hay subgrados para el grado con ID ${id_grado}`
          });
      }
      
      res.json(resultado);
  });
});

//-------------------------------------------------------------------------------------------------

// Modifica la ruta /asistencia/alumno/:id_alumno para incluir reportes
app.get('/asistencia/alumno/:id_alumno', async (req, res) => {
  const { id_alumno } = req.params;

  try {
    // 1. Datos de asistencia
    const [asistencia] = await pool.promise().query({
      sql: `
        SELECT estado, COUNT(*) as cantidad 
        FROM asistencia 
        WHERE id_alumno = ? 
        GROUP BY estado`,
      values: [id_alumno]
    });
  
    // 2. Info del alumno
    const [alumno] = await pool.promise().query(
      `SELECT id_alumno, nombre, apellido FROM alumnos WHERE id_alumno = ?`,
      [id_alumno]
    );
  
    // 3. Datos de reportes (si los necesitas)
    const [reportes] = await pool.promise().query(
      `SELECT tipo, COUNT(*) as total 
       FROM reportes 
       WHERE id_alumno = ? 
       GROUP BY tipo`,
      [id_alumno]
    );
  
    // Formatear respuesta
    const response = {
      Presente: asistencia.find(a => a.estado === 'P')?.cantidad || 0,
      Tardanza: asistencia.find(a => a.estado === 'T')?.cantidad || 0,
      Ausente: asistencia.find(a => a.estado === 'A')?.cantidad || 0,
      alumno: {
        id_alumno: id_alumno,
        nombre_completo: alumno[0] ? `${alumno[0].nombre} ${alumno[0].apellido}` : 'Alumno desconocido'
      },
      reportes: {
        total_reportes: reportes.reduce((acc, curr) => acc + curr.total, 0),
        reportes_uniforme: reportes.find(r => r.tipo === 'uniforme')?.total || 0,
        reportes_comportamiento: reportes.find(r => r.tipo === 'comportamiento')?.total || 0
      }
    };
  
    // Asegurarse de enviar la respuesta
    res.json(response);
  
  } catch (error) {
    console.error('Error en endpoint /asistencia/alumno:', error);
    res.status(500).json({ 
      error: 'Error al obtener asistencia',
      detalle: error.message
    });
  }
});

//-------------------------------------------------------------------------------------------------

// Ruta para verificar si un grado tiene subgrados
app.get('/grado-tiene-subgrados/:id_grado', (req, res) => {
  const idGrado = req.params.id_grado;
  const gradosSinSubgrados = [1, 2, 3]; // IDs de Prekinder, Kinder, Prepa
  
  res.json({
    tieneSubgrados: !gradosSinSubgrados.includes(parseInt(idGrado))
  });
});

//-------------------------------------------------------------------------------------------------

//Ruta para agregar alumnos
app.post('/agregar-alumno', (req, res) => {
  const { nombre, apellido, edad, correo, id_grado_especifico } = req.body;
  
  const query = `
      INSERT INTO alumnos 
      (nombre, apellido, edad, correo_institucional, id_grado_especifico) 
      VALUES (?, ?, ?, ?, ?)
  `;
  
  pool.query(query, 
      [nombre, apellido, edad, correo, id_grado_especifico], 
      (err, results) => {
          if (err) {
              console.error('Error al agregar alumno:', err);
              return res.status(500).json({ error: 'Error al agregar alumno' });
          }
          res.json({ message: 'Alumno agregado correctamente', id: results.insertId });
      });
});

//-------------------------------------------------------------------------------------------------------

// Ruta mejorada para obtener alumnos con información de grado
app.get('/alumnos-por-grado/:id_grado', (req, res) => {
  const idGrado = req.params.id_grado;
  const tipo = req.query.tipo; // 'principal' o 'especifico'

  let query;
  
  if (tipo === 'principal') {
    query = `
      SELECT a.*, g.nombre as nombre_grado
      FROM alumnos a
      JOIN grados g ON a.id_grado = g.id_grado
      WHERE a.id_grado = ? AND (a.id_grado_especifico IS NULL OR a.id_grado_especifico = 0)
    `;
  } else {
    query = `
      SELECT a.*, ge.nombre as nombre_grado_especifico, g.nombre as nombre_grado
      FROM alumnos a
      JOIN grados_especificos ge ON a.id_grado_especifico = ge.id
      JOIN grados g ON ge.id_grado = g.id_grado
      WHERE a.id_grado_especifico = ?
    `;
  }

  pool.query(query, [idGrado], (err, results) => {
    if (err) {
      console.error('Error ejecutando la consulta:', err);
      return res.status(500).json({ 
        error: 'Error en el servidor',
        detalles: err.message 
      });
    }
    
    // Formatear datos para mejor visualización
    const alumnosFormateados = results.map(alumno => ({
      id: alumno.id_alumno,
      nombre_completo: `${alumno.nombre} ${alumno.apellido}`,
      edad: alumno.edad,
      correo: alumno.correo_institucional,
      grado: alumno.nombre_grado,
      grado_especifico: alumno.nombre_grado_especifico || 'N/A'
    }));
    
    res.json({
      success: true,
      count: results.length,
      data: alumnosFormateados
    });
  });
});

//---------------------------------------------------------------------------------------------

// Ruta para registrar la asistencia
app.post('/registrar-asistencia', (req, res) => {
  const asistencias = req.body;
  
  if (!Array.isArray(asistencias)) {
      return res.status(400).json({ error: 'Datos de asistencia no válidos' });
  }
  
  const valores = asistencias.map(a => [a.id_alumno, a.fecha, a.estado]);
  
  const query = `
      INSERT INTO asistencia (id_alumno, fecha, estado) 
      VALUES ?
      ON DUPLICATE KEY UPDATE estado = VALUES(estado)
  `;
  
  pool.query(query, [valores], (err, results) => {
      if (err) {
          console.error('Error al guardar la asistencia:', err);
          return res.status(500).json({ error: 'Error al guardar la asistencia' });
      }
      
      res.json({ message: 'Asistencia registrada correctamente', affectedRows: results.affectedRows });
  });
});

//------------------------------------------------------------------------------------------------------------------

// Ruta para eliminar un alumno por id
app.delete('/eliminar-alumno/:id', (req, res) => {
  const id = req.params.id;

  pool.query('DELETE FROM alumnos WHERE id_alumno = ?', [id], (err, results) => {
    if (err) {
      console.error('Error eliminando alumno:', err);
      return res.status(500).json({ error: 'Error al eliminar alumno' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    res.json({ message: 'Alumno eliminado correctamente' });
  });
});

//------------------------------------------------------------------------------------------------------------------

// Ruta para guardar reportes de uniforme
app.post('/reportes/registrar', async (req, res) => {
  const { id_alumno, id_profesor, prendas, mensaje, tipo = 'uniforme' } = req.body;

  // Validación básica
  if (!id_alumno || !id_profesor || !mensaje) {
    return res.status(400).json({ 
      error: 'Datos incompletos',
      detalles: 'Se requieren id_alumno, id_profesor y mensaje'
    });
  }

  if (tipo === 'uniforme' && (!prendas || !Array.isArray(prendas))) {
    return res.status(400).json({ 
      error: 'Datos inválidos',
      detalles: 'Para reportes de uniforme, se requiere un array de prendas'
    });
  }

  try {
    // 1. Guardar en base de datos
    const [result] = await pool.promise().query(
      `INSERT INTO reportes 
       (id_alumno, id_profesor, tipo, prendas, mensaje) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        id_alumno, 
        id_profesor, 
        tipo,
        tipo === 'uniforme' ? JSON.stringify(prendas) : null,
        mensaje
      ]
    );

    // 2. Obtener el correo del alumno
    const [alumnoRows] = await pool.promise().query(
      `SELECT correo_institucional FROM alumnos WHERE id_alumno = ?`,
      [id_alumno]
    );
      
    if (alumnoRows.length === 0) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const correoAlumno = alumnoRows[0].correo_institucional;

    // 3. Intentar enviar correo (pero no fallar si hay error)
    try {
      await enviarCorreo(correoAlumno, prendas, mensaje);
      return res.json({ 
        success: true,
        message: 'Reporte registrado y correo enviado correctamente',
        id_reporte: result.insertId
      });
    } catch (emailError) {
      console.error('Error al enviar correo:', emailError);
      return res.json({ 
        success: true,
        message: 'Reporte registrado, pero hubo un problema al enviar el correo',
        id_reporte: result.insertId,
        warning: emailError.message
      });
    }

  } catch (error) {
    console.error('Error al registrar reporte:', error);
    res.status(500).json({ 
      error: 'Error en el servidor',
      detalles: error.message
    });
  }
});

//---------------------------------------------------------------------------------------------------

app.post('/verificar-contrasena', async (req, res) => {
  const { nombre, contrasena } = req.body;


  if (!nombre || !contrasena) {
    return res.status(400).json({ 
      success: false, 
      error: 'Nombre y contraseña son requeridos',
      valido: false
    });
  }

  try {
    // 1. Primero verifica si el profesor existe
    const [profesores] = await pool.promise().query(
      'SELECT * FROM profesores WHERE nombre = ? LIMIT 1', 
      [nombre]
    );

    if (profesores.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Profesor no encontrado',
        valido: false
      });
    }

    const profesor = profesores[0];
    
    // 2. Verifica que exista el campo password
    if (!profesor.password) {
      console.error('Estructura incorrecta:', profesor);
      return res.status(500).json({ 
        success: false, 
        error: 'Estructura de datos incorrecta',
        valido: false
      });
    }

    // 3. Compara contraseñas
    const esValida = await bcrypt.compare(contrasena, profesor.password);
    
    // 4. Respuesta
    res.json({ 
      success: true,
      valido: esValida,
      message: esValida ? 'Contraseña válida' : 'Contraseña incorrecta'
    });

  } catch (error) {
    console.error('Error completo:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error en el servidor',
      valido: false,
      detalle: {
        message: error.message,
        sqlMessage: error.sqlMessage,
        stack: error.stack
      }
    });
  }
});

//------------------------------------------------------------------------------------------------------------------

// Ruta para el login del profesor
app.post('/login', (req, res) => {
  const { nombre, password } = req.body;

  if (!nombre || !password) {
    return res.status(400).json({ message: 'Por favor, complete todos los campos.' });
  }

  pool.query('SELECT * FROM profesores WHERE nombre = ?', [nombre], (err, results) => {
    if (err) return res.status(500).json({ message: 'Error en el servidor.' });

    if (results.length === 0) {
      return res.status(401).json({ message: 'El profesor no está registrado.' });
    }

    const profesor = results[0];

    if (profesor.password !== password) {
      return res.status(401).json({ message: 'Contraseña incorrecta.' });
    }

    res.status(200).json({ message: 'Login exitoso.', profesor });
  });
});

//--------------------------------------------------------------------------------------------------

// Ruta para registrar un profesor
app.post('/registrar', (req, res) => {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({ message: 'Por favor, complete todos los campos.' });
  }

  // Verificar si el profesor ya existe
  pool.query('SELECT * FROM profesores WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ message: 'Error en el servidor.' });

    if (results.length > 0) {
      return res.status(400).json({ message: 'El correo ya está registrado.' });
    }

    // Guardar la contraseña sin encriptar
    const query = 'INSERT INTO profesores (email, password, nombre) VALUES (?, ?, ?)';
    pool.query(query, [email, password, nombre], (err, results) => {
      if (err) return res.status(500).json({ message: 'Error al registrar el profesor.' });
      res.status(201).json({ message: 'Profesor registrado exitosamente.' });
    });
  });
});

//------------------------------------------------------------------------------------------------------------------

// Ruta para login del administrador
app.post('/login-admin', (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ message: 'Por favor, complete todos los campos.' });
  }

  pool.query('SELECT * FROM Administradores WHERE correo = ?', [correo], (err, results) => {
    if (err) return res.status(500).json({ message: 'Error en el servidor.' });

    if (results.length === 0) {
      return res.status(401).json({ message: 'El administrador no está registrado.' });
    }

    const admin = results[0];

    if (admin.contrasena !== contrasena) {
      return res.status(401).json({ message: 'Contraseña incorrecta.' });
    }

    res.status(200).json({ message: 'Login exitoso.', admin });
  });
});

//------------------------------------------------------------------------------------------------------------------

// Ruta para registrar un administrador
app.post('/registrar-admin', (req, res) => {
  const { correo, contrasena, nombre } = req.body;

  if (!correo || !contrasena || !nombre) {
    return res.status(400).json({ message: 'Por favor, complete todos los campos.' });
  }

  // Verificar si el administrador ya existe
  pool.query('SELECT * FROM Administradores WHERE correo = ?', [correo], (err, results) => {
    if (err) return res.status(500).json({ message: 'Error en el servidor.' });

    if (results.length > 0) {
      return res.status(400).json({ message: 'El correo ya está registrado.' });
    }

    // Insertar nuevo administrador
    const query = 'INSERT INTO Administradores (correo, contrasena, nombre) VALUES (?, ?, ?)';
    pool.query(query, [correo, contrasena, nombre], (err, results) => {
      if (err) return res.status(500).json({ message: 'Error al registrar al administrador.' });
      res.status(201).json({ message: 'Administrador registrado exitosamente.' });
    });
  });
});

//------------------------------------------------------------------------------------------------------------------

const codigosRecuperacion = {}; // correo: código


// Ruta para enviar código de recuperación al correo
app.post('/send-code', async (req, res) => {
  const { correo } = req.body;

  if (!correo) {
    return res.status(400).json({ success: false, message: 'Correo es requerido.' });
  }

  const codigo = Math.floor(100000 + Math.random() * 900000); // Código aleatorio

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'samuelantoniojeronimorojas684@gmail.com',
      pass: 'qpag udtw mmdt mcia' // Contraseña de aplicación
    }
  });

  const mailOptions = {
    from: 'samuelantoniojeronimorojas684@gmail.com',
    to: correo,
    subject: 'Código de recuperación',
    text: `Tu código de recuperación es: ${codigo}`
  };

  try {
    codigosRecuperacion[correo] = codigo; // Guardar código temporalmente
    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al enviar el correo:', error);
    res.status(500).json({ success: false, message: 'No se pudo enviar el código' });
  }
});

//-----------------------------------------------------------------------------------------------

app.post('/verificar-codigo', async (req, res) => {
  const { correo, codigoIngresado } = req.body;

  if (!correo || !codigoIngresado) {
    return res.status(400).json({ success: false, message: 'Correo y código son requeridos.' });
  }

  const codigoValido = codigosRecuperacion[correo];
  if (!codigoValido || parseInt(codigoIngresado) !== codigoValido) {
    return res.status(400).json({ success: false, message: 'Código inválido o expirado.' });
  }

  try {
    // Obtener la contraseña del profesor
    const [rows] = await pool.promise().query(
      'SELECT password FROM profesores WHERE email = ?',
      [correo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Correo no registrado.' });
    }

    const contraseñaActual = rows[0].password;

    // Enviar la contraseña al correo
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'samuelantoniojeronimorojas684@gmail.com',
        pass: 'qpag udtw mmdt mcia' // Contraseña de aplicación
      }
    });

    const mailOptions = {
      from: 'samuelantoniojeronimorojas684@gmail.com',
      to: correo,
      subject: 'Tu contraseña actual',
      text: `Tu contraseña actual es: ${contraseñaActual}`
    };

    await transporter.sendMail(mailOptions);

    delete codigosRecuperacion[correo]; // Eliminar el código usado
    res.json({ success: true, message: 'Contraseña enviada al correo.' });

  } catch (error) {
    console.error('Error al recuperar la contraseña:', error);
    res.status(500).json({ success: false, message: 'Error al enviar la contraseña.' });
  }
});

//-----------------------------------------------------------------------------------------------

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'samuelantoniojeronimorojas684@gmail.com', // Tu correo
    pass: 'qpag udtw mmdt mcia' // Tu contraseña de aplicación
  }
});

const enviarCorreo = async (correoDestino, prendas, mensaje) => {
  try {
    const mailOptions = {
      from: '"Colegio - Sistema de Reportes" <samuelantoniojeronimorojas684@gmail.com>',
      to: correoDestino,
      subject: 'Notificación de Incumplimiento de Uniforme',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #d9534f;">Reporte de Uniforme</h2>
          <p>Se ha registrado un incumplimiento en tu uniforme escolar:</p>
          
          ${prendas.length > 0 ? `
          <h3>Prendas incumplidas:</h3>
          <ul>
            ${prendas.map(p => `<li>${p}</li>`).join('')}
          </ul>
          ` : ''}
          
          <h3>Observaciones del profesor:</h3>
          <p>${mensaje}</p>
          
          <hr>
          <p style="font-size: 0.8em; color: #777;">
            Por favor atender esta observación para evitar sanciones.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error al enviar correo:', error);
    throw new Error('No se pudo enviar el correo de notificación');
  }
};

//-----------------------------------------------------------------------------------------------

app.post('/enviar-correo', async (req, res) => {
  const { destinatario, prendas, mensaje } = req.body;

  // Validación básica
  if (!destinatario || !prendas) {
    return res.status(400).json({ 
      error: 'Faltan datos obligatorios (destinatario o prendas)' 
    });
  }

  try {
    const htmlContent = `
      <h2 style="color: #d9534f;">Notificación sobre tu uniforme</h2>
      ${prendas.length > 0 ? 
        `<p><strong>Prendas a corregir:</strong> ${prendas.join(', ')}</p>` : ''}
      ${mensaje ? `<p><strong>Mensaje del profesor:</strong> ${mensaje}</p>` : ''}
      <p style="font-size: 12px; color: #777;">
        Este es un mensaje automático, por favor no responder directamente.
      </p>
    `;

    const info = await transporter.sendMail({
      from: '"Colegio XYZ" <samuelantoniojeronimorojas684@gmail.com>', // Usa tu correo real
      to: destinatario,
      subject: 'Observación de uniforme escolar',
      html: htmlContent
    });

    console.log('Correo enviado a:', destinatario, 'ID:', info.messageId);
    res.json({ success: true });

  } catch (error) {
    console.error('Error al enviar correo:', error);
    res.status(500).json({ 
      error: 'Error al enviar el correo',
      detalle: error.message,
      stack: error.stack // Solo para desarrollo
    });
  }
});

//-----------------------------------------------------------------------------------------------

// Nuevo endpoint específico para mensajes generales
app.post('/enviar-mensaje-general', async (req, res) => {
  const { destinatarios, mensaje } = req.body;

  if (!destinatarios || !mensaje) {
    return res.status(400).json({ 
      error: 'Faltan datos obligatorios (destinatarios o mensaje)' 
    });
  }

  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4285f4;">Comunicado Oficial</h2>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
          <p style="margin: 0;">${mensaje}</p>
        </div>
        <p style="font-size: 12px; color: #777; margin-top: 20px;">
          Mensaje enviado automáticamente. Por favor no responder directamente.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: '"Colegio XYZ" <notificaciones@escuela.com>',
      bcc: destinatarios, // Usamos BCC para privacidad
      subject: 'Comunicado importante',
      html: htmlContent
    });

    console.log(`Correo enviado a ${destinatarios.length} alumnos`);
    res.json({ 
      success: true,
      message: `Mensaje enviado a ${destinatarios.length} destinatarios`
    });

  } catch (error) {
    console.error('Error al enviar correo general:', error);
    res.status(500).json({ 
      error: 'Error al enviar el correo',
      detalle: error.message
    });
  }
});

//-----------------------------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en ${PORT}`);
});
