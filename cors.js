const cors = require("cors");

const corsConfig = {
  origin: "*", // o usa tu lista de AllowedOrigins aquí
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
};

module.exports = function (app) {
  app.use(cors(corsConfig));
};
