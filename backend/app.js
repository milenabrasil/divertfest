const express = require('express');
const brinquedoRoutes = require('./src/routes/brinquedoRoutes');
const errorHandler = require('./src/middlewares/errorHandler');

const app = express();

app.use(express.json());

app.use('/brinquedos', brinquedoRoutes);

// tratamento de erros 
app.use(errorHandler);

module.exports = app;