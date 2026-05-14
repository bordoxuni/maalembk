const errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Erreur serveur',
  });
};

module.exports = { errorHandler };