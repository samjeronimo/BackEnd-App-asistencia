const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Importar bcrypt para encriptar contraseñas

const app = express();
const port = 3000;

// Configuración de CORS
app.use(cors());
app.use(express.json());  // Para poder manejar JSON en las solicitudes

// Configuración de la conexión a MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Sajeronimo2008_:)',
  database: 'examen_asistencia_2025'
});

// Conectar a la base de datos
connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});

// Ruta para obtener los grados
app.get('/grados', (req, res) => {
  const query = 'SELECT * FROM grados';
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error ejecutando la consulta:', err);
      res.status(500).send('Error en el servidor');
      return;
    }
    res.json(results);
  });
});



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

  connection.query(query, [idGrado], (err, results) => {
      if (err) {
          console.error('Error ejecutando la consulta:', err);
          return res.status(500).json({ error: 'Error en el servidor' });
      }
      res.json(results); // Devuelve los subgrados encontrados (puede ser array vacío)
  });
});


// Ruta para verificar si un grado tiene subgrados
app.get('/grado-tiene-subgrados/:id_grado', (req, res) => {
  const idGrado = req.params.id_grado;
  const gradosSinSubgrados = [1, 2, 3]; // IDs de Prekinder, Kinder, Prepa
  
  res.json({
    tieneSubgrados: !gradosSinSubgrados.includes(parseInt(idGrado))
  });
});


//Ruta para agregar alumnos
app.post('/agregar-alumno', (req, res) => {
  const { nombre, apellido, edad, correo, id_grado_especifico } = req.body;
  
  const query = `
      INSERT INTO alumnos 
      (nombre, apellido, edad, correo_institucional, id_grado_especifico) 
      VALUES (?, ?, ?, ?, ?)
  `;
  
  connection.query(query, 
      [nombre, apellido, edad, correo, id_grado_especifico], 
      (err, results) => {
          if (err) {
              console.error('Error al agregar alumno:', err);
              return res.status(500).json({ error: 'Error al agregar alumno' });
          }
          res.json({ message: 'Alumno agregado correctamente', id: results.insertId });
      });
});


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

  connection.query(query, [idGrado], (err, results) => {
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
  
  connection.query(query, [valores], (err, results) => {
      if (err) {
          console.error('Error al guardar la asistencia:', err);
          return res.status(500).json({ error: 'Error al guardar la asistencia' });
      }
      
      res.json({ message: 'Asistencia registrada correctamente', affectedRows: results.affectedRows });
  });
});



// Ruta para el login del profesor
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Por favor, complete todos los campos.' });
  }

  // Buscar al profesor por email
  connection.query('SELECT * FROM profesores WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error('Error en la consulta:', err);
      return res.status(500).json({ message: 'Error en el servidor.' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'El correo no está registrado.' });
    }

    const profesor = results[0];

    // Comparar la contraseña encriptada
    bcrypt.compare(password, profesor.password, (err, isMatch) => {
      if (err) {
        console.error('Error comparando contraseñas:', err);
        return res.status(500).json({ message: 'Error en el servidor.' });
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Contraseña incorrecta.' });
      }

      res.status(200).json({ message: 'Login exitoso.', profesor });
    });
  });
});


// Ruta para registrar un profesor
app.post('/registrar', async (req, res) => {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({ message: 'Por favor, complete todos los campos.' });
  }

  // Verificar si el profesor ya existe
  connection.query('SELECT * FROM profesores WHERE email = ?', [email], (err, results) => {
    if (err) {
      console.error('Error consultando la base de datos:', err);
      return res.status(500).json({ message: 'Error en el servidor.' });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: 'El correo ya está registrado.' });
    }

    // Encriptar la contraseña
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Error al encriptar la contraseña:', err);
        return res.status(500).json({ message: 'Error en el servidor.' });
      }

      // Registrar el nuevo profesor con la contraseña encriptada
      const query = 'INSERT INTO profesores (email, password, nombre) VALUES (?, ?, ?)';
      connection.query(query, [email, hashedPassword, nombre], (err, results) => {
        if (err) {
          console.error('Error al registrar el profesor:', err);
          return res.status(500).json({ message: 'Error al registrar el profesor.' });
        }
        res.status(201).json({ message: 'Profesor registrado exitosamente.' });
      });
    });
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
