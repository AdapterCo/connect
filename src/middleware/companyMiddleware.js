function companyMiddleware(req, res, next) {
  if (req.user && req.user.company_id) {
    req.companyId = req.user.company_id;
  }
  next();
}

module.exports = companyMiddleware;
