const AllowedOrigins = [
  'http://127.0.1:5501',
  'http://127.0.1:5502',
  'http://localhost:5500',
  'https://github.com/samjeronimo',
  'https://github.com/samjeronimo/Aplicacion-de-asistencia-P1',
];

const corsConfig = {
  origin: function (origin, callback) {
    if (!origin || AllowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
};

app.use(cors(corsConfig));
